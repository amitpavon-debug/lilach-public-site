import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return Response.json({ error: "POST only" }, { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const event = String(body?.event || "").trim();
    if (event !== "visit") {
      return Response.json({ error: "invalid_event" }, { status: 400, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) throw new Error("missing_supabase_server_credentials");

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { error } = await supabase.rpc("increment_site_analytics", { p_event_type: "visit" });
    if (error) throw error;

    return Response.json({ ok: true }, {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("SITE ANALYTICS ERROR:", error);
    return Response.json({ error: "analytics_failed" }, { status: 500, headers: corsHeaders });
  }
});
