import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { EMAIL_SIGNATURE_BASE64 } from "./email_signature.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

async function sha256(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function createCancellationToken(bookingId: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`lilach-booking-cancel:${bookingId}`));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateHe(dateValue: string) {
  const [year, month, day] = String(dateValue).split("-");
  if (!year || !month || !day) return String(dateValue || "");
  return `${day}/${month}/${year}`;
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const values: Record<string, string> = {};
  for (const part of parts) if (part.type !== "literal") values[part.type] = part.value;
  const asUtc = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second));
  return asUtc - date.getTime();
}

function israelDateTimeToUtc(dateValue: string, timeValue: string) {
  const [year, month, day] = String(dateValue).split("-").map(Number);
  const cleanTime = String(timeValue).slice(0, 5);
  const [hour, minute] = cleanTime.split(":").map(Number);
  if (!year || !month || !day || !Number.isFinite(hour) || !Number.isFinite(minute)) throw new Error("invalid_date_or_time");
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let result = desiredUtc;
  for (let i = 0; i < 3; i++) {
    const offset = timeZoneOffsetMs(new Date(result), "Asia/Jerusalem");
    const next = desiredUtc - offset;
    if (Math.abs(next - result) < 1000) { result = next; break; }
    result = next;
  }
  return new Date(result);
}

function googleCalendarDate(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function buildGoogleCalendarUrl(dateValue: string, timeValue: string, meetingMode = "clinic", appointmentType = "") {
  const duration = appointmentType === "intake" ? 60 : 50;
  const appointmentTypeLabel = appointmentType === "intake" ? "פגישת אינטייק ראשונית" : appointmentType === "therapy" ? "טיפול רגשי" : "פגישה";
  const start = israelDateTimeToUtc(dateValue, timeValue);
  const end = new Date(start.getTime() + duration * 60 * 1000);
  const isZoom = meetingMode === "zoom";
  const zoomUrl = Deno.env.get("ZOOM_MEETING_URL") || "";
  const details = isZoom
    ? "פגישה אונליין ב-Zoom. קישור ל-Zoom יישלח סמוך למועד הפגישה."
    : "פגישה שאושרה דרך אתר לילך פבון";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${appointmentTypeLabel} עם לילך פבון`,
    dates: `${googleCalendarDate(start)}/${googleCalendarDate(end)}`,
    details,
    location: isZoom ? "אונליין (Zoom)" : "הכישור 30, חולון",
    ctz: "Asia/Jerusalem",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

async function sendClientConfirmationEmail(booking: {
  id: string;
  first_name?: string;
  email?: string;
  booking_date: string;
  booking_time: string;
  meeting_mode?: string;
  appointment_type?: string;
}) {
  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  const email = String(booking.email || "").trim();
  if (!apiKey || !email) return { sent: false, skipped: true };

  const firstName = String(booking.first_name || "").trim();
  const date = formatDateHe(booking.booking_date);
  const time = String(booking.booking_time || "").slice(0, 5);
  const isZoom = booking.meeting_mode === "zoom";
  const meetingModeLabel = isZoom ? "אונליין (Zoom)" : "בקליניקה";
  const appointmentType = booking.appointment_type === "intake" ? "intake" : booking.appointment_type === "therapy" ? "therapy" : "";
  const appointmentTypeLabel = appointmentType === "intake" ? "פגישת אינטייק ראשונית" : appointmentType === "therapy" ? "טיפול רגשי" : "פגישה";
  const durationMinutes = appointmentType === "intake" ? 60 : 50;
  const zoomUrl = Deno.env.get("ZOOM_MEETING_URL") || "";
  const calendarUrl = buildGoogleCalendarUrl(booking.booking_date, booking.booking_time, booking.meeting_mode || "clinic", booking.appointment_type || "");

  const approvalLinkSecret = Deno.env.get("APPROVAL_LINK_SECRET") || "";
  if (!approvalLinkSecret) throw new Error("approval_link_secret_not_configured");
  const cancelToken = await createCancellationToken(booking.id, approvalLinkSecret);
  const cancelPageBase = Deno.env.get("CANCELLATION_SITE_URL") || "https://www.lilachpavon.co.il/cancel";
  const cancelUrl = `${cancelPageBase}?bookingId=${encodeURIComponent(booking.id)}&token=${encodeURIComponent(cancelToken)}`;

  const html = `
    <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7;color:#263126;max-width:640px;margin:auto">
      <h2 style="margin-bottom:8px">הפגישה שלך עם לילך אושרה</h2>
      <p>${firstName ? `שלום ${escapeHtml(firstName)},` : "שלום,"}</p>
      <p>הפגישה שלך אושרה ונשמרה ביומן.</p>

      <div style="background:#f7f5f2;border-radius:14px;padding:16px;margin:18px 0">
        <p style="margin:0 0 8px"><b>תאריך:</b> ${escapeHtml(date)}</p>
        <p style="margin:0 0 8px"><b>שעה:</b> ${escapeHtml(time)}</p>
        <p style="margin:0 0 8px"><b>סוג הפגישה:</b> ${escapeHtml(appointmentTypeLabel)} — ${durationMinutes} דקות</p>
        <p style="margin:0 0 8px"><b>אופן הפגישה:</b> ${escapeHtml(meetingModeLabel)}</p>
        ${isZoom
          ? `<p style="margin:0"><b>Zoom:</b> קישור ל-Zoom יישלח סמוך למועד הפגישה</p>`
          : `<p style="margin:0"><b>כתובת:</b> הכישור 30, חולון</p>`}
      </div>

      <div style="text-align:center;margin:22px 0 8px">
        <a href="${escapeHtml(calendarUrl)}" target="_blank" rel="noopener" style="display:inline-block;background:#5f7855;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">הוספה ליומן Google</a>
      </div>
      <p style="text-align:center;margin:6px 0 18px;color:#667066;font-size:14px">לחיצה על הכפתור תפתח אירוע מוכן עם פרטי הפגישה.</p>

      <div style="text-align:center;margin:10px 0 8px">
        <a href="${escapeHtml(cancelUrl)}" target="_blank" rel="noopener" style="display:inline-block;border:1px solid #9b3d36;color:#9b3d36;text-decoration:none;font-weight:700;padding:11px 22px;border-radius:10px">ביטול הפגישה</a>
      </div>
      <p style="text-align:center;margin:6px 0 20px;color:#667066;font-size:13px">ביטול בטווח של פחות מ־24 שעות מהמועד כרוך בתשלום של 150 ₪ בהתאם למדיניות הביטולים.</p>

      <p>הפגישה אושרה ונקבעה בהצלחה.</p>
      <p style="margin-top:22px;color:#667066;font-size:13px;text-align:center">לתשומת לבך: הודעה זו נשלחה ממערכת אוטומטית, ואין אפשרות להשיב להודעה זו במייל.</p>
      <div style="margin-top:24px;text-align:center;background:#ffffff">
        <img src="cid:lilach-signature" alt="לילך פבון | טיפול רגשי | CBT | NLP" width="600" height="200" style="width:100%;max-width:600px;height:auto;display:block;margin:0 auto;border:0;background:#ffffff" />
      </div>
    </div>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "לילך פבון | טיפול רגשי <appointments@lilachpavon.co.il>",
        to: [email],
        subject: "הפגישה שלך עם לילך אושרה",
        html,
        attachments: [{ content: EMAIL_SIGNATURE_BASE64, filename: "lilach-signature.jpg", content_id: "lilach-signature", content_type: "image/jpeg" }],
      }),
    });
    if (!response.ok) {
      console.error("RESEND CLIENT CONFIRMATION ERROR:", response.status, await response.text());
      return { sent: false, skipped: false };
    }
    return { sent: true, skipped: false };
  } catch (error) {
    console.error("RESEND CLIENT CONFIRMATION ERROR:", error);
    return { sent: false, skipped: false };
  }
}

