import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SIGNATURE_URL = "https://taafqwplvzcceoynhvve.supabase.co/functions/v1/email-signature-image";

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
  return year && month && day ? `${day}/${month}/${year}` : String(dateValue || "");
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
  const values: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) if (part.type !== "literal") values[part.type] = part.value;
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return asUtc - date.getTime();
}

function israelDateTimeToUtc(dateValue: string, timeValue: string) {
  const [year, month, day] = String(dateValue).split("-").map(Number);
  const [hour, minute] = String(timeValue).slice(0, 5).split(":").map(Number);
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let result = desiredUtc;
  for (let i = 0; i < 3; i++) {
    const next = desiredUtc - timeZoneOffsetMs(new Date(result), "Asia/Jerusalem");
    if (Math.abs(next - result) < 1000) {
      result = next;
      break;
    }
    result = next;
  }
  return new Date(result);
}

async function hmacToken(message: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function buildLinks(bookingId: string) {
  const secret = Deno.env.get("APPROVAL_LINK_SECRET") || "";
  if (!secret) throw new Error("approval_link_secret_not_configured");

  const attendanceToken = await hmacToken(`lilach-booking-attendance:${bookingId}`, secret);
  const cancelToken = await hmacToken(`lilach-booking-cancel:${bookingId}`, secret);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://taafqwplvzcceoynhvve.supabase.co";
  const cancellationSiteUrl = Deno.env.get("CANCELLATION_SITE_URL") || "https://www.lilachpavon.co.il/cancel";

  return {
    confirmUrl: `${supabaseUrl}/functions/v1/attendance-response?bookingId=${encodeURIComponent(bookingId)}&token=${encodeURIComponent(attendanceToken)}`,
    cancelUrl: `${cancellationSiteUrl}?bookingId=${encodeURIComponent(bookingId)}&token=${encodeURIComponent(cancelToken)}`,
  };
}

async function sendReminder(booking: any, type: "48h" | "24h") {
  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  const email = String(booking.email || "").trim();
  if (!apiKey || !email) return false;

  const { confirmUrl, cancelUrl } = await buildLinks(String(booking.id));
  const firstName = String(booking.first_name || "").trim();
  const dateHe = formatDateHe(booking.booking_date);
  const time = String(booking.booking_time || "").slice(0, 5);
  const isZoom = booking.meeting_mode === "zoom";
  const zoomUrl = Deno.env.get("ZOOM_MEETING_URL") || "";
  const isFollowUp = type === "24h";

  const subject = isFollowUp
    ? "טרם קיבלנו אישור הגעה לפגישה שלך מחר"
    : "תזכורת לפגישה הקרובה שלך עם לילך";

  const intro = isFollowUp
    ? "עדיין לא קיבלנו אישור הגעה לפגישה שלך מחר. נשמח לעדכון קצר באמצעות אחד הכפתורים למטה."
    : "הפגישה שלך עם לילך מתקרבת. נשמח לעדכון קצר אם בכוונתך להגיע, או לבטל במידת הצורך.";

  const html = `
    <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7;color:#263126;max-width:640px;margin:auto">
      <h2 style="margin-bottom:8px">${isFollowUp ? "תזכורת לפגישה שלך מחר עם לילך" : "תזכורת לפגישה הקרובה שלך עם לילך"}</h2>
      <p>${firstName ? `שלום ${escapeHtml(firstName)},` : "שלום,"}</p>
      <p>${intro}</p>

      <div style="background:#f7f5f2;border-radius:14px;padding:16px;margin:18px 0">
        <p style="margin:0 0 8px"><b>תאריך:</b> ${escapeHtml(dateHe)}</p>
        <p style="margin:0 0 8px"><b>שעה:</b> ${escapeHtml(time)}</p>
        <p style="margin:0 0 8px"><b>אופן הפגישה:</b> ${isZoom ? "אונליין (Zoom)" : "בקליניקה"}</p>
        ${isZoom
          ? `<p style="margin:0"><b>Zoom:</b> ${zoomUrl ? `<a href="${escapeHtml(zoomUrl)}" target="_blank" rel="noopener">כניסה לפגישה</a>` : "קישור ל-Zoom יישלח סמוך למועד הפגישה"}</p>`
          : `<p style="margin:0"><b>כתובת:</b> הכישור 30, חולון</p>`}
      </div>

      <div style="text-align:center;margin:24px 0 10px">
        <a href="${escapeHtml(confirmUrl)}" target="_blank" rel="noopener" style="display:inline-block;background:#5f7855;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;margin:5px">אישור הגעה</a>
        <a href="${escapeHtml(cancelUrl)}" target="_blank" rel="noopener" style="display:inline-block;border:1px solid #9b3d36;color:#9b3d36;text-decoration:none;font-weight:700;padding:11px 22px;border-radius:10px;margin:5px">ביטול הפגישה</a>
      </div>

      <p style="text-align:center;margin:8px 0 20px;color:#667066;font-size:13px">ביטול או שינוי בתוך פחות מ־24 שעות ממועד הפגישה כרוך בתשלום של 150 ₪ בהתאם למדיניות הביטולים ובכפוף לדין.</p>
      <p style="margin-top:22px;color:#667066;font-size:13px;text-align:center">לתשומת לבך: הודעה זו נשלחה ממערכת אוטומטית, ואין אפשרות להשיב להודעה זו במייל.</p>

      <div style="margin-top:24px;text-align:center;background:#ffffff">
        <img src="${SIGNATURE_URL}" alt="לילך פבון | טיפול רגשי | CBT | NLP" width="600" height="200" style="width:100%;max-width:600px;height:auto;display:block;margin:0 auto;border:0;background:#ffffff" />
      </div>
    </div>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "לילך פבון | טיפול רגשי <appointments@lilachpavon.co.il>",
      to: [email],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    console.error(`RESEND ${type} REMINDER ERROR:`, response.status, await response.text());
    return false;
  }
  return true;
}

Deno.serve(async (req) => {
  if (!["GET", "POST"].includes(req.method)) {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) throw new Error("missing_supabase_server_credentials");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const requestSecret = String(req.headers.get("x-reminder-secret") || "");
    const { data: secretRow, error: secretError } = await supabase
      .from("automation_secrets")
      .select("secret")
      .eq("name", "booking_reminders")
      .maybeSingle();
    if (secretError) throw secretError;
    if (!secretRow?.secret || !requestSecret || requestSecret !== secretRow.secret) {
      return Response.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }

    const { data: bookings, error } = await supabase
      .from("intake_bookings")
      .select("id,booking_date,booking_time,first_name,email,status,reminder_sent_at,reminder_24h_sent_at,attendance_status,attendance_responded_at,meeting_mode")
      .eq("status", "confirmed")
      .not("email", "is", null)
      .limit(300);
    if (error) throw error;

    const now = Date.now();
    const results: Array<Record<string, unknown>> = [];

    for (const booking of bookings || []) {
      try {
        const start = israelDateTimeToUtc(String(booking.booking_date), String(booking.booking_time));
        const minsUntil = (start.getTime() - now) / 60000;
        if (minsUntil <= 0) continue;

        if (!booking.reminder_sent_at && minsUntil >= 2870 && minsUntil <= 2890) {
          const sent = await sendReminder(booking, "48h");
          if (sent) {
            const sentAt = new Date().toISOString();
            const { error: updateError } = await supabase
              .from("intake_bookings")
              .update({ reminder_sent_at: sentAt, attendance_status: booking.attendance_status || "pending", updated_at: sentAt })
              .eq("id", booking.id)
              .is("reminder_sent_at", null);
            if (updateError) throw updateError;
          }
          results.push({ bookingId: booking.id, type: "48h", sent });
          continue;
        }

        const noAttendanceResponse = booking.attendance_status !== "confirmed" && !booking.attendance_responded_at;
        if (
          !booking.reminder_24h_sent_at &&
          noAttendanceResponse &&
          minsUntil >= 1430 && minsUntil <= 1450
        ) {
          const sent = await sendReminder(booking, "24h");
          if (sent) {
            const sentAt = new Date().toISOString();
            const { error: updateError } = await supabase
              .from("intake_bookings")
              .update({ reminder_24h_sent_at: sentAt, updated_at: sentAt })
              .eq("id", booking.id)
              .is("reminder_24h_sent_at", null);
            if (updateError) throw updateError;
          }
          results.push({ bookingId: booking.id, type: "24h", sent });
        }
      } catch (bookingError) {
        console.error("BOOKING REMINDER ITEM ERROR:", booking.id, bookingError);
        results.push({ bookingId: booking.id, sent: false, error: bookingError instanceof Error ? bookingError.message : String(bookingError) });
      }
    }

    return Response.json({
      ok: true,
      checked: bookings?.length || 0,
      matched: results.length,
      sent: results.filter((r) => r.sent === true).length,
      results,
    }, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("SEND BOOKING REMINDERS ERROR:", error);
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
});