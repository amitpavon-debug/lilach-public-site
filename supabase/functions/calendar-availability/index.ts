import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, googleToken, localIso } from "../_shared_google.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const date = url.searchParams.get("date");
    if (!date) return Response.json({ error: "date required" }, { status: 400, headers: corsHeaders });

    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!dateMatch) return Response.json({ error: "invalid date" }, { status: 400, headers: corsHeaders });

    const [, year, month, dayOfMonth] = dateMatch;
    const workdays = (Deno.env.get("INTAKE_WORKDAYS") || "0,1,2,3,4").split(",").map(Number);
    const weekday = new Date(Date.UTC(Number(year), Number(month) - 1, Number(dayOfMonth), 12)).getUTCDay();
    if (!workdays.includes(weekday)) return Response.json({ slots: [] }, { headers: corsHeaders });

    const startH = Number(Deno.env.get("INTAKE_START_HOUR") || 9);
    const endH = Number(Deno.env.get("INTAKE_END_HOUR") || 19);
    const duration = Number(Deno.env.get("INTAKE_DURATION_MINUTES") || 50);

    const token = await googleToken();
    const calendarId = Deno.env.get("GOOGLE_CALENDAR_ID") || "primary";
    const timeMin = localIso(date, `${String(startH).padStart(2, "0")}:00`);
    const timeMax = localIso(date, `${String(endH).padStart(2, "0")}:00`);

    const fb = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        timeMin,
        timeMax,
        timeZone: "Asia/Jerusalem",
        items: [{ id: calendarId }]
      })
    });

    if (!fb.ok) throw new Error("freebusy failed");
    const j = await fb.json();
    const busy = j.calendars?.[calendarId]?.busy || [];

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) throw new Error("missing_supabase_credentials");

    const supabase = createClient(supabaseUrl, serviceRoleKey);
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
    for (let mins = startH * 60; mins + duration <= endH * 60; mins += 60) {
      const hh = String(Math.floor(mins / 60)).padStart(2, "0");
      const mm = String(mins % 60).padStart(2, "0");
      const slotTime = `${hh}:${mm}`;
      const start = new Date(localIso(date, slotTime));
      const end = new Date(start.getTime() + duration * 60000);
      const calendarOverlap = busy.some((b: any) => new Date(b.start) < end && new Date(b.end) > start);
      if (!calendarOverlap && !blockedTimes.has(slotTime)) slots.push(slotTime);
    }

    return Response.json({ slots }, {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error("calendar-availability error:", e);
    return Response.json({ error: String(e) }, { status: 500, headers: corsHeaders });
  }
});
