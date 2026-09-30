import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, googleToken, localIso } from "../_shared_google.ts";

type WorkWindow = { start: number; end: number };

function timeToHour(value: unknown) {
  const match = /^(\d{2}):(\d{2})/.exec(String(value || ""));
  if (!match) return null;
  return Number(match[1]) + Number(match[2]) / 60;
}

function fallbackWindowsForWeekday(weekday: number): WorkWindow[] {
  switch (weekday) {
    case 0:
    case 1:
    case 3:
      return [{ start: 9, end: 16 }];
    case 2:
      return [
        { start: 9, end: 13 },
        { start: 17, end: 21 },
      ];
    case 4:
      return [{ start: 9, end: 15 }];
    default:
      return [];
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const date = url.searchParams.get("date");
    if (!date) return Response.json({ error: "date required" }, { status: 400, headers: corsHeaders });

    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!dateMatch) return Response.json({ error: "invalid date" }, { status: 400, headers: corsHeaders });

    const [, year, month, dayOfMonth] = dateMatch;
    const weekday = new Date(Date.UTC(Number(year), Number(month) - 1, Number(dayOfMonth), 12)).getUTCDay();

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) throw new Error("missing_supabase_credentials");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let windows: WorkWindow[] = [];

    const { data: exceptionRows, error: exceptionError } = await supabase
      .from("booking_availability_exceptions")
      .select("mode,start_time,end_time,sort_order")
      .eq("exception_date", date)
      .order("sort_order", { ascending: true });
    if (exceptionError) throw exceptionError;

    if ((exceptionRows || []).length) {
      if (exceptionRows!.some((row: any) => row.mode === "closed")) {
        windows = [];
      } else {
        windows = (exceptionRows || [])
          .filter((row: any) => row.mode === "custom")
          .map((row: any) => ({ start: timeToHour(row.start_time), end: timeToHour(row.end_time) }))
          .filter((window: any) => window.start !== null && window.end !== null && window.end > window.start) as WorkWindow[];
      }
    } else {
      const { data: weeklyRows, error: weeklyError } = await supabase
        .from("booking_availability_weekly")
        .select("start_time,end_time,sort_order,enabled")
        .eq("weekday", weekday)
        .eq("enabled", true)
        .order("sort_order", { ascending: true });
      if (weeklyError) throw weeklyError;

      if ((weeklyRows || []).length) {
        windows = (weeklyRows || [])
          .map((row: any) => ({ start: timeToHour(row.start_time), end: timeToHour(row.end_time) }))
          .filter((window: any) => window.start !== null && window.end !== null && window.end > window.start) as WorkWindow[];
      } else {
        windows = fallbackWindowsForWeekday(weekday);
      }
    }

    if (!windows.length) return Response.json({ slots: [] }, { headers: corsHeaders });

    const duration = Number(Deno.env.get("INTAKE_DURATION_MINUTES") || 50);
    const token = await googleToken();
    const calendarId = Deno.env.get("GOOGLE_CALENDAR_ID") || "primary";

    const earliestStart = Math.min(...windows.map((window) => window.start));
    const latestEnd = Math.max(...windows.map((window) => window.end));
    const toClock = (value: number) => {
      const hours = Math.floor(value);
      const minutes = Math.round((value - hours) * 60);
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    };
    const timeMin = localIso(date, toClock(earliestStart));
    const timeMax = localIso(date, toClock(latestEnd));

    const fb = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin,
        timeMax,
        timeZone: "Asia/Jerusalem",
        items: [{ id: calendarId }],
      }),
    });

    if (!fb.ok) throw new Error("freebusy failed");
    const j = await fb.json();
    const busy = j.calendars?.[calendarId]?.busy || [];

    const { data: bookings, error: bookingsError } = await supabase
      .from("intake_bookings")
      .select("booking_time,status,hold_expires_at")
      .eq("booking_date", date)
      .in("status", ["pending_payment", "awaiting_approval", "confirmed"]);
    if (bookingsError) throw bookingsError;

    const now = Date.now();
    const blockedTimes = new Set<string>();
    for (const booking of bookings || []) {
      const time = String(booking.booking_time || "").slice(0, 5);
      if (!time) continue;
      if (booking.status === "awaiting_approval" || booking.status === "confirmed") {
        blockedTimes.add(time);
        continue;
      }
      if (booking.status === "pending_payment") {
        const activeHold = !booking.hold_expires_at || new Date(booking.hold_expires_at).getTime() > now;
        if (activeHold) blockedTimes.add(time);
      }
    }

    const slots: string[] = [];
    for (const window of windows) {
      for (let mins = Math.round(window.start * 60); mins + duration <= Math.round(window.end * 60); mins += 60) {
        const hh = String(Math.floor(mins / 60)).padStart(2, "0");
        const mm = String(mins % 60).padStart(2, "0");
        const slotTime = `${hh}:${mm}`;
        const start = new Date(localIso(date, slotTime));
        const end = new Date(start.getTime() + duration * 60000);
        const calendarOverlap = busy.some((b: any) => new Date(b.start) < end && new Date(b.end) > start);
        if (!calendarOverlap && !blockedTimes.has(slotTime)) slots.push(slotTime);
      }
    }

    return Response.json({ slots }, {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("calendar-availability error:", e);
    return Response.json({ error: String(e) }, { status: 500, headers: corsHeaders });
  }
});
