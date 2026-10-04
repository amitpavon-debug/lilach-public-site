import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function hmac(message: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  if (!apiKey || !to) return { sent: false, skipped: true };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "לילך פבון | טיפול רגשי <appointments@lilachpavon.co.il>",
      to: [to],
      subject,
      html,
    }),
  });
  if (!response.ok) {
    console.error("PAYMENT APPROVAL EMAIL ERROR:", response.status, await response.text());
    return { sent: false, skipped: false };
  }
  return { sent: true, skipped: false };
}

function labels(booking: any) {
  const appointmentTypeLabel = booking.appointment_type === "therapy" ? "טיפול רגשי" : "פגישת אינטייק ראשונית";
  const durationMinutes = booking.appointment_type === "therapy" ? 50 : 60;
  const meetingModeLabel = booking.meeting_mode === "zoom" ? "אונליין (Zoom)" : "בקליניקה";
  return { appointmentTypeLabel, durationMinutes, meetingModeLabel };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405, headers: corsHeaders });

  try {
    const secret = Deno.env.get("APPROVAL_LINK_SECRET") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const notifyEmail = Deno.env.get("LILACH_NOTIFICATION_EMAIL") || "";
    if (!secret) throw new Error("approval_link_secret_not_configured");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("missing_supabase_server_credentials");

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim();
    const bookingId = String(body?.bookingId || "").trim();
    const token = String(body?.token || body?.approvalToken || "").trim();
    if (!bookingId || !token || !["request_review", "verify_from_approval"].includes(action)) {
      return Response.json({ error: "invalid_request" }, { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: booking, error: bookingError } = await supabase
      .from("intake_bookings")
      .select("id,booking_date,booking_time,first_name,last_name,phone,email,reason,referral_source,status,payment_status,payment_amount,payment_verified_at,meeting_mode,appointment_type,approval_token_hash")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) return Response.json({ error: "booking_not_found" }, { status: 404, headers: corsHeaders });

    if (action === "request_review") {
      const expected = await hmac(`lilach-payment-claim:${bookingId}`, secret);
      if (!timingSafeEqual(token, expected)) return Response.json({ error: "invalid_token" }, { status: 401, headers: corsHeaders });

      if (booking.status === "confirmed") {
        return Response.json({ ok: true, alreadyProcessed: true, status: booking.status, paymentStatus: booking.payment_status }, { headers: corsHeaders });
      }
      const alreadyAwaitingApproval =
        booking.status === "awaiting_approval" && ["reported", "paid"].includes(booking.payment_status);
      if (!alreadyAwaitingApproval && booking.status !== "pending_payment") {
        return Response.json({ error: "booking_not_pending_payment", status: booking.status }, { status: 409, headers: corsHeaders });
      }

      const approvalToken = await hmac(`lilach-booking-approval:${booking.id}`, secret);
      const approvalTokenHash = await sha256(approvalToken);
      const approvalUrl = `https://www.lilachpavon.co.il/approval?bookingId=${encodeURIComponent(booking.id)}&token=${encodeURIComponent(approvalToken)}`;
      const nowIso = new Date().toISOString();

      if (!alreadyAwaitingApproval) {
        const { data: updated, error: updateError } = await supabase
          .from("intake_bookings")
          .update({
            payment_status: "reported",
            payment_amount: 150,
            payment_method: "paybox",
            payment_reference: "paybox_client_reported_150",
            payment_verification_requested_at: nowIso,
            status: "awaiting_approval",
            approval_token_hash: approvalTokenHash,
            hold_expires_at: null,
            updated_at: nowIso,
          })
          .eq("id", booking.id)
          .eq("status", "pending_payment")
          .select("id")
          .maybeSingle();
        if (updateError) throw updateError;
        if (!updated) return Response.json({ error: "booking_state_changed" }, { status: 409, headers: corsHeaders });
      }

      const { appointmentTypeLabel, durationMinutes, meetingModeLabel } = labels(booking);
      const name = [booking.first_name, booking.last_name].filter(Boolean).join(" ");
      const time = String(booking.booking_time || "").slice(0, 5);

      const html = `
        <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7;color:#263126;max-width:640px;margin:auto">
          <h2 style="margin-bottom:8px">בקשת תור חדשה — נדרש אישור</h2>
          <div style="background:#fff4df;border:1px solid #e9cf92;border-radius:14px;padding:16px;margin:18px 0">
            <p style="margin:0 0 8px;font-size:18px"><strong>הלקוח/ה דיווח/ה שביצע/ה תשלום של 150 ₪ ב-PayBox.</strong></p>
            <p style="margin:0"><strong>לפני אישור התור יש לבדוק באפליקציית PayBox שהתקבלו בפועל 150 ₪ מהלקוח/ה המתאים/ה.</strong></p>
          </div>
          <div style="background:#f7f5f2;border-radius:14px;padding:16px;margin:18px 0">
            <p style="margin:0 0 8px"><b>שם:</b> ${escapeHtml(name)}</p>
            <p style="margin:0 0 8px"><b>מועד:</b> ${escapeHtml(booking.booking_date)} · ${escapeHtml(time)}</p>
            <p style="margin:0 0 8px"><b>טלפון:</b> ${escapeHtml(booking.phone || "")}</p>
            <p style="margin:0 0 8px"><b>אימייל:</b> ${escapeHtml(booking.email || "")}</p>
            <p style="margin:0 0 8px"><b>סוג הפגישה:</b> ${escapeHtml(appointmentTypeLabel)} — ${durationMinutes} דקות</p>
            <p style="margin:0 0 8px"><b>אופן הפגישה:</b> ${escapeHtml(meetingModeLabel)}</p>
            <p style="margin:0"><b>מקור הפנייה:</b> ${escapeHtml(booking.referral_source || "לא נמסר")}</p>
          </div>
          <div style="background:#f7f5f2;border-radius:14px;padding:16px;margin:18px 0">
            <b>סיבת הפנייה</b><br>${escapeHtml(booking.reason || "")}
          </div>
          <p style="text-align:center;margin:24px 0">
            <a href="${escapeHtml(approvalUrl)}" style="display:inline-block;background:#2f6f63;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:12px">בדיקה ואישור התור</a>
          </p>
          <p style="font-size:13px;color:#687168">לחיצה על הקישור תפתח את מסך האישור. בעת האישור תתבקשי לאשר שבדקת ב-PayBox שהתקבלו 150 ₪.</p>
        </div>`;

      const emailResult = await sendEmail(
        notifyEmail,
        `נדרש אישור – דווח תשלום 150 ₪ – ${appointmentTypeLabel} – ${name || "פונה חדש"}`,
        html,
      );

      return Response.json({
        ok: true,
        status: "awaiting_approval",
        paymentStatus: booking.payment_status === "paid" ? "paid" : "reported",
        paymentAmount: 150,
        approvalRequested: true,
        resent: alreadyAwaitingApproval,
        emailSent: emailResult.sent,
        emailSkipped: emailResult.skipped,
      }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const expectedApprovalToken = await hmac(`lilach-booking-approval:${bookingId}`, secret);
    if (!timingSafeEqual(token, expectedApprovalToken)) {
      return Response.json({ error: "invalid_approval_token" }, { status: 401, headers: corsHeaders });
    }
    const receivedHash = await sha256(token);
    if (!booking.approval_token_hash || receivedHash !== booking.approval_token_hash) {
      return Response.json({ error: "invalid_approval_token" }, { status: 401, headers: corsHeaders });
    }

    if (booking.payment_status === "paid") {
      return Response.json({ ok: true, alreadyVerified: true, status: booking.status, paymentStatus: "paid" }, { headers: corsHeaders });
    }
    if (booking.status !== "awaiting_approval" || booking.payment_status !== "reported") {
      return Response.json({ error: "payment_not_reported_for_approval", status: booking.status, paymentStatus: booking.payment_status }, { status: 409, headers: corsHeaders });
    }

    const nowIso = new Date().toISOString();
    const { data: verified, error: verifyError } = await supabase
      .from("intake_bookings")
      .update({
        payment_status: "paid",
        payment_amount: 150,
        payment_method: "paybox",
        payment_reference: "paybox_manual_verified_during_approval",
        payment_verified_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", booking.id)
      .eq("status", "awaiting_approval")
      .eq("payment_status", "reported")
      .select("id")
      .maybeSingle();
    if (verifyError) throw verifyError;
    if (!verified) return Response.json({ error: "booking_state_changed" }, { status: 409, headers: corsHeaders });

    return Response.json({
      ok: true,
      status: "awaiting_approval",
      paymentStatus: "paid",
      paymentAmount: 150,
      verifiedAt: nowIso,
    }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("PAYMENT APPROVAL FLOW ERROR:", error);
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500, headers: corsHeaders });
  }
});
