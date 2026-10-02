import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const TIME_ZONE = "Asia/Jerusalem";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const POLICY_TEXT = 'ביטול או שינוי בתוך פחות מ-24 שעות ממועד הפגישה כרוך בתשלום של 150 ש"ח, בכפוף לזכויות שאינן ניתנות לוויתור לפי דין.';

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sha256(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function createApprovalToken(bookingId: string, secret: string) {
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
    new TextEncoder().encode(`lilach-booking-approval:${bookingId}`),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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
    console.error("Google token error:", response.status, await response.text());
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

async function sendApprovalEmail(booking: any, approvalUrl: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  const to = Deno.env.get("LILACH_NOTIFICATION_EMAIL") || "";
  if (!apiKey || !to) {
    console.error("EMAIL CONFIG MISSING");
    return { sent: false, skipped: true };
  }

  const name = [booking.first_name, booking.last_name].filter(Boolean).join(" ");
  const time = String(booking.booking_time || "").slice(0, 5);
  const html = `
    <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7;color:#263126;max-width:640px;margin:auto">
      <h2 style="margin-bottom:8px">בקשת תור חדשה — נדרש אישור</h2>
      <p>נשלחה בקשת פגישה חדשה דרך האתר של לילך.</p>
      <div style="background:#f7f5f2;border-radius:14px;padding:16px;margin:18px 0">
        <p style="margin:0 0 8px"><b>שם:</b> ${escapeHtml(name)}</p>
        <p style="margin:0 0 8px"><b>מועד:</b> ${escapeHtml(booking.booking_date)} · ${escapeHtml(time)}</p>
        <p style="margin:0 0 8px"><b>טלפון:</b> ${escapeHtml(booking.phone || "")}</p>
        <p style="margin:0 0 8px"><b>אימייל:</b> ${escapeHtml(booking.email || "")}</p>
        <p style="margin:0"><b>מקור הפנייה:</b> ${escapeHtml(booking.referral_source || "לא נמסר")}</p>
      </div>
      <div style="background:#f7f5f2;border-radius:14px;padding:16px;margin:18px 0">
        <b>סיבת הפנייה</b><br>${escapeHtml(booking.reason || "")}
      </div>
      <p style="margin:22px 0">
        <a href="${escapeHtml(approvalUrl)}" style="display:inline-block;background:#2f6f63;color:white;text-decoration:none;padding:13px 22px;border-radius:12px;font-weight:bold">אישור התור</a>
      </p>
      <p style="font-size:13px;color:#687168">רק לאחר אישור התור הוא יתווסף ליומן Google, והפונה יקבל מייל אישור.</p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "לילך פבון | טיפול רגשי <appointments@lilachpavon.co.il>",
      to: [to],
      subject: `נדרש אישור לתור חדש – ${name || "פונה חדש"}`,
      html,
    }),
  });

  if (!response.ok) {
    console.error("RESEND APPROVAL EMAIL ERROR:", response.status, await response.text());
    return { sent: false, skipped: false };
  }
  return { sent: true, skipped: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return Response.json({ error: "POST only" }, { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const {
      date, time, firstName, lastName, phone, email, reason, referral,
      privacyConsent, whatsappConsent, policyAccepted,
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      return Response.json({ error: "invalid_date" }, { status: 400, headers: corsHeaders });
    }
    if (!/^\d{2}:\d{2}$/.test(String(time))) {
      return Response.json({ error: "invalid_time" }, { status: 400, headers: corsHeaders });
    }

    const durationMinutes = Number(Deno.env.get("INTAKE_DURATION_MINUTES") || "50");
    const accessToken = await googleToken();
    const calendarId = Deno.env.get("GOOGLE_CALENDAR_ID") || "primary";
    const start = israelDateTimeToUtc(String(date), String(time));
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const approvalLinkSecret = Deno.env.get("APPROVAL_LINK_SECRET") || "";
    if (!supabaseUrl || !serviceRoleKey) throw new Error("missing_supabase_credentials");
    if (!approvalLinkSecret) throw new Error("approval_link_secret_not_configured");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: existingBookings, error: existingError } = await supabase
      .from("intake_bookings")
      .select("id,status,hold_expires_at")
      .eq("booking_date", date)
      .eq("booking_time", `${time}:00`)
      .in("status", ["pending_payment", "awaiting_approval", "confirmed"])
      .order("created_at", { ascending: false })
      .limit(10);
    if (existingError) throw existingError;

    const now = Date.now();
    const expiredPendingIds: string[] = [];
    for (const row of existingBookings || []) {
      if (["confirmed", "awaiting_approval"].includes(row.status)) {
        return Response.json({ error: "slot_held" }, { status: 409, headers: corsHeaders });
      }
      if (row.status === "pending_payment") {
        if (!row.hold_expires_at || new Date(row.hold_expires_at).getTime() > now) {
          return Response.json({ error: "slot_held" }, { status: 409, headers: corsHeaders });
        }
        expiredPendingIds.push(row.id);
      }
    }

    if (expiredPendingIds.length) {
      const { error: expireError } = await supabase
        .from("intake_bookings")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .in("id", expiredPendingIds);
      if (expireError) throw expireError;
    }

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
        hold_expires_at: null,
        payment_status: "not_required",
        status: "awaiting_approval",
      })
      .select("id,booking_date,booking_time,first_name,last_name,phone,email,reason,referral_source,status,payment_status")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return Response.json({ error: "slot_held" }, { status: 409, headers: corsHeaders });
      }
      throw insertError;
    }

    const approvalToken = await createApprovalToken(inserted.id, approvalLinkSecret);
    const approvalTokenHash = await sha256(approvalToken);
    const approvalPageBase = Deno.env.get("APPROVAL_SITE_URL") || "https://www.lilachpavon.co.il/approval";
    const approvalUrl = `${approvalPageBase}?bookingId=${encodeURIComponent(inserted.id)}&token=${encodeURIComponent(approvalToken)}`;

    const { error: tokenError } = await supabase
      .from("intake_bookings")
      .update({ approval_token_hash: approvalTokenHash, updated_at: new Date().toISOString() })
      .eq("id", inserted.id);
    if (tokenError) throw tokenError;

    const emailResult = await sendApprovalEmail(inserted, approvalUrl);

    return Response.json({
      ok: true,
      bookingId: inserted.id,
      status: inserted.status,
      paymentStatus: inserted.payment_status,
      emailSent: emailResult.sent,
      emailSkipped: emailResult.skipped,
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