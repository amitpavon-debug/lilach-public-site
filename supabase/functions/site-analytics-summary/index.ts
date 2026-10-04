import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://www.lilachpavon.co.il",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};

function israelDateKey(offsetDays = 0) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(now.getTime() + offsetDays * 86400000));
  const values: Record<string,string> = {};
  for (const p of parts) if (p.type !== "literal") values[p.type] = p.value;
  return `${values.year}-${values.month}-${values.day}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return Response.json({ error: "GET only" }, { status: 405, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) throw new Error("missing_supabase_server_credentials");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const today = israelDateKey(0);
    const from7 = israelDateKey(-6);
    const from30 = israelDateKey(-29);

    const { data: analyticsRows, error: analyticsError } = await supabase
      .from("site_analytics_daily")
      .select("event_date,event_type,event_count")
      .order("event_date", { ascending: true });
    if (analyticsError) throw analyticsError;

    const rows = analyticsRows || [];
    const sum = (type: string, from?: string) => rows
      .filter((r: any) => r.event_type === type && (!from || String(r.event_date) >= from))
      .reduce((acc: number, r: any) => acc + Number(r.event_count || 0), 0);

    const dailyMap: Record<string, any> = {};
    for (let i = 29; i >= 0; i--) {
      const date = israelDateKey(-i);
      dailyMap[date] = { date, visits: 0, bookingRequests: 0, confirmed: 0 };
    }
    for (const row of rows) {
      const date = String(row.event_date);
      if (!dailyMap[date]) continue;
      const count = Number(row.event_count || 0);
      if (row.event_type === "visit") dailyMap[date].visits += count;
      if (row.event_type === "booking_request") dailyMap[date].bookingRequests += count;
      if (row.event_type === "booking_confirmed") dailyMap[date].confirmed += count;
    }

    const from30Iso = `${from30}T00:00:00+00:00`;
    const { data: bookingRows, error: bookingError } = await supabase
      .from("intake_bookings")
      .select("created_at,status,appointment_type,meeting_mode")
      .gte("created_at", from30Iso)
      .limit(5000);
    if (bookingError) throw bookingError;

    const statusCounts: Record<string,number> = {};
    const typeCounts = { intake: 0, therapy: 0, unknown: 0 };
    const modeCounts = { clinic: 0, zoom: 0, unknown: 0 };
    for (const row of bookingRows || []) {
      const status = String(row.status || "unknown");
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      const type = String(row.appointment_type || "");
      if (type === "intake" || type === "therapy") typeCounts[type] += 1;
      else typeCounts.unknown += 1;
      const mode = String(row.meeting_mode || "");
      if (mode === "clinic" || mode === "zoom") modeCounts[mode] += 1;
      else modeCounts.unknown += 1;
    }

    const visits30 = sum("visit", from30);
    const requests30 = sum("booking_request", from30);
    const confirmed30 = sum("booking_confirmed", from30);

    return Response.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      summary: {
        todayVisits: sum("visit", today),
        last7Visits: sum("visit", from7),
        last30Visits: visits30,
        totalVisits: sum("visit"),
        last30BookingRequests: requests30,
        totalBookingRequests: sum("booking_request"),
        last30Confirmed: confirmed30,
        totalConfirmed: sum("booking_confirmed"),
        visitorToRequestRate: visits30 > 0 ? requests30 / visits30 : 0,
        requestToConfirmedRate: requests30 > 0 ? confirmed30 / requests30 : 0,
      },
      last30Days: Object.values(dailyMap),
      bookingsLast30: {
        total: (bookingRows || []).length,
        statuses: statusCounts,
        appointmentTypes: typeCounts,
        meetingModes: modeCounts,
      },
    }, {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("SITE ANALYTICS SUMMARY ERROR:", error);
    return Response.json({ error: "analytics_summary_failed" }, {
      status: 500,
      headers: { ...corsHeaders, "Cache-Control": "no-store" },
    });
  }
});
