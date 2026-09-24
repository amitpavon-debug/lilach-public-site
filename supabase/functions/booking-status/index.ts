import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared_google.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const bookingId = url.searchParams.get("booking_id");
  if (!bookingId) return Response.json({ error: "booking_id required" }, { status: 400, headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await supabase.from("intake_bookings")
    .select("id,first_name,last_name,email,booking_date,booking_time,status,payment_status")
    .eq("id", bookingId).maybeSingle();
  if (error || !data) return Response.json({ error: "not_found" }, { status: 404, headers: corsHeaders });

  return Response.json({
    status: data.status,
    paymentStatus: data.payment_status,
    name: `${data.first_name} ${data.last_name}`,
    email: data.email || "",
    date: data.booking_date,
    time: String(data.booking_time).slice(0, 5)
  }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
