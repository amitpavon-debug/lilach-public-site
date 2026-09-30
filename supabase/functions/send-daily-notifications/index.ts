import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_EMAIL = Deno.env.get("VAPID_EMAIL") || "mailto:lilach.pavon@gmail.com";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

webpush.setVapidDetails(
  VAPID_EMAIL,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

function localNow(timezone = "Asia/Jerusalem") {
  const now = new Date();

  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  return { date, time };
}

async function sendPush(subscription: unknown, title: string, body: string) {
  await webpush.sendNotification(
    subscription as webpush.PushSubscription,
    JSON.stringify({
      title,
      body,
      url: "/",
    })
  );
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // force=morning
  // force=evening
  // force=test
  const force = url.searchParams.get("force");

  const { data: rows, error } = await supabase
    .from("push_subscriptions")
    .select("*")
    .eq("enabled", true);

  if (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error.message,
      }),
      { status: 500 }
    );
  }

  const results = [];

  for (const row of rows || []) {
    const { date, time } = localNow(
      row.timezone || "Asia/Jerusalem"
    );

    console.log(
      `Checking ${row.user_email} | current=${time} | morning=${row.morning_time} | evening=${row.evening_time}`
    );

    // TEST
    if (force === "test") {
      await sendPush(
        row.subscription,
        "🎉 בדיקת התראה",
        "אם קיבלת את זה - הכל עובד!"
      );

      results.push({
        type: "test",
        sent: true,
      });

      continue;
    }

    // MORNING
    if (
      (force === "morning" ||
        String(row.morning_time).slice(0, 5) === time) &&
      row.last_morning_sent_date !== date
    ) {
      await sendPush(
        row.subscription,
        "בוקר טוב לילך 🌞",
        "אל תשכחי להיכנס לעוזרת האישית ולבדוק מה קורה היום"
      );

      await supabase
        .from("push_subscriptions")
        .update({
          last_morning_sent_date: date,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      results.push({
        type: "morning",
        sent: true,
      });
    }

    // EVENING
    if (
      (force === "evening" ||
        String(row.evening_time).slice(0, 5) === time) &&
      row.last_evening_sent_date !== date
    ) {
      await sendPush(
        row.subscription,
        "סיכום סוף יום 🌙",
        "כנסי לעוזרת האישית לראות מה הושלם היום ומה נשאר למחר"
      );

      await supabase
        .from("push_subscriptions")
        .update({
          last_evening_sent_date: date,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      results.push({
        type: "evening",
        sent: true,
      });
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      checked: rows?.length || 0,
      results,
    }),
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
});