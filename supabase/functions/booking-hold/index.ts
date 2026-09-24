import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, googleToken, localIso } from "../_shared_google.ts";

const POLICY_TEXT = 'הנני מבינ/ה שלא ניתן לשנות תור בטווח 24 שעות מהמועד, כל שינוי בטווח זה יגרור תשלום של 150 ש"ח.';

function paymentUrl(template: string, bookingId: string, returnUrl: string) {
  return String(template || "")
    .replaceAll("{booking_id}", encodeURIComponent(bookingId))
    .replaceAll("{return_url}", encodeURIComponent(returnUrl || ""));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return Response.json({ error: "POST only" }, { status: 405, headers: corsHeaders });

  try {
    const body = await req.json();
    const { date, time, firstName, lastName, phone, email, reason, referral, privacyConsent, policyAccepted, returnUrl } = body;
    if (!date || !time || !firstName || !lastName || !phone || !reason || !referral || !privacyConsent || !policyAccepted) {
      return Response.json({ error: "missing_required_fields" }, { status: 400, headers: corsHeaders });
    }

    const duration = Number(Deno.env.get("INTAKE_DURATION_MINUTES") || 50);
    const token = await googleToken();
    const calendarId = Deno.env.get("GOOGLE_CALENDAR_ID") || "primary";
    const start = new Date(localIso(date, time));
    const end = new Date(start.getTime() + duration * 60000);

    const fb = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ timeMin: start.toISOString(), timeMax: end.toISOString(), timeZone: "Asia/Jerusalem", items: [{ id: calendarId }] })
    });
    if (!fb.ok) throw new Error("freebusy_failed");
    const fj = await fb.json();
    if ((fj.calendars?.[calendarId]?.busy || []).length) {
      return Response.json({ error: "slot_taken" }, { status: 409, headers: corsHeaders });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: held } = await supabase
      .from("intake_bookings")
      .select("id,hold_expires_at,status")
      .eq("booking_date", date)
      .eq("booking_time", `${time}:00`)
      .in("status", ["pending_payment", "awaiting_approval", "confirmed"])
      .order("created_at", { ascending: false })
      .limit(5);

    const now = Date.now();
    const conflicting = (held || []).some((row: any) => row.status === "confirmed" || !row.hold_expires_at || new Date(row.hold_expires_at).getTime() > now);
    if (conflicting) return Response.json({ error: "slot_held" }, { status: 409, headers: corsHeaders });

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { data: inserted, error } = await supabase.from("intake_bookings").insert({
      booking_date: date,
      booking_time: time,
      first_name: firstName,
      last_name: lastName,
      phone,
      email: email || null,
      reason,
      referral_source: referral,
      privacy_consent: true,
      policy_accepted: true,
      policy_text: POLICY_TEXT,
      hold_expires_at: expiresAt,
      payment_status: "pending",
      status: "pending_payment"
    }).select("id").single();
    if (error) throw error;

    const bookingId = inserted.id;
    return Response.json({
      bookingId,
      expiresAt,
      cardPaymentUrl: paymentUrl(Deno.env.get("CARD_PAYMENT_URL_TEMPLATE") || "", bookingId, returnUrl || ""),
      payboxUrl: paymentUrl(Deno.env.get("PAYBOX_URL_TEMPLATE") || "", bookingId, returnUrl || "")
    }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500, headers: corsHeaders });
  }
});
