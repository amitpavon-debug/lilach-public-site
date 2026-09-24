import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared_google.ts";
import { escapeHtml, randomToken, sendEmail, sendWhatsappTemplate, sha256Hex } from "../_shared_notifications.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return Response.json({ error: "POST only" }, { status: 405, headers: corsHeaders });

  const expected = Deno.env.get("PAYMENT_WEBHOOK_SECRET") || "";
  if (!expected || req.headers.get("x-payment-webhook-secret") !== expected) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: corsHeaders });
  }

  try {
    const { bookingId, paymentReference } = await req.json();
    if (!bookingId) return Response.json({ error: "bookingId required" }, { status: 400, headers: corsHeaders });

    // IMPORTANT: the payment-provider adapter must call this function only after it has independently verified the payment/webhook signature.
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: booking, error } = await supabase.from("intake_bookings").select("*").eq("id", bookingId).single();
    if (error || !booking) return Response.json({ error: "not_found" }, { status: 404, headers: corsHeaders });
    if (!booking.policy_accepted || !booking.privacy_consent) return Response.json({ error: "required_consent_missing" }, { status: 409, headers: corsHeaders });

    const approvalToken = randomToken();
    const approvalTokenHash = await sha256Hex(approvalToken);
    const { error: updateError } = await supabase.from("intake_bookings").update({
      payment_status: "paid",
      payment_reference: paymentReference || null,
      status: "awaiting_approval",
      approval_token_hash: approvalTokenHash,
      updated_at: new Date().toISOString()
    }).eq("id", bookingId);
    if (updateError) throw updateError;

    const base = Deno.env.get("APPROVE_BOOKING_PUBLIC_URL") || `${Deno.env.get("SUPABASE_URL")}/functions/v1/approve-booking`;
    const approvalUrl = `${base}?booking_id=${encodeURIComponent(bookingId)}&token=${encodeURIComponent(approvalToken)}`;
    const name = `${booking.first_name} ${booking.last_name}`;
    const lilachEmail = Deno.env.get("LILACH_NOTIFICATION_EMAIL") || "";
    const lilachPhone = Deno.env.get("LILACH_WHATSAPP_NUMBER") || "";

    const html = `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7;color:#263126;max-width:620px;margin:auto">
      <h2>התשלום אומת — נדרש אישור פגישה</h2>
      <p><b>${escapeHtml(name)}</b> שילמ/ה עבור פגישת אינטק.</p>
      <p><b>מועד:</b> ${escapeHtml(booking.booking_date)} · ${escapeHtml(String(booking.booking_time).slice(0,5))}<br>
      <b>טלפון:</b> ${escapeHtml(booking.phone)}<br><b>אימייל:</b> ${escapeHtml(booking.email || "לא נמסר")}<br>
      <b>מקור הגעה:</b> ${escapeHtml(booking.referral_source)}</p>
      <div style="padding:14px;border-radius:12px;background:#f6f1ed"><b>סיבת הפנייה</b><br>${escapeHtml(booking.reason)}</div>
      <p><b>מדיניות 24 שעות אושרה על ידי הפונה.</b></p>
      <p><a href="${escapeHtml(approvalUrl)}" style="display:inline-block;background:#4f5d48;color:white;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">אישור הפגישה</a></p>
    </div>`;

    const emailResult = await sendEmail({ to: lilachEmail, subject: `נדרש אישור לפגישת אינטק – ${name}`, html });
    const whatsappResult = await sendWhatsappTemplate({
      to: lilachPhone,
      templateName: Deno.env.get("WHATSAPP_LILACH_APPROVAL_TEMPLATE") || "lilach_booking_approval",
      params: [name, String(booking.booking_date), String(booking.booking_time).slice(0,5), booking.phone, booking.reason, booking.referral_source, approvalUrl]
    });

    return Response.json({ ok: true, status: "awaiting_approval", emailSent: emailResult.sent, whatsappSent: whatsappResult.sent }, { headers: corsHeaders });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500, headers: corsHeaders });
  }
});
