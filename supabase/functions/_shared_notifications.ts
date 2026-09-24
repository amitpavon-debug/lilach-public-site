function normalizeWhatsappNumber(value: string) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `972${digits.slice(1)}`;
  return digits;
}

export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendEmail(opts: { to: string; subject: string; html: string }) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("BOOKING_EMAIL_FROM") || "Lilach Website <onboarding@resend.dev>";
  if (!apiKey || !opts.to) return { sent: false, skipped: true };

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, html: opts.html })
  });
  if (!r.ok) {
    console.error("Resend error", await r.text());
    return { sent: false, skipped: false };
  }
  return { sent: true, skipped: false };
}

export async function sendWhatsappTemplate(opts: {
  to: string;
  templateName: string;
  params: string[];
  language?: string;
}) {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneNumberId || !opts.to || !opts.templateName) {
    return { sent: false, skipped: true };
  }

  const r = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizeWhatsappNumber(opts.to),
      type: "template",
      template: {
        name: opts.templateName,
        language: { code: opts.language || "he" },
        components: [{
          type: "body",
          parameters: opts.params.map((text) => ({ type: "text", text: String(text ?? "") }))
        }]
      }
    })
  });
  if (!r.ok) {
    console.error("WhatsApp error", await r.text());
    return { sent: false, skipped: false };
  }
  return { sent: true, skipped: false };
}

export async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
