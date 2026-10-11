
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import webpush from "npm:web-push@3.6.7";

const SITE_ORIGINS = new Set([
  "https://www.lilachpavon.co.il",
  "https://lilachpavon.co.il"
]);

function allowedOrigin(origin: string | null) {
  if (!origin) return "";
  if (SITE_ORIGINS.has(origin)) return origin;
  try {
    const u = new URL(origin);
    if (u.protocol === "https:" && u.hostname.endsWith(".vercel.app")) return origin;
  } catch {}
  return "";
}

function cors(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin || "https://www.lilachpavon.co.il",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendLeadPush(supabase: any, name: string, phone: string, message: string) {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
  const vapidEmail = Deno.env.get("VAPID_EMAIL") || "mailto:lilach.pavon@gmail.com";

  if (!publicKey || !privateKey) {
    console.error("NEW LEAD PUSH CONFIG MISSING");
    return { sent: 0, skipped: true };
  }

  try {
    webpush.setVapidDetails(vapidEmail, publicKey, privateKey);

    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("id,subscription")
      .eq("enabled", true);

    if (error) throw error;

    const body = [
      `${name} השאיר/ה פרטים באתר`,
      phone ? `טלפון: ${phone}` : "",
      message ? `הודעה: ${message.slice(0, 120)}` : ""
    ].filter(Boolean).join(" · ");

    let sent = 0;

    for (const row of subscriptions || []) {
      try {
        await webpush.sendNotification(
          row.subscription as webpush.PushSubscription,
          JSON.stringify({
            title: "פנייה חדשה מהאתר 📥",
            body,
            url: "/"
          })
        );
        sent += 1;
      } catch (error: any) {
        console.error("NEW LEAD PUSH ERROR:", error);
        if ([404, 410].includes(Number(error?.statusCode))) {
          await supabase
            .from("push_subscriptions")
            .update({ enabled: false, updated_at: new Date().toISOString() })
            .eq("id", row.id);
        }
      }
    }

    return { sent, skipped: false };
  } catch (error) {
    console.error("NEW LEAD PUSH SETUP ERROR:", error);
    return { sent: 0, skipped: false };
  }
}

function israelDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

Deno.serve(async (req) => {
  const origin = allowedOrigin(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors(origin) });
  }
  if (req.method !== "POST") {
    return Response.json({ error: "POST only" }, { status: 405, headers: cors(origin) });
  }
  if (!origin) {
    return Response.json({ error: "origin_not_allowed" }, { status: 403, headers: cors("") });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    const phone = String(body.phone || "").trim();
    const message = String(body.message || "").trim();
    const privacyConsent = body.privacyConsent === true;
    const website = String(body.website || "").trim();

    // Honeypot: silently accept bot submissions without storing anything.
    if (website) {
      return Response.json({ ok: true }, { status: 200, headers: cors(origin) });
    }

    if (name.length < 2 || name.length > 120) {
      return Response.json({ error: "invalid_name" }, { status: 400, headers: cors(origin) });
    }
    if (phone.length < 7 || phone.length > 30) {
      return Response.json({ error: "invalid_phone" }, { status: 400, headers: cors(origin) });
    }
    if (message.length > 2000) {
      return Response.json({ error: "message_too_long" }, { status: 400, headers: cors(origin) });
    }
    if (!privacyConsent) {
      return Response.json({ error: "privacy_consent_required" }, { status: 400, headers: cors(origin) });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) throw new Error("supabase_config_missing");

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // 1) Keep the raw website request for audit/history.
    const { data: contact, error: contactError } = await supabase
      .from("contact_requests")
      .insert({
        name,
        phone,
        message: message || null,
        privacy_consent: true,
        source: "website",
        status: "new"
      })
      .select("id")
      .single();

    if (contactError) throw contactError;

    // 2) Feed the exact same leads pipeline used by Lilach's assistant app.
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .insert({
        full_name: name,
        phone,
        email: null,
        source: "אתר לילך",
        status: "חדש",
        intake_text: message || null,
        referral_source: "אתר",
        notes: message ? `פנייה מטופס השארת פרטים באתר\n${message}` : "פנייה מטופס השארת פרטים באתר"
      })
      .select("id,full_name,phone")
      .single();

    if (leadError) {
      await supabase.from("contact_requests").update({ status: "lead_failed" }).eq("id", contact.id);
      throw leadError;
    }

    // 3) Create a high-priority reminder due today.
    // The dashboard already knows how to match this task back to the lead.
    const taskDescription = [
      "פנייה חדשה מהאתר",
      phone ? `טלפון: ${phone}` : "",
      message ? `הודעה: ${message}` : ""
    ].filter(Boolean).join(" · ");

    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .insert({
        title: `לחזור ל${name}`,
        description: taskDescription,
        category: "פניות חדשות",
        priority: "גבוה",
        status: "פתוח",
        due_date: israelDate(),
        client_id: null
      })
      .select("id")
      .single();

    if (taskError) {
      await supabase
        .from("contact_requests")
        .update({ status: "task_failed", lead_id: lead.id })
        .eq("id", contact.id);
      throw taskError;
    }

    await supabase
      .from("contact_requests")
      .update({
        status: "synced_to_dashboard",
        lead_id: lead.id,
        task_id: task.id
      })
      .eq("id", contact.id);

    // 4) Send an immediate mobile Push notification to Lilach.
    const pushResult = await sendLeadPush(supabase, name, phone, message);

    // 5) Keep the email alert as a second notification channel.
    const resendKey = Deno.env.get("RESEND_API_KEY") || "";
    const notifyTo = Deno.env.get("LILACH_NOTIFICATION_EMAIL") || "";
    let emailSent = false;

    if (resendKey && notifyTo) {
      const html = `
        <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7;color:#263126;max-width:640px;margin:auto">
          <h2 style="margin-bottom:8px">השארת פרטים חדשה מהאתר</h2>
          <p>התקבלה בקשה חדשה לחזרה מלילך.</p>
          <div style="background:#f7f5f2;border-radius:14px;padding:16px;margin:18px 0">
            <p style="margin:0 0 8px"><b>שם:</b> ${escapeHtml(name)}</p>
            <p style="margin:0 0 8px"><b>טלפון:</b> ${escapeHtml(phone)}</p>
            <p style="margin:0"><b>הודעה:</b> ${message ? escapeHtml(message).replaceAll("\n","<br>") : "לא נמסרה"}</p>
          </div>
          <p style="font-size:13px;color:#687168">הפנייה נוספה גם לדשבורד של העוזרת האישית עם משימת חזרה להיום.</p>
        </div>
      `;

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "לילך פבון | האתר <appointments@lilachpavon.co.il>",
          to: [notifyTo],
          subject: `השארת פרטים חדשה מהאתר – ${name}`,
          html
        })
      });

      if (response.ok) {
        emailSent = true;
      } else {
        console.error("CONTACT EMAIL ERROR:", response.status, await response.text());
      }
    } else {
      console.error("CONTACT EMAIL CONFIG MISSING");
    }

    return Response.json({
      ok: true,
      emailSent,
      pushSent: pushResult.sent,
      dashboardSynced: true
    }, {
      status: 200,
      headers: { ...cors(origin), "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("contact-request error:", error);
    return Response.json(
      { error: "contact_request_failed" },
      { status: 500, headers: cors(origin) }
    );
  }
});
