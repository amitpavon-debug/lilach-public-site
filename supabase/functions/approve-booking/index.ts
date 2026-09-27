import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

async function sha256(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function googleToken() {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN") || "";
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
    console.error("GOOGLE TOKEN ERROR:", await response.text());
    throw new Error("google_token_failed");
  }

  const data = await response.json();
  if (!data.access_token) throw new Error("google_access_token_missing");
  return data.access_token;
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
  const cleanTime = String(timeValue).slice(0, 5);
  const [hour, minute] = cleanTime.split(":").map(Number);

  if (!year || !month || !day || !Number.isFinite(hour) || !Number.isFinite(minute)) {
    throw new Error("invalid_date_or_time");
  }

  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let result = desiredUtc;

  for (let i = 0; i < 3; i++) {
    const offset = timeZoneOffsetMs(new Date(result), "Asia/Jerusalem");
    const next = desiredUtc - offset;
    if (Math.abs(next - result) < 1000) {
      result = next;
      break;
    }
    result = next;
  }

  return new Date(result);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return Response.json({ error: "POST only" }, { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const bookingId = String(body?.bookingId || "").trim();
    const approvalToken = String(body?.approvalToken || "").trim();

    if (!bookingId || !approvalToken) {
      return Response.json(
        { error: "booking_id_and_approval_token_required" },
        { status: 400, headers: corsHeaders },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) throw new Error("missing_supabase_server_credentials");

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: booking, error: bookingError } = await supabase
      .from("intake_bookings")
      .select("id,booking_date,booking_time,first_name,last_name,phone,email,status,payment_status,approval_token_hash,google_event_id")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError) throw bookingError;
    if (!booking) {
      return Response.json({ error: "booking_not_found" }, { status: 404, headers: corsHeaders });
    }

    const receivedHash = await sha256(approvalToken);
    if (!booking.approval_token_hash || receivedHash !== booking.approval_token_hash) {
      return Response.json({ error: "invalid_approval_token" }, { status: 401, headers: corsHeaders });
    }

    if (booking.status === "confirmed" && booking.google_event_id) {
      return Response.json(
        {
          ok: true,
          alreadyConfirmed: true,
          bookingId: booking.id,
          status: "confirmed",
          googleEventId: booking.google_event_id,
        },
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (booking.payment_status !== "paid") {
      return Response.json({ error: "payment_not_confirmed" }, { status: 409, headers: corsHeaders });
    }

    if (booking.status !== "awaiting_approval") {
      return Response.json(
        { error: "booking_not_awaiting_approval", status: booking.status },
        { status: 409, headers: corsHeaders },
      );
    }

    const duration = Number(Deno.env.get("INTAKE_DURATION_MINUTES") || 50);
    const start = israelDateTimeToUtc(booking.booking_date, booking.booking_time);
    const end = new Date(start.getTime() + duration * 60 * 1000);
    const accessToken = await googleToken();
    const calendarId = Deno.env.get("GOOGLE_CALENDAR_ID") || "primary";

    const freeBusyResponse = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        timeZone: "Asia/Jerusalem",
        items: [{ id: calendarId }],
      }),
    });

    if (!freeBusyResponse.ok) {
      console.error("GOOGLE FREEBUSY ERROR:", await freeBusyResponse.text());
      throw new Error("google_freebusy_failed");
    }

    const freeBusy = await freeBusyResponse.json();
    const busy = freeBusy.calendars?.[calendarId]?.busy || [];
    if (busy.length > 0) {
      return Response.json({ error: "slot_taken_before_approval" }, { status: 409, headers: corsHeaders });
    }

    const fullName = [booking.first_name, booking.last_name].filter(Boolean).join(" ");
    const descriptionLines = [
      "נקבע דרך אתר לילך פבון",
      booking.phone ? `טלפון: ${booking.phone}` : "",
      booking.email ? `אימייל: ${booking.email}` : "",
      `Booking ID: ${booking.id}`,
    ].filter(Boolean);

    const eventResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: `פגישת היכרות - ${fullName || "מטופל/ת"}`,
          description: descriptionLines.join("\n"),
          start: { dateTime: start.toISOString(), timeZone: "Asia/Jerusalem" },
          end: { dateTime: end.toISOString(), timeZone: "Asia/Jerusalem" },
        }),
      },
    );

    if (!eventResponse.ok) {
      console.error("GOOGLE EVENT ERROR:", await eventResponse.text());
      throw new Error("google_event_creation_failed");
    }

    const googleEvent = await eventResponse.json();
    const nowIso = new Date().toISOString();

    const { data: updated, error: updateError } = await supabase
      .from("intake_bookings")
      .update({
        status: "confirmed",
        approved_at: nowIso,
        google_event_id: googleEvent.id,
        updated_at: nowIso,
      })
      .eq("id", booking.id)
      .eq("status", "awaiting_approval")
      .select("id,status,payment_status,approved_at,google_event_id,booking_date,booking_time")
      .single();

    if (updateError) throw updateError;

    return Response.json(
      {
        ok: true,
        bookingId: updated.id,
        status: updated.status,
        paymentStatus: updated.payment_status,
        date: updated.booking_date,
        time: String(updated.booking_time || "").slice(0, 5),
        approvedAt: updated.approved_at,
        googleEventId: updated.google_event_id,
      },
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("APPROVE BOOKING ERROR:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500, headers: corsHeaders },
    );
  }
});
