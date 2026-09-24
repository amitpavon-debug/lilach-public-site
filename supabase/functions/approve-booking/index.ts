import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { googleToken, localIso } from "../_shared_google.ts";
import { escapeHtml, sendEmail, sendWhatsappTemplate, sha256Hex } from "../_shared_notifications.ts";

function page(title: string, text: string, ok = true) {
  return new Response(`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><body style="margin:0;background:#f7f2ed;font-family:Arial,sans-serif;color:#354033;display:grid;min-height:100vh;place-items:center"><main style="width:min(560px,calc(100% - 32px));background:white;border-radius:24px;padding:34px;box-shadow:0 16px 50px #0001;text-align:center"><div style="font-size:48px">${ok ? "✓" : "!"}</div><h1>${escapeHtml(title)}</h1><p style="line-height:1.7">${escapeHtml(text)}</p></main></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8" }, status: ok ? 200 : 400 });
}

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const bookingId = url.searchParams.get("booking_id") || "";
    const token = url.searchParams.get("token") || "";
    if (!bookingId || !token) return page("קישור לא תקין", "חסרים פרטים בקישור האישור.", false);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: booking, error } = await supabase.from("intake_bookings").select("*").eq("id", bookingId).single();
    if (error || !booking) return page("הפגישה לא נמצאה", "לא הצלחנו למצוא את בקשת הפגישה.", false);
    if (booking.status === "confirmed") return page("הפגישה כבר אושרה", "אין צורך לבצע פעולה נוספת.");
    if (booking.payment_status !== "paid" || booking.status !== "awaiting_approval") return page("עדיין אי אפשר לאשר", "התשלום טרם אומת או שהבקשה אינה ממתינה לאישור.", false);

    const hash = await sha256Hex(token);
    if (!booking.approval_token_hash || hash !== booking.approval_token_hash) return page("קישור לא תקין", "קישור האישור אינו תקף.", false);

    const duration = Number(Deno.env.get("INTAKE_DURATION_MINUTES") || 50);
    const googleAccessToken = await googleToken();
    const calendarId = Deno.env.get("GOOGLE_CALENDAR_ID") || "primary";
    const time = String(booking.booking_time).slice(0,5);
    const start = new Date(localIso(booking.booking_date, time));
    const end = new Date(start.getTime() + duration * 60000);

    const fb = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${googleAccessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ timeMin: start.toISOString(), timeMax: end.toISOString(), timeZone: "Asia/Jerusalem", items: [{ id: calendarId }] })
    });
    if (!fb.ok) throw new Error("freebusy_failed");
    const fj = await fb.json();
    if ((fj.calendars?.[calendarId]?.busy || []).length) {
      return page("המועד כבר אינו פנוי", "המועד נתפס ביומן לפני האישור. יש ליצור קשר עם הפונה ולתאם מועד אחר.", false);
    }

    const name = `${booking.first_name} ${booking.last_name}`;
    const event = {
      summary: `פגישת אינטק - ${name}`,
      description: `טלפון: ${booking.phone}${booking.email ? `\nאימייל: ${booking.email}` : ""}\nסיבת פנייה: ${booking.reason}\nמקור הגעה: ${booking.referral_source}\nמדיניות 24 שעות: אושרה\nהתשלום אומת לפני אישור הפגישה`,
      start: { dateTime: start.toISOString(), timeZone: "Asia/Jerusalem" },
      end: { dateTime: end.toISOString(), timeZone: "Asia/Jerusalem" }
    };
    const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${googleAccessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(event)
    });
    if (!r.ok) throw new Error(await r.text());
    const created = await r.json();

    const { error: updateError } = await supabase.from("intake_bookings").update({
      status: "confirmed",
      approved_at: new Date().toISOString(),
      google_event_id: created.id,
      approval_token_hash: null,
      updated_at: new Date().toISOString()
    }).eq("id", bookingId);
    if (updateError) throw updateError;

    await sendWhatsappTemplate({
      to: booking.phone,
      templateName: Deno.env.get("WHATSAPP_CLIENT_CONFIRMED_TEMPLATE") || "client_booking_confirmed",
      params: [booking.first_name, String(booking.booking_date), time, "הכישור 30, חולון"]
    });

    if (booking.email) {
      await sendEmail({
        to: booking.email,
        subject: "פגישת האינטק והתשלום אושרו",
        html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7"><h2>הפגישה אושרה</h2><p>שלום ${escapeHtml(booking.first_name)}, הפגישה והתשלום אושרו.</p><p><b>מועד:</b> ${escapeHtml(String(booking.booking_date))} · ${escapeHtml(time)}<br><b>כתובת:</b> הכישור 30, חולון</p></div>`
      });
    }

    return page("הפגישה אושרה", `הפגישה של ${name} אושרה ונוספה ליומן. הודעת WhatsApp נשלחה לפונה.`);
  } catch (e) {
    console.error(e);
    return page("לא הצלחנו לאשר", "אירעה שגיאה בזמן אישור הפגישה. יש לנסות שוב או לבדוק את הגדרות החיבור.", false);
  }
});
