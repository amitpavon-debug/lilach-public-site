import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

async function createAttendanceToken(bookingId: string, secret: string) {
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
    new TextEncoder().encode(`lilach-booking-attendance:${bookingId}`),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sendLilachNotification(booking: any) {
  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  const to = Deno.env.get("LILACH_NOTIFICATION_EMAIL") || "";
  if (!apiKey || !to) return false;

  const fullName = [booking.first_name, booking.last_name].filter(Boolean).join(" ");
  const dateHe = formatDateHe(booking.booking_date);
  const time = String(booking.booking_time || "").slice(0, 5);
  const html = `
    <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7;color:#263126;max-width:640px;margin:auto">
      <h2>אישור הגעה לפגישה</h2>
      <p><b>${escapeHtml(fullName || "הפונה")}</b> אישר/ה הגעה לפגישה.</p>
      <div style="background:#f7f5f2;border-radius:14px;padding:16px;margin:18px 0">
        <p style="margin:0 0 8px"><b>תאריך:</b> ${escapeHtml(dateHe)}</p>
        <p style="margin:0"><b>שעה:</b> ${escapeHtml(time)}</p>
      </div>
    </div>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "לילך פבון | טיפול רגשי <appointments@lilachpavon.co.il>",
      to: [to],
      subject: `אישור הגעה – ${fullName || "פגישה"}`,
      html,
    }),
  });
  if (!response.ok) console.error("ATTENDANCE NOTIFICATION ERROR:", response.status, await response.text());
  return response.ok;
}

function page(title: string, message: string, ok = true) {
  const tone = ok ? "#e9f8ee" : "#fff1f0";
  const color = ok ? "#126331" : "#8b1712";
  return `<!doctype html>
  <html lang="he" dir="rtl">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex,nofollow,noarchive">
    <title>${escapeHtml(title)} | לילך פבון</title>
  </head>
  <body style="margin:0;min-height:100vh;background:#f5f3ef;color:#2f2f2f;font-family:Arial,sans-serif;line-height:1.6">
    <main style="width:min(620px,calc(100% - 28px));margin:40px auto">
      <section style="background:#fff;border-radius:24px;padding:30px;box-shadow:0 10px 34px rgba(0,0,0,.08);text-align:center">
        <h1 style="margin-top:0">${escapeHtml(title)}</h1>
        <div style="background:${tone};color:${color};padding:18px;border-radius:14px">${message}</div>
        <p style="margin-top:24px"><a href="https://www.lilachpavon.co.il/" style="color:#365d4a;font-weight:700">חזרה לאתר</a></p>
      </section>
    </main>
  </body></html>`;
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const bookingId = String(url.searchParams.get("bookingId") || "").trim();
    const token = String(url.searchParams.get("token") || "").trim();
    if (!bookingId || !token) {
      return new Response(page("לא ניתן לאשר הגעה", "הקישור אינו תקין או שחסרים בו פרטים.", false), { status: 400, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    }

    const secret = Deno.env.get("APPROVAL_LINK_SECRET") || "";
    if (!secret) throw new Error("approval_link_secret_not_configured");
    const expected = await createAttendanceToken(bookingId, secret);
    if (token !== expected) {
      return new Response(page("לא ניתן לאשר הגעה", "קישור האישור אינו תקין.", false), { status: 401, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) throw new Error("missing_supabase_server_credentials");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: booking, error } = await supabase
      .from("intake_bookings")
      .select("id,booking_date,booking_time,first_name,last_name,status,attendance_status,attendance_responded_at")
      .eq("id", bookingId)
      .maybeSingle();
    if (error) throw error;
    if (!booking) {
      return new Response(page("לא ניתן לאשר הגעה", "הפגישה לא נמצאה במערכת.", false), { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (booking.status !== "confirmed") {
      return new Response(page("לא ניתן לאשר הגעה", "הפגישה אינה פעילה כעת במערכת.", false), { status: 409, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    }

    const fullName = [booking.first_name, booking.last_name].filter(Boolean).join(" ");
    const dateHe = formatDateHe(booking.booking_date);
    const time = String(booking.booking_time || "").slice(0, 5);

    if (booking.attendance_status === "confirmed") {
      return new Response(page("הגעתך כבר אושרה", `האישור לפגישה בתאריך <b>${escapeHtml(dateHe)}</b> בשעה <b>${escapeHtml(time)}</b> כבר התקבל. תודה.`), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    }

    const nowIso = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from("intake_bookings")
      .update({ attendance_status: "confirmed", attendance_responded_at: nowIso, updated_at: nowIso })
      .eq("id", booking.id)
      .eq("status", "confirmed")
      .neq("attendance_status", "confirmed")
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;

    if (updated) await sendLilachNotification(booking);

    return new Response(page("אישור ההגעה התקבל", `${fullName ? `תודה ${escapeHtml(fullName)}, ` : "תודה, "}אישרנו את הגעתך לפגישה בתאריך <b>${escapeHtml(dateHe)}</b> בשעה <b>${escapeHtml(time)}</b>, ברחוב הכישור 30, חולון.`), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("ATTENDANCE RESPONSE ERROR:", error);
    return new Response(page("לא ניתן לאשר הגעה", "אירעה תקלה זמנית. אפשר לנסות שוב בעוד מספר דקות.", false), { status: 500, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }
});