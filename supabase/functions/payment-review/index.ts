import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function hmac(message: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  if (!apiKey || !to) return { sent: false, skipped: true };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "לילך פבון | טיפול רגשי <appointments@lilachpavon.co.il>",
      to: [to],
      subject,
      html,
    }),
  });
  if (!response.ok) {
    console.error("PAYMENT REVIEW EMAIL ERROR:", response.status, await response.text());
    return { sent: false, skipped: false };
  }
  return { sent: true, skipped: false };
}

function labels(booking: any) {
  const appointmentTypeLabel = booking.appointment_type === "therapy" ? "טיפול רגשי" : "פגישת אינטייק ראשונית";
  const durationMinutes = booking.appointment_type === "therapy" ? 50 : 60;
  const meetingModeLabel = booking.meeting_mode === "zoom" ? "אונליין (Zoom)" : "בקליניקה";
  return { appointmentTypeLabel, durationMinutes, meetingModeLabel };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const secret = Deno.env.get("APPROVAL_LINK_SECRET") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const notifyEmail = Deno.env.get("LILACH_NOTIFICATION_EMAIL") || "";
    if (!secret) throw new Error("approval_link_secret_not_configured");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("missing_supabase_server_credentials");

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (req.method === "GET") {
      const url = new URL(req.url);
      const bookingId = String(url.searchParams.get("bookingId") || "").trim();
      const token = String(url.searchParams.get("token") || "").trim();
      if (!bookingId || !token) return Response.json({ error: "invalid_request" }, { status: 400, headers: corsHeaders });

      const expected = await hmac(`lilach-payment-review:${bookingId}`, secret);
      if (!timingSafeEqual(token, expected)) return Response.json({ error: "invalid_token" }, { status: 401, headers: corsHeaders });

      const { data: booking, error } = await supabase
        .from("intake_bookings")
        .select("id,booking_date,booking_time,first_name,last_name,phone,email,status,payment_status,payment_amount,payment_method,payment_verified_at,meeting_mode,appointment_type")
        .eq("id", bookingId)
        .maybeSingle();
      if (error) throw error;
      if (!booking) return Response.json({ error: "booking_not_found" }, { status: 404, headers: corsHeaders });

      const { appointmentTypeLabel, durationMinutes, meetingModeLabel } = labels(booking);
      return Response.json({
        ok: true,
        bookingId: booking.id,
        name: [booking.first_name, booking.last_name].filter(Boolean).join(" "),
        phone: booking.phone || "",
        email: booking.email || "",
        date: booking.booking_date,
        time: String(booking.booking_time || "").slice(0, 5),
        status: booking.status,
        paymentStatus: booking.payment_status,
        paymentAmount: Number(booking.payment_amount || 150),
        paymentVerifiedAt: booking.payment_verified_at,
        appointmentTypeLabel,
        durationMinutes,
        meetingModeLabel,
      }, { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
    }

    if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405, headers: corsHeaders });

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim();
    const bookingId = String(body?.bookingId || "").trim();
    const token = String(body?.token || "").trim();
    if (!bookingId || !token || !["request_review", "verify"].includes(action)) {
      return Response.json({ error: "invalid_request" }, { status: 400, headers: corsHeaders });
    }

    const tokenMessage = action === "request_review"
      ? `lilach-payment-claim:${bookingId}`
      : `lilach-payment-review:${bookingId}`;
    const expected = await hmac(tokenMessage, secret);
    if (!timingSafeEqual(token, expected)) return Response.json({ error: "invalid_token" }, { status: 401, headers: corsHeaders });

    const { data: booking, error: bookingError } = await supabase
      .from("intake_bookings")
      .select("id,booking_date,booking_time,first_name,last_name,phone,email,reason,referral_source,status,payment_status,payment_amount,payment_verified_at,meeting_mode,appointment_type")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) return Response.json({ error: "booking_not_found" }, { status: 404, headers: corsHeaders });

    const { appointmentTypeLabel, durationMinutes, meetingModeLabel } = labels(booking);
    const name = [booking.first_name, booking.last_name].filter(Boolean).join(" ");
    const time = String(booking.booking_time || "").slice(0, 5);

    if (action === "request_review") {
      if (booking.payment_status === "paid") {
        return Response.json({ ok: true, alreadyVerified: true, status: booking.status, paymentStatus: booking.payment_status }, { headers: corsHeaders });
      }
      if (booking.status !== "pending_payment") {
        return Response.json({ error: "booking_not_pending_payment", status: booking.status }, { status: 409, headers: corsHeaders });
      }

      const nowIso = new Date().toISOString();
      const holdUntil = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      const { error: updateError } = await supabase
        .from("intake_bookings")
        .update({
          payment_verification_requested_at: nowIso,
          hold_expires_at: holdUntil,
          updated_at: nowIso,
        })
        .eq("id", booking.id);
      if (updateError) throw updateError;

      const reviewToken = await hmac(`lilach-payment-review:${booking.id}`, secret);
      const reviewUrl = `https://www.lilachpavon.co.il/payment-review?bookingId=${encodeURIComponent(booking.id)}&token=${encodeURIComponent(reviewToken)}`;

      const html = `
        <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7;color:#263126;max-width:640px;margin:auto">
          <h2 style="margin-bottom:8px">בדיקת תשלום PayBox לפני אישור התור</h2>
          <p><strong>הלקוח/ה דיווח/ה שביצע/ה תשלום של 150 ₪.</strong></p>
          <p>לפני שליחת בקשת האישור, יש לבדוק באפליקציית PayBox שהתקבלו בפועל <strong>בדיוק 150 ₪</strong> מהלקוח/ה המתאים/ה.</p>
          <div style="background:#f7f5f2;border-radius:14px;padding:16px;margin:18px 0">
            <p style="margin:0 0 8px"><b>שם:</b> ${escapeHtml(name)}</p>
            <p style="margin:0 0 8px"><b>מועד:</b> ${escapeHtml(booking.booking_date)} · ${escapeHtml(time)}</p>
            <p style="margin:0 0 8px"><b>סוג:</b> ${escapeHtml(appointmentTypeLabel)} — ${durationMinutes} דקות</p>
            <p style="margin:0 0 8px"><b>אופן:</b> ${escapeHtml(meetingModeLabel)}</p>
            <p style="margin:0"><b>טלפון:</b> ${escapeHtml(booking.phone || "")}</p>
          </div>
          <p style="text-align:center;margin:24px 0">
            <a href="${escapeHtml(reviewUrl)}" style="display:inline-block;background:#2f6f63;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:12px">בדיקת ואימות תשלום 150 ₪</a>
          </p>
          <p style="font-size:13px;color:#687168">מייל זה אינו אישור תשלום. רק לחיצה על כפתור האימות לאחר בדיקה ב-PayBox תסמן את התשלום כמאומת ותאפשר לשלוח את בקשת אישור התור.</p>
        </div>`;
      const emailResult = await sendEmail(notifyEmail, `נדרש אימות PayBox – 150 ₪ – ${name || "פונה חדש"}`, html);

      return Response.json({
        ok: true,
        status: booking.status,
        paymentStatus: booking.payment_status,
        reviewRequested: true,
        emailSent: emailResult.sent,
        emailSkipped: emailResult.skipped,
      }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (booking.payment_status === "paid" && ["awaiting_approval", "confirmed"].includes(booking.status)) {
      return Response.json({ ok: true, alreadyVerified: true, status: booking.status, paymentStatus: booking.payment_status }, { headers: corsHeaders });
    }
    if (booking.status !== "pending_payment") {
      return Response.json({ error: "booking_not_pending_payment", status: booking.status }, { status: 409, headers: corsHeaders });
    }

    const approvalToken = await hmac(`lilach-booking-approval:${booking.id}`, secret);
    const approvalTokenHash = await sha256(approvalToken);
    const approvalUrl = `https://www.lilachpavon.co.il/approval?bookingId=${encodeURIComponent(booking.id)}&token=${encodeURIComponent(approvalToken)}`;
    const nowIso = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("intake_bookings")
      .update({
        payment_status: "paid",
        payment_amount: 150,
        payment_method: "paybox",
        payment_reference: "paybox_manual_verified_150",
        payment_verified_at: nowIso,
        status: "awaiting_approval",
        approval_token_hash: approvalTokenHash,
        hold_expires_at: null,
        updated_at: nowIso,
      })
      .eq("id", booking.id)
      .eq("status", "pending_payment");
    if (updateError) throw updateError;

    const approvalHtml = `
      <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7;color:#263126;max-width:640px;margin:auto">
        <h2 style="margin-bottom:8px">התשלום אומת — נדרש אישור תור</h2>
        <div style="background:#eaf5e8;border:1px solid #bdd8b8;border-radius:14px;padding:16px;margin:18px 0">
          <p style="margin:0;font-size:18px"><strong>✓ התקבל ואומת תשלום PayBox בסך 150 ₪</strong></p>
        </div>
        <div style="background:#f7f5f2;border-radius:14px;padding:16px;margin:18px 0">
          <p style="margin:0 0 8px"><b>שם:</b> ${escapeHtml(name)}</p>
          <p style="margin:0 0 8px"><b>מועד:</b> ${escapeHtml(booking.booking_date)} · ${escapeHtml(time)}</p>
          <p style="margin:0 0 8px"><b>טלפון:</b> ${escapeHtml(booking.phone || "")}</p>
          <p style="margin:0 0 8px"><b>אימייל:</b> ${escapeHtml(booking.email || "")}</p>
          <p style="margin:0 0 8px"><b>סוג הפגישה:</b> ${escapeHtml(appointmentTypeLabel)} — ${durationMinutes} דקות</p>
          <p style="margin:0 0 8px"><b>אופן הפגישה:</b> ${escapeHtml(meetingModeLabel)}</p>
          <p style="margin:0"><b>מקור הפנייה:</b> ${escapeHtml(booking.referral_source || "לא נמסר")}</p>
        </div>
        <div style="background:#f7f5f2;border-radius:14px;padding:16px;margin:18px 0">
          <b>סיבת הפנייה</b><br>${escapeHtml(booking.reason || "")}
        </div>
        <p style="text-align:center;margin:24px 0">
          <a href="${escapeHtml(approvalUrl)}" style="display:inline-block;background:#2f6f63;color:#fff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:12px">אישור התור</a>
        </p>
        <p style="font-size:13px;color:#687168">הפגישה תתווסף ליומן ותאושר ללקוח/ה רק לאחר אישורך.</p>
      </div>`;
    const approvalEmail = await sendEmail(
      notifyEmail,
      `תשלום 150 ₪ אומת — נדרש אישור – ${appointmentTypeLabel} – ${name || "פונה חדש"}`,
      approvalHtml,
    );

    return Response.json({
      ok: true,
      status: "awaiting_approval",
      paymentStatus: "paid",
      paymentAmount: 150,
      emailSent: approvalEmail.sent,
      emailSkipped: approvalEmail.skipped,
    }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("PAYMENT REVIEW ERROR:", error);
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500, headers: corsHeaders });
  }
});
