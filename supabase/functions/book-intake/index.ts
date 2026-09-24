import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders } from "../_shared_google.ts";

serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return Response.json({
    error: "deprecated_flow",
    message: "Direct booking is disabled. Use booking-hold -> verified payment -> Lilach approval -> approve-booking."
  }, { status: 410, headers: corsHeaders });
});
