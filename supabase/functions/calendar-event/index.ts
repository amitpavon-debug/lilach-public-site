import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};

async function createCancellationToken(bookingId: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`lilach-booking-cancel:${bookingId}`),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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
  if (!year || !month || !day || !Number.isFinite(hour) || !Number.isFinite(minute)) {
    throw new Error("invalid_date_or_time");
  }
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

function icsUtc(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcs(value: string) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("\r\n", "\\n")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return new Response("GET only", { status: 405, headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const bookingId = String(url.searchParams.get("bookingId") || "").trim();
    const token = String(url.searchParams.get("token") || "").trim();
    if (!bookingId || !token) return new Response("Invalid calendar link", { status: 400, headers: corsHeaders });

    const secret = Deno.env.get("APPROVAL_LINK_SECRET") || "";
    if (!secret) throw new Error("approval_link_secret_not_configured");
    const expected = await createCancellationToken(bookingId, secret);
    if (!timingSafeEqual(token, expected)) return new Response("Invalid calendar link", { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) throw new Error("missing_supabase_server_credentials");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: booking, error } = await supabase
      .from("intake_bookings")
      .select("id,booking_date,booking_time,status")
      .eq("id", bookingId)
      .maybeSingle();
    if (error) throw error;
    if (!booking) return new Response("Booking not found", { status: 404, headers: corsHeaders });
    if (booking.status !== "confirmed") return new Response("Booking is no longer active", { status: 410, headers: corsHeaders });

    const duration = Number(Deno.env.get("INTAKE_DURATION_MINUTES") || 50);
    const start = israelDateTimeToUtc(booking.booking_date, booking.booking_time);
    const end = new Date(start.getTime() + duration * 60 * 1000);
    const cancelPageBase = Deno.env.get("CANCELLATION_SITE_URL") || "https://www.lilachpavon.co.il/cancel";
    const cancelUrl = `${cancelPageBase}?bookingId=${encodeURIComponent(booking.id)}&token=${encodeURIComponent(token)}`;

    const description = [
      "פגישה עם לילך פבון",
      "",
      "לביטול הפגישה:",
      cancelUrl,
      "",
      "ביטול או שינוי בפחות מ־24 שעות מהמועד כרוך בתשלום של 150 ₪ בהתאם למדיניות הביטולים.",
    ].join("\n");

    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Lilach Pavon//Booking//HE",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${booking.id}@lilachpavon.co.il`,
      `DTSTAMP:${icsUtc(new Date())}`,
      `DTSTART:${icsUtc(start)}`,
      `DTEND:${icsUtc(end)}`,
      `SUMMARY:${escapeIcs("פגישה עם לילך פבון")}`,
      `LOCATION:${escapeIcs("הכישור 30, חולון")}`,
      `DESCRIPTION:${escapeIcs(description)}`,
      `URL:${cancelUrl}`,
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ];

    return new Response(lines.join("\r\n"), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/calendar; charset=utf-8; method=PUBLISH",
        "Content-Disposition": 'inline; filename="lilach-appointment.ics"',
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("CALENDAR EVENT ERROR:", error);
    return new Response("Could not create calendar event", { status: 500, headers: corsHeaders });
  }
});
