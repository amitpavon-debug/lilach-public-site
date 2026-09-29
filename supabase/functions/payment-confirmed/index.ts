import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-payment-secret",
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

async function sendApprovalEmail(booking: any, approvalUrl: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  const to = Deno.env.get("LILACH_NOTIFICATION_EMAIL") || "";
  const from =
    Deno.env.get("BOOKING_EMAIL_FROM") ||
    "לילך פבון <appointments@lilachpavon.co.il>";

  if (!apiKey || !to) {
    console.error("EMAIL CONFIG MISSING");
    return { sent: false, skipped: true };
  }

  const name = [booking.first_name, booking.last_name]
    .filter(Boolean)
    .join(" ");
  const time = String(booking.booking_time || "").slice(0, 5);

  const html = `
    <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7;color:#263126;max-width:640px;margin:auto">
      <h2 style="margin-bottom:8px">התשלום אומת — נדרש אישור תור</h2>
      <p>התקבל תשלום עבור בקשת תור חדשה באתר של לילך.</p>

      <div style="background:#f7f5f2;border-radius:14px;padding:16px;margin:18px 0">
        <p style="margin:0 0 8px"><b>שם:</b> ${escapeHtml(name)}</p>
        <p style="margin:0 0 8px"><b>מועד:</b> ${escapeHtml(booking.booking_date)} · ${escapeHtml(time)}</p>
        <p style="margin:0 0 8px"><b>טלפון:</b> ${escapeHtml(booking.phone || "")}</p>
        <p style="margin:0 0 8px"><b>אימייל:</b> ${escapeHtml(booking.email || "לא נמסר")}</p>
        <p style="margin:0"><b>מקור הפנייה:</b> ${escapeHtml(booking.referral_source || "לא נמסר")}</p>
      </div>

      <div style="background:#f7f5f2;border-radius:14px;padding:16px;margin:18px 0">
        <b>סיבת הפנייה</b><br>
        ${escapeHtml(booking.reason || "")}
      </div>

      <p style="margin:22px 0">
        <a href="${escapeHtml(approvalUrl)}"
           style="display:inline-block;background:#2f6f63;color:white;text-decoration:none;padding:13px 22px;border-radius:12px;font-weight:bold">
          אישור התור
        </a>
      </p>

      <p style="font-size:13px;color:#687168">
        רק לאחר אישור התור הוא יתווסף ליומן Google.
      </p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `נדרש אישור לתור חדש – ${name || "פונה חדש"}`,
      html,
    }),
  });

  if (!response.ok) {
    console.error("RESEND ERROR:", response.status, await response.text());
    return { sent: false, skipped: false };
  }

  return { sent: true, skipped: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return Response.json(
      { error: "POST only" },
      { status: 405, headers: corsHeaders },
    );
  }

  try {
    const expectedSecret = Deno.env.get("PAYMENT_WEBHOOK_SECRET") || "";
    const approvalLinkSecret = Deno.env.get("APPROVAL_LINK_SECRET") || "";

    if (!expectedSecret) {
      throw new Error("payment_webhook_secret_not_configured");
    }

    if (!approvalLinkSecret) {
      throw new Error("approval_link_secret_not_configured");
    }

    const receivedSecret = req.headers.get("x-payment-secret") || "";

    if (receivedSecret !== expectedSecret) {
      return Response.json(
        { error: "unauthorized" },
        { status: 401, headers: corsHeaders },
      );
    }

    const body = await req.json().catch(() => ({}));
    const bookingId = String(body?.bookingId || "").trim();
    const paymentReference = String(body?.paymentReference || "").trim();

    if (!bookingId) {
      return Response.json(
        { error: "booking_id_required" },
        { status: 400, headers: corsHeaders },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("missing_supabase_server_credentials");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: booking, error: bookingError } = await supabase
      .from("intake_bookings")
      .select(`
        id,
        status,
        payment_status,
        booking_date,
        booking_time,
        first_name,
        last_name,
        phone,
        email,
        reason,
        referral_source
      `)
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError) throw bookingError;

    if (!booking) {
      return Response.json(
        { error: "booking_not_found" },
        { status: 404, headers: corsHeaders },
      );
    }

    const approvalToken = await createApprovalToken(
      booking.id,
      approvalLinkSecret,
    );
    const approvalTokenHash = await sha256(approvalToken);

    const approvalPageBase =
      Deno.env.get("APPROVAL_SITE_URL") ||
      "https://www.lilachpavon.co.il/approval";

    const approvalUrl =
      `${approvalPageBase}` +
      `?bookingId=${encodeURIComponent(booking.id)}` +
      `&token=${encodeURIComponent(approvalToken)}`;

    if (
      booking.payment_status === "paid" &&
      ["awaiting_approval", "confirmed"].includes(booking.status)
    ) {
      const { error: tokenUpdateError } = await supabase
        .from("intake_bookings")
        .update({
          approval_token_hash: approvalTokenHash,
          updated_at: new Date().toISOString(),
        })
        .eq("id", booking.id);

      if (tokenUpdateError) throw tokenUpdateError;

      return Response.json(
        {
          ok: true,
          alreadyProcessed: true,
          bookingId: booking.id,
          status: booking.status,
          paymentStatus: booking.payment_status,
          approvalUrl,
          emailSent: false,
          emailSkipped: true,
        },
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    if (!["pending_payment", "expired"].includes(booking.status)) {
      return Response.json(
        {
          error: "invalid_booking_status",
          status: booking.status,
        },
        { status: 409, headers: corsHeaders },
      );
    }

    const updatePayload: Record<string, unknown> = {
      payment_status: "paid",
      status: "awaiting_approval",
      approval_token_hash: approvalTokenHash,
      updated_at: new Date().toISOString(),
    };

    if (paymentReference) {
      updatePayload.payment_reference = paymentReference;
    }

    const { data: updated, error: updateError } = await supabase
      .from("intake_bookings")
      .update(updatePayload)
      .eq("id", booking.id)
      .select("id,status,payment_status,booking_date,booking_time")
      .single();

    if (updateError) throw updateError;

    const emailResult = await sendApprovalEmail(booking, approvalUrl);

    return Response.json(
      {
        ok: true,
        bookingId: updated.id,
        status: updated.status,
        paymentStatus: updated.payment_status,
        date: updated.booking_date,
        time: String(updated.booking_time || "").slice(0, 5),
        approvalUrl,
        emailSent: emailResult.sent,
        emailSkipped: emailResult.skipped,
      },
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("PAYMENT CONFIRMED ERROR:", error);

    return Response.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500, headers: corsHeaders },
    );
  }
});