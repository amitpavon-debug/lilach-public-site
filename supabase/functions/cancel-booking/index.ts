import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const SIGNATURE_URL = "https://taafqwplvzcceoynhvve.supabase.co/functions/v1/email-signature-image";
const NO_REPLY_NOTE = `<p style="margin-top:22px;color:#667066;font-size:13px;text-align:center">לתשומת לבך: הודעה זו נשלחה ממערכת אוטומטית, ואין אפשרות להשיב להודעה זו במייל.</p>`;
const SIGNATURE_HTML = `<div style="margin-top:24px;text-align:center;background:#ffffff"><img src="${SIGNATURE_URL}" alt="לילך פבון | טיפול רגשי | CBT | NLP" width="600" height="200" style="width:100%;max-width:600px;height:auto;display:block;margin:0 auto;border:0;background:#ffffff" /></div>`;

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

async function createCancellationToken(bookingId: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`lilach-booking-cancel:${bookingId}`));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
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

async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  if (!apiKey || !to) return { sent: false, skipped: true };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "לילך פבון | טיפול רגשי <appointments@lilachpavon.co.il>", to: [to], subject, html }),
    });
    if (!response.ok) { console.error("RESEND CANCELLATION EMAIL ERROR:", response.status, await response.text()); return { sent: false, skipped: false }; }
    return { sent: true, skipped: false };
  } catch (error) {
    console.error("RESEND CANCELLATION EMAIL ERROR:", error);
    return { sent: false, skipped: false };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return Response.json({ error: "POST only" }, { status: 405, headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const bookingId = String(body?.bookingId || "").trim();
    const cancelToken = String(body?.cancelToken || "").trim();
    const action = String(body?.action || "details").trim();
    if (!bookingId || !cancelToken) return Response.json({ error: "booking_id_and_cancel_token_required" }, { status: 400, headers: corsHeaders });

    const approvalLinkSecret = Deno.env.get("APPROVAL_LINK_SECRET") || "";
    if (!approvalLinkSecret) throw new Error("approval_link_secret_not_configured");
    const expectedToken = await createCancellationToken(bookingId, approvalLinkSecret);
    if (cancelToken !== expectedToken) return Response.json({ error: "invalid_cancel_token" }, { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) throw new Error("missing_supabase_server_credentials");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: booking, error: bookingError } = await supabase
      .from("intake_bookings")
      .select("id,booking_date,booking_time,first_name,last_name,email,phone,status,google_event_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) return Response.json({ error: "booking_not_found" }, { status: 404, headers: corsHeaders });

    const start = israelDateTimeToUtc(booking.booking_date, booking.booking_time);
    const millisUntil = start.getTime() - Date.now();
    const lateCancellation = millisUntil > 0 && millisUntil < 24 * 60 * 60 * 1000;
    const feeAmount = lateCancellation ? 150 : 0;

    if (action === "details") {
      return Response.json({
        ok: true,
        bookingId: booking.id,
        name: [booking.first_name, booking.last_name].filter(Boolean).join(" "),
        date: booking.booking_date,
        time: String(booking.booking_time || "").slice(0, 5),
        status: booking.status,
        lateCancellation,
        feeAmount,
      }, { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
    }

    if (action !== "cancel") return Response.json({ error: "invalid_action" }, { status: 400, headers: corsHeaders });
    if (booking.status === "cancelled") {
      return Response.json({ ok: true, alreadyCancelled: true, status: "cancelled", lateCancellation, feeAmount }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (booking.status !== "confirmed") return Response.json({ error: "booking_not_confirmed", status: booking.status }, { status: 409, headers: corsHeaders });
    if (millisUntil <= 0) return Response.json({ error: "booking_already_started" }, { status: 409, headers: corsHeaders });

    if (booking.google_event_id) {
      const accessToken = await googleToken();
      const calendarId = Deno.env.get("GOOGLE_CALENDAR_ID") || "primary";
      const deleteResponse = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(booking.google_event_id)}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (![204, 404, 410].includes(deleteResponse.status)) {
        console.error("GOOGLE EVENT DELETE ERROR:", deleteResponse.status, await deleteResponse.text());
        throw new Error("google_event_delete_failed");
      }
    }

    const nowIso = new Date().toISOString();
    const { error: updateError } = await supabase.from("intake_bookings").update({ status: "cancelled", updated_at: nowIso }).eq("id", booking.id).eq("status", "confirmed");
    if (updateError) throw updateError;

    const dateHe = formatDateHe(booking.booking_date);
    const time = String(booking.booking_time || "").slice(0, 5);
    const firstName = String(booking.first_name || "").trim();
    const feeNotice = lateCancellation
      ? `<div style="background:#fff4df;border-radius:12px;padding:14px;margin:18px 0"><b>לתשומת לבך:</b> בהתאם למדיניות הביטולים, ביטול בטווח של פחות מ־24 שעות מהמועד כרוך בתשלום של 150 ₪.</div>`
      : "";

    const clientHtml = `
      <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7;color:#263126;max-width:640px;margin:auto">
        <h2>הפגישה עם לילך בוטלה</h2>
        <p>${firstName ? `שלום ${escapeHtml(firstName)},` : "שלום,"}</p>
        <p>בקשת הביטול התקבלה והפגישה בוטלה.</p>
        <div style="background:#f7f5f2;border-radius:14px;padding:16px;margin:18px 0">
          <p style="margin:0 0 8px"><b>תאריך:</b> ${escapeHtml(dateHe)}</p>
          <p style="margin:0"><b>שעה:</b> ${escapeHtml(time)}</p>
        </div>
        ${feeNotice}
        ${NO_REPLY_NOTE}
        ${SIGNATURE_HTML}
      </div>`;

    const clientEmail = await sendEmail(String(booking.email || "").trim(), "אישור ביטול הפגישה עם לילך", clientHtml);

    const lilachEmail = Deno.env.get("LILACH_NOTIFICATION_EMAIL") || "";
    const fullName = [booking.first_name, booking.last_name].filter(Boolean).join(" ");
    const lilachHtml = `
      <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7;color:#263126;max-width:640px;margin:auto">
        <h2>פגישה בוטלה דרך האתר</h2>
        <p><b>שם:</b> ${escapeHtml(fullName)}</p>
        <p><b>מועד:</b> ${escapeHtml(dateHe)} · ${escapeHtml(time)}</p>
        ${lateCancellation ? "<p><b>ביטול בתוך 24 שעות — לפי המדיניות חל חיוב של 150 ₪.</b></p>" : ""}
      </div>`;
    const lilachNotification = await sendEmail(lilachEmail, `פגישה בוטלה – ${fullName || "פונה"}`, lilachHtml);

    return Response.json({
      ok: true,
      status: "cancelled",
      lateCancellation,
      feeAmount,
      clientEmailSent: clientEmail.sent,
      lilachEmailSent: lilachNotification.sent,
    }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("CANCEL BOOKING ERROR:", error);
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500, headers: corsHeaders });
  }
});