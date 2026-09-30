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

function formatDateHe(dateValue: string) {
  const [year, month, day] = String(dateValue).split("-");
  if (!year || !month || !day) return String(dateValue || "");
  return `${day}/${month}/${year}`;
}

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

async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  if (!apiKey || !to) return { sent: false, skipped: true };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "לילך פבון | טיפול רגשי <appointments@lilachpavon.co.il>",
        to: [to],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      console.error("RESEND ADMIN ACTION EMAIL ERROR:", response.status, await response.text());
      return { sent: false, skipped: false };
    }
    return { sent: true, skipped: false };
  } catch (error) {
    console.error("RESEND ADMIN ACTION EMAIL ERROR:", error);
    return { sent: false, skipped: false };
  }
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
    const action = String(body?.action || "").trim();

    if (!bookingId || !approvalToken || !["reject", "cancel"].includes(action)) {
      return Response.json({ error: "invalid_request" }, { status: 400, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) throw new Error("missing_supabase_server_credentials");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: booking, error: bookingError } = await supabase
      .from("intake_bookings")
      .select("id,booking_date,booking_time,first_name,last_name,email,phone,status,payment_status,approval_token_hash,google_event_id")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError) throw bookingError;
    if (!booking) return Response.json({ error: "booking_not_found" }, { status: 404, headers: corsHeaders });

    const receivedHash = await sha256(approvalToken);
    if (!booking.approval_token_hash || receivedHash !== booking.approval_token_hash) {
      return Response.json({ error: "invalid_approval_token" }, { status: 401, headers: corsHeaders });
    }

    const dateHe = formatDateHe(booking.booking_date);
    const time = String(booking.booking_time || "").slice(0, 5);
    const firstName = String(booking.first_name || "").trim();
    const siteBookingUrl = "https://www.lilachpavon.co.il/#booking";

    if (action === "reject") {
      if (booking.status === "rejected") {
        return Response.json({ ok: true, alreadyRejected: true, status: "rejected" }, { headers: corsHeaders });
      }
      if (booking.status !== "awaiting_approval") {
        return Response.json(
          { error: "booking_not_awaiting_approval", status: booking.status },
          { status: 409, headers: corsHeaders },
        );
      }

      const nowIso = new Date().toISOString();
      const { data: updated, error: updateError } = await supabase
        .from("intake_bookings")
        .update({ status: "rejected", updated_at: nowIso })
        .eq("id", booking.id)
        .eq("status", "awaiting_approval")
        .select("id")
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updated) {
        return Response.json({ error: "booking_state_changed" }, { status: 409, headers: corsHeaders });
      }

      const clientHtml = `
        <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7;color:#263126;max-width:640px;margin:auto">
          <h2>עדכון לגבי בקשת הפגישה</h2>
          <p>${firstName ? `שלום ${escapeHtml(firstName)},` : "שלום,"}</p>
          <p>המועד שביקשת לא אושר. אפשר לבחור מועד אחר מתוך השעות הפנויות באתר.</p>
          <div style="background:#f7f5f2;border-radius:14px;padding:16px;margin:18px 0">
            <p style="margin:0 0 8px"><b>תאריך שהתבקש:</b> ${escapeHtml(dateHe)}</p>
            <p style="margin:0"><b>שעה:</b> ${escapeHtml(time)}</p>
          </div>
          <div style="text-align:center;margin:24px 0">
            <a href="${siteBookingUrl}" style="display:inline-block;background:#5f7855;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">בחירת מועד חדש</a>
          </div>
        </div>
      `;

      const emailResult = await sendEmail(
        String(booking.email || "").trim(),
        "עדכון לגבי בקשת הפגישה עם לילך",
        clientHtml,
      );

      return Response.json({
        ok: true,
        status: "rejected",
        clientEmailSent: emailResult.sent,
        clientEmailSkipped: emailResult.skipped,
      }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (booking.status === "cancelled_by_lilach") {
      return Response.json({ ok: true, alreadyCancelled: true, status: "cancelled_by_lilach" }, { headers: corsHeaders });
    }
    if (booking.status !== "confirmed") {
      return Response.json(
        { error: "booking_not_confirmed", status: booking.status },
        { status: 409, headers: corsHeaders },
      );
    }

    if (booking.google_event_id) {
      const accessToken = await googleToken();
      const calendarId = Deno.env.get("GOOGLE_CALENDAR_ID") || "primary";
      const deleteResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(booking.google_event_id)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      if (![204, 404, 410].includes(deleteResponse.status)) {
        console.error("GOOGLE EVENT DELETE ERROR:", deleteResponse.status, await deleteResponse.text());
        throw new Error("google_event_delete_failed");
      }
    }

    const nowIso = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from("intake_bookings")
      .update({ status: "cancelled_by_lilach", google_event_id: null, updated_at: nowIso })
      .eq("id", booking.id)
      .eq("status", "confirmed")
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) {
      return Response.json({ error: "booking_state_changed" }, { status: 409, headers: corsHeaders });
    }

    const clientHtml = `
      <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7;color:#263126;max-width:640px;margin:auto">
        <h2>הפגישה עם לילך בוטלה</h2>
        <p>${firstName ? `שלום ${escapeHtml(firstName)},` : "שלום,"}</p>
        <p>הפגישה שנקבעה בוטלה על ידי לילך. כמובן שלא חל חיוב בגין הביטול.</p>
        <div style="background:#f7f5f2;border-radius:14px;padding:16px;margin:18px 0">
          <p style="margin:0 0 8px"><b>תאריך:</b> ${escapeHtml(dateHe)}</p>
          <p style="margin:0"><b>שעה:</b> ${escapeHtml(time)}</p>
        </div>
        <p>אפשר לבחור מועד חדש באתר לפי הנוחות שלך.</p>
        <div style="text-align:center;margin:24px 0">
          <a href="${siteBookingUrl}" style="display:inline-block;background:#5f7855;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">בחירת מועד חדש</a>
        </div>
      </div>
    `;

    const emailResult = await sendEmail(
      String(booking.email || "").trim(),
      "הפגישה עם לילך בוטלה",
      clientHtml,
    );

    return Response.json({
      ok: true,
      status: "cancelled_by_lilach",
      clientEmailSent: emailResult.sent,
      clientEmailSkipped: emailResult.skipped,
    }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("BOOKING ADMIN ACTION ERROR:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500, headers: corsHeaders },
    );
  }
});
