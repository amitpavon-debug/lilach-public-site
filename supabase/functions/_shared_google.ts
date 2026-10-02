export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};

const TIME_ZONE = "Asia/Jerusalem";

export async function getGoogleRefreshToken() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (supabaseUrl && serviceRoleKey) {
    try {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/google_connections?id=eq.lilach&select=refresh_token`,
        {
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            Accept: "application/json",
          },
        },
      );
      if (response.ok) {
        const rows = await response.json();
        const storedToken = String(rows?.[0]?.refresh_token || "").trim();
        if (storedToken) return storedToken;
      } else {
        console.error("GOOGLE CONNECTION READ ERROR:", response.status, await response.text());
      }
    } catch (error) {
      console.error("GOOGLE CONNECTION READ ERROR:", error);
    }
  }

  const fallbackToken = Deno.env.get("GOOGLE_REFRESH_TOKEN") || "";
  if (!fallbackToken) throw new Error("google_refresh_token_missing");
  return fallbackToken;
}

export async function googleToken() {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
  const refreshToken = await getGoogleRefreshToken();
  if (!clientId || !clientSecret || !refreshToken) throw new Error("missing_google_credentials");

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) {
    console.error("GOOGLE TOKEN ERROR:", r.status, await r.text());
    throw new Error("google_token_failed");
  }
  const json = await r.json();
  if (!json.access_token) throw new Error("google_access_token_missing");
  return json.access_token;
}

function timeZoneOffsetMinutes(instant: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(instant);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  const zonedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );

  return Math.round((zonedAsUtc - instant.getTime()) / 60000);
}

export function localIso(date: string, time: string) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch) throw new Error("invalid local date/time");

  const [, year, month, day] = dateMatch;
  const [, hour, minute] = timeMatch;
  const wallTimeAsUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0
  );

  let offsetMinutes = timeZoneOffsetMinutes(new Date(wallTimeAsUtc));
  let instantMs = wallTimeAsUtc - offsetMinutes * 60_000;

  // Re-evaluate once at the resolved instant so daylight-saving transitions
  // are handled according to Asia/Jerusalem instead of a fixed +02/+03 offset.
  const correctedOffset = timeZoneOffsetMinutes(new Date(instantMs));
  if (correctedOffset !== offsetMinutes) {
    offsetMinutes = correctedOffset;
    instantMs = wallTimeAsUtc - offsetMinutes * 60_000;
  }

  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(abs / 60)).padStart(2, "0");
  const offsetMins = String(abs % 60).padStart(2, "0");

  return `${date}T${time}:00${sign}${offsetHours}:${offsetMins}`;
}
