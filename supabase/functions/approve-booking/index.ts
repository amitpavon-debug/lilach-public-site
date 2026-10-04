import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const originalFetch = globalThis.fetch.bind(globalThis);
const CALENDAR_EVENT_BASE = "https://taafqwplvzcceoynhvve.supabase.co/functions/v1/calendar-event";

function decodeHtmlUrl(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'");
}

function encodeHtmlUrl(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  try {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url === "https://api.resend.com/emails" && typeof init?.body === "string") {
      const payload = JSON.parse(init.body);
      if (typeof payload?.html === "string" && payload.html.includes("הוספה ליומן Google") && payload.html.includes("ביטול הפגישה")) {
        let html = payload.html as string;
        const calendarMatch = html.match(/<a href="([^"]+)"[^>]*>הוספה ליומן Google<\/a>/);
        const cancelMatch = html.match(/<a href="([^"]+)"[^>]*>ביטול הפגישה<\/a>/);

        if (calendarMatch?.[1] && cancelMatch?.[1]) {
          const calendarUrl = decodeHtmlUrl(calendarMatch[1]);
          const cancelUrl = decodeHtmlUrl(cancelMatch[1]);

          const googleParsed = new URL(calendarUrl);
          const existingDetails = googleParsed.searchParams.get("details") || "פגישה שאושרה דרך אתר לילך פבון";
          googleParsed.searchParams.set(
            "details",
            `${existingDetails}\n\nביטול הפגישה:\n${cancelUrl}\n\nביטול או שינוי בפחות מ־24 שעות מהמועד כרוך בתשלום של 150 ₪ בהתאם למדיניות הביטולים.`,
          );
          const googleCalendarUrl = googleParsed.toString();

          const cancelParsed = new URL(cancelUrl);
          const bookingId = cancelParsed.searchParams.get("bookingId") || "";
          const token = cancelParsed.searchParams.get("token") || "";
          const mobileCalendarUrl = `${CALENDAR_EVENT_BASE}?bookingId=${encodeURIComponent(bookingId)}&token=${encodeURIComponent(token)}`;

          const mobileButton = calendarMatch[0]
            .replace(calendarMatch[1], encodeHtmlUrl(mobileCalendarUrl))
            .replace("הוספה ליומן Google", "הוספה ליומן בטלפון");
          html = html.replace(calendarMatch[0], mobileButton);

          const oldHelp = "לחיצה על הכפתור תפתח אירוע מוכן עם פרטי הפגישה.";
          const newHelp = "לחיצה על הכפתור תפתח אירוע מוכן באפליקציית היומן של הטלפון, עם פרטי הפגישה וקישור לביטול.";
          html = html.replace(oldHelp, newHelp);

          const helpParagraph = `<p style="text-align:center;margin:6px 0 18px;color:#667066;font-size:14px">${newHelp}</p>`;
          const googleFallback = `${helpParagraph}\n      <div style="text-align:center;margin:0 0 18px"><a href="${encodeHtmlUrl(googleCalendarUrl)}" target="_blank" rel="noopener" style="color:#5f7855;text-decoration:underline;font-size:14px">הוספה ל-Google Calendar</a></div>`;
          html = html.replace(helpParagraph, googleFallback);

          try {
            const icsResponse = await originalFetch(mobileCalendarUrl, {
              method: "GET",
              headers: { Accept: "text/calendar" },
            });
            if (icsResponse.ok) {
              const icsBase64 = arrayBufferToBase64(await icsResponse.arrayBuffer());
              const existingAttachments = Array.isArray(payload.attachments) ? payload.attachments : [];
              const withoutOldCalendar = existingAttachments.filter((attachment: any) => attachment?.filename !== "lilach-appointment.ics");
              payload.attachments = [
                ...withoutOldCalendar,
                {
                  content: icsBase64,
                  filename: "lilach-appointment.ics",
                  content_type: "text/calendar; charset=utf-8",
                },
              ];
            } else {
              console.error("CALENDAR ATTACHMENT FETCH ERROR:", icsResponse.status, await icsResponse.text());
            }
          } catch (calendarError) {
            console.error("CALENDAR ATTACHMENT ERROR:", calendarError);
          }

          payload.html = html;
          init = { ...init, body: JSON.stringify(payload) };
        }
      }
    }
  } catch (error) {
    console.error("MOBILE CALENDAR LINK PATCH ERROR:", error);
  }

  return originalFetch(input, init);
};

await import("https://raw.githubusercontent.com/amitpavon-debug/lilach-public-site/c0625ee4114c27b4022544dce9255acd1e3d96ba/supabase/functions/approve-booking/base.ts");