async function googleToken() {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  let refreshToken = "";
  if (supabaseUrl && serviceRoleKey) {
    try {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/google_connections?id=eq.lilach&select=refresh_token`,
        {
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            Accept: "application/json",
          },
        },
      );
      if (response.ok) {
        const rows = await response.json();
        refreshToken = String(rows?.[0]?.refresh_token || "").trim();
      } else {
        console.error("GOOGLE CONNECTION READ ERROR:", response.status, await response.text());
      }
    } catch (error) {
      console.error("GOOGLE CONNECTION READ ERROR:", error);
    }
  }

  if (!refreshToken) refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN") || "";
  if (!clientId || !clientSecret || !refreshToken) throw new Error("missing_google_secrets");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    console.error("GOOGLE TOKEN ERROR:", response.status, await response.text());
    throw new Error("google_token_failed");
  }
  const data = await response.json();
  if (!data.access_token) throw new Error("google_access_token_missing");
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return Response.json({ error: "POST only" }, { status: 405, headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const bookingId = String(body?.bookingId || "").trim();
    const approvalToken = String(body?.approvalToken || "").trim();
    if (!bookingId || !approvalToken) return Response.json({ error: "booking_id_and_approval_token_required" }, { status: 400, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) throw new Error("missing_supabase_server_credentials");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: booking, error: bookingError } = await supabase
      .from("intake_bookings")
      .select("id,booking_date,booking_time,first_name,last_name,phone,email,reason,status,payment_status,approval_token_hash,google_event_id,meeting_mode,appointment_type")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) return Response.json({ error: "booking_not_found" }, { status: 404, headers: corsHeaders });

    const receivedHash = await sha256(approvalToken);
    if (!booking.approval_token_hash || receivedHash !== booking.approval_token_hash) return Response.json({ error: "invalid_approval_token" }, { status: 401, headers: corsHeaders });

    if (booking.status === "confirmed" && booking.google_event_id) {
      return Response.json({ ok: true, alreadyConfirmed: true, bookingId: booking.id, status: "confirmed", googleEventId: booking.google_event_id }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!["paid", "not_required"].includes(booking.payment_status)) return Response.json({ error: "booking_not_ready_for_approval" }, { status: 409, headers: corsHeaders });
    if (booking.status !== "awaiting_approval") return Response.json({ error: "booking_not_awaiting_approval", status: booking.status }, { status: 409, headers: corsHeaders });

    const duration = booking.appointment_type === "intake" ? 60 : 50;
    const start = israelDateTimeToUtc(booking.booking_date, booking.booking_time);
    const end = new Date(start.getTime() + duration * 60 * 1000);
    const accessToken = await googleToken();
    const calendarId = Deno.env.get("GOOGLE_CALENDAR_ID") || "primary";

    const freeBusyResponse = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ timeMin: start.toISOString(), timeMax: end.toISOString(), timeZone: "Asia/Jerusalem", items: [{ id: calendarId }] }),
    });
    if (!freeBusyResponse.ok) { console.error("GOOGLE FREEBUSY ERROR:", await freeBusyResponse.text()); throw new Error("google_freebusy_failed"); }
    const freeBusy = await freeBusyResponse.json();
    const busy = freeBusy.calendars?.[calendarId]?.busy || [];
    if (busy.length > 0) return Response.json({ error: "slot_taken_before_approval" }, { status: 409, headers: corsHeaders });

    const fullName = [booking.first_name, booking.last_name].filter(Boolean).join(" ");
    const appointmentType = booking.appointment_type === "intake" ? "intake" : booking.appointment_type === "therapy" ? "therapy" : "";
    const appointmentTypeLabel = appointmentType === "intake" ? "פגישת אינטייק ראשונית" : appointmentType === "therapy" ? "טיפול רגשי" : "פגישה";
    const isZoom = booking.meeting_mode === "zoom";
    const zoomUrl = Deno.env.get("ZOOM_MEETING_URL") || "";
    const approvalPageBase = Deno.env.get("APPROVAL_SITE_URL") || "https://www.lilachpavon.co.il/approval";
    const manageBookingUrl = `${approvalPageBase}?bookingId=${encodeURIComponent(booking.id)}&token=${encodeURIComponent(approvalToken)}`;
    const descriptionLines = [
      "נקבע דרך אתר לילך פבון",
      booking.phone ? `טלפון: ${booking.phone}` : "",
      booking.email ? `אימייל: ${booking.email}` : "",
      `סוג הפגישה: ${appointmentTypeLabel}`,
      `משך: ${duration} דקות`,
      `אופן הפגישה: ${isZoom ? "אונליין (Zoom)" : "בקליניקה"}`,
      isZoom && zoomUrl ? `קישור Zoom: ${zoomUrl}` : "",
      isZoom && !zoomUrl ? "יש לשלוח ללקוח קישור Zoom בנפרד." : "",
      "",
      "ניהול / ביטול הפגישה:",
      manageBookingUrl,
      "",
      `Booking ID: ${booking.id}`,
    ].filter((line) => line !== "");

    const eventResponse = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: `${appointmentTypeLabel} - ${fullName || "מטופל/ת"}`,
        description: descriptionLines.join("\n"),
        location: isZoom ? "אונליין (Zoom)" : "הכישור 30, חולון",
        start: { dateTime: start.toISOString(), timeZone: "Asia/Jerusalem" },
        end: { dateTime: end.toISOString(), timeZone: "Asia/Jerusalem" },
      }),
    });
    if (!eventResponse.ok) { console.error("GOOGLE EVENT ERROR:", await eventResponse.text()); throw new Error("google_event_creation_failed"); }
    const googleEvent = await eventResponse.json();
    const nowIso = new Date().toISOString();

    const { data: updated, error: updateError } = await supabase
      .from("intake_bookings")
      .update({ status: "confirmed", approved_at: nowIso, google_event_id: googleEvent.id, updated_at: nowIso })
      .eq("id", booking.id)
      .eq("status", "awaiting_approval")
      .select("id,status,payment_status,approved_at,google_event_id,booking_date,booking_time")
      .single();
    if (updateError) throw updateError;

    try {
      const { error: analyticsError } = await supabase.rpc("increment_site_analytics", { p_event_type: "booking_confirmed" });
      if (analyticsError) console.error("BOOKING CONFIRMED ANALYTICS ERROR:", analyticsError);
    } catch (analyticsError) {
      console.error("BOOKING CONFIRMED ANALYTICS ERROR:", analyticsError);
    }

    const emailResult = await sendClientConfirmationEmail({ id: booking.id, first_name: booking.first_name, email: booking.email, booking_date: updated.booking_date, booking_time: updated.booking_time, meeting_mode: booking.meeting_mode || "clinic", appointment_type: booking.appointment_type || "" });

    return Response.json({
      ok: true,
      bookingId: updated.id,
      status: updated.status,
      paymentStatus: updated.payment_status,
      date: updated.booking_date,
      time: String(updated.booking_time || "").slice(0, 5),
      approvedAt: updated.approved_at,
      googleEventId: updated.google_event_id,
      meetingMode: booking.meeting_mode || "clinic",
      appointmentType: booking.appointment_type || "",
      durationMinutes: duration,
      emailSent: emailResult.sent,
      emailSkipped: emailResult.skipped,
    }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("APPROVE BOOKING ERROR:", error);
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500, headers: corsHeaders });
  }
});