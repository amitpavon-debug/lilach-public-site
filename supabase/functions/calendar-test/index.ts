import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve((req) => {
  if (req.method !== "GET") return new Response("GET only", { status: 405 });
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lilach Pavon//Mobile Calendar Test//HE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    "UID:test-mobile-calendar-20261002@lilachpavon.co.il",
    "DTSTAMP:20260930T120000Z",
    "DTSTART:20261002T070000Z",
    "DTEND:20261002T075000Z",
    "SUMMARY:פגישת בדיקה עם לילך פבון",
    "LOCATION:הכישור 30\\, חולון",
    "DESCRIPTION:אירוע בדיקה בלבד.\\n\\nבפגישה אמיתית יופיע כאן קישור לביטול הפגישה.\\n\\nביטול או שינוי בפחות מ־24 שעות מהמועד כרוך בתשלום של 150 ₪ בהתאם למדיניות הביטולים.",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8; method=PUBLISH",
      "Content-Disposition": "inline; filename=\"lilach-test-appointment.ics\"",
      "Cache-Control": "no-store",
    },
  });
});
