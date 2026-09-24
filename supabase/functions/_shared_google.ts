export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};

export async function googleToken() {
  const body = new URLSearchParams({
    client_id: Deno.env.get("GOOGLE_CLIENT_ID") || "",
    client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") || "",
    refresh_token: Deno.env.get("GOOGLE_REFRESH_TOKEN") || "",
    grant_type: "refresh_token"
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"}, body});
  if(!r.ok) throw new Error("google token failed");
  return (await r.json()).access_token;
}

export function localIso(date: string, time: string){ return `${date}T${time}:00+03:00`; }
