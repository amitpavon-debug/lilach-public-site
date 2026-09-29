import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TIME_ZONE = "Asia/Jerusalem";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const POLICY_TEXT = 'הנני מבינ/ה שלא ניתן לשנות תור בטווח 24 שעות מהמועד, כל שינוי בטווח זה יגרור תשלום של 150 ש"ח.';

async function googleToken() {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN") || "";
  if (!clientId || !clientSecret || !refreshToken) throw new Error("missing_google_credentials");

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
    console.error("Google token error:", await response.text());
    throw new Error("google_token_failed");
  }

  const json = await response.json();
  if (!json.access_token) throw new Error("google_access_token_missing");
  return json.access_token;
}

function timeZoneOffsetMinutes(instant: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);

  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );

  const zonedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );

  return Math.round((zonedAsUtc - instant.getTime()) / 60000);
}

function israelDateTimeToUtc(date: string, time: string) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch) throw new Error("invalid_date_or_time");

  const [, year, month, day] = dateMatch;
  const [, hour, minute] = timeMatch;
  const wallTimeAsUtc = Date.UTC(
    Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0,
  );

  let offsetMinutes = timeZoneOffsetMinutes(new Date(wallTimeAsUtc));
  let instantMs = wallTimeAsUtc - offsetMinutes * 60_000;
  const correctedOffset = timeZoneOffsetMinutes(new Date(instantMs));
  if (correctedOffset !== offsetMinutes) {
    offsetMinutes = correctedOffset;
    instantMs = wallTimeAsUtc - offsetMinutes * 60_000;
  }
  return new Date(instantMs);
}

function paymentUrl(template: string, bookingId: string, returnUrl: string) {
  if (!template) return "";
  return String(template)
    .replaceAll("{booking_id}", encodeURIComponent(bookingId))
    .replaceAll("{return_url}", encodeURIComponent(returnUrl || ""));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return Response.json({ error: "POST only" }, { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      date, time, firstName, lastName, phone, email, reason, referral,
      privacyConsent, whatsappConsent, policyAccepted, returnUrl,
    } = body;

    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (
      !date || !time || !firstName || !lastName || !phone || !normalizedEmail ||
      !reason || !referral || privacyConsent !== true || policyAccepted !== true
    ) {
      return Response.json({ error: "missing_required_fields" }, { status: 400, headers: corsHeaders });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return Response.json({ error: "invalid_email" }, { status: 400, headers: corsHeaders });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return Response.json({ error: "invalid_date" }, { status: 400, headers: corsHeaders });
    }
    if (!/^\d{2}:\d{2}$/.test(time)) {
      return Response.json({ error: "invalid_time" }, { status: 400, headers: corsHeaders });
    }

    const durationMinutes = Number(Deno.env.get("INTAKE_DURATION_MINUTES") || "50");
    const accessToken = await googleToken();
    const calendarId = Deno.env.get("GOOGLE_CALENDAR_ID") || "primary";
    const start = israelDateTimeToUtc(date, time);
    const end = new Date(start.getTime() + durationMinutes * 60_000);

    const freeBusyResponse = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        timeZone: TIME_ZONE,
        items: [{ id: calendarId }],
      }),
    });

    if (!freeBusyResponse.ok) {
      console.error("Google freeBusy error:", await freeBusyResponse.text());
      throw new Error("google_freebusy_failed");
    }

    const freeBusyJson = await freeBusyResponse.json();
    if ((freeBusyJson.calendars?.[calendarId]?.busy || []).length > 0) {
      return Response.json({ error: "slot_taken" }, { status: 409, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("missing_supabase_credentials");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: existingBookings, error: existingError } = await supabase
      .from("intake_bookings")
      .select("id,status,payment_status,hold_expires_at,booking_date,booking_time")
      .eq("booking_date", date)
      .eq("booking_time", `${time}:00`)
      .in("status", ["pending_payment", "awaiting_approval", "confirmed"])
      .order("created_at", { ascending: false })
      .limit(10);

    if (existingError) throw existingError;

    const now = Date.now();
    const expiredPendingIds: string[] = [];
    let slotBlocked = false;

    for (const row of existingBookings || []) {
      if (row.status === "confirmed" || row.status === "awaiting_approval") {
        slotBlocked = true;
        break;
      }
      if (row.status === "pending_payment") {
        if (!row.hold_expires_at || new Date(row.hold_expires_at).getTime() > now) {
          slotBlocked = true;
          break;
        }
        expiredPendingIds.push(row.id);
      }
    }

    if (slotBlocked) {
      return Response.json({ error: "slot_held" }, { status: 409, headers: corsHeaders });
    }

    if (expiredPendingIds.length > 0) {
      const { error: expireError } = await supabase
        .from("intake_bookings")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .in("id", expiredPendingIds);
      if (expireError) throw expireError;
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { data: inserted, error: insertError } = await supabase
      .from("intake_bookings")
      .insert({
        booking_date: date,
        booking_time: time,
        first_name: String(firstName).trim(),
        last_name: String(lastName).trim(),
        phone: String(phone).trim(),
        email: normalizedEmail,
        reason: String(reason).trim(),
        referral_source: String(referral).trim(),
        privacy_consent: true,
        whatsapp_consent: Boolean(whatsappConsent),
        whatsapp_opted_out_at: null,
        policy_accepted: true,
        policy_text: POLICY_TEXT,
        hold_expires_at: expiresAt,
        payment_status: "pending",
        status: "pending_payment",
      })
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return Response.json({ error: "slot_held" }, { status: 409, headers: corsHeaders });
      }
      throw insertError;
    }

    const bookingId = inserted.id;
    return Response.json({
      bookingId,
      expiresAt,
      cardPaymentUrl: paymentUrl(Deno.env.get("CARD_PAYMENT_URL_TEMPLATE") || "", bookingId, returnUrl || ""),
      payboxUrl: paymentUrl(Deno.env.get("PAYBOX_URL_TEMPLATE") || "", bookingId, returnUrl || ""),
    }, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("booking-hold error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500, headers: corsHeaders },
    );
  }
});
