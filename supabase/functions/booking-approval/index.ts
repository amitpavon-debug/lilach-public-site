import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

async function sha256(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return Response.json({ error: "POST only" }, { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const bookingId = String(body?.bookingId || "").trim();
    const approvalToken = String(body?.approvalToken || "").trim();

    if (!bookingId || !approvalToken) {
      return Response.json(
        { error: "booking_id_and_approval_token_required" },
        { status: 400, headers: corsHeaders },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) throw new Error("missing_supabase_server_credentials");

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: booking, error } = await supabase
      .from("intake_bookings")
      .select("id,booking_date,booking_time,first_name,last_name,phone,status,payment_status,approval_token_hash")
      .eq("id", bookingId)
      .maybeSingle();

    if (error) throw error;
    if (!booking) {
      return Response.json({ error: "booking_not_found" }, { status: 404, headers: corsHeaders });
    }

    const receivedHash = await sha256(approvalToken);
    if (!booking.approval_token_hash || receivedHash !== booking.approval_token_hash) {
      return Response.json({ error: "invalid_approval_token" }, { status: 401, headers: corsHeaders });
    }

    if (!["paid", "not_required"].includes(booking.payment_status)) {
      return Response.json({ error: "booking_not_ready_for_approval" }, { status: 409, headers: corsHeaders });
    }

    if (!["awaiting_approval", "confirmed"].includes(booking.status)) {
      return Response.json(
        { error: "booking_not_awaiting_approval", status: booking.status },
        { status: 409, headers: corsHeaders },
      );
    }

    return Response.json(
      {
        ok: true,
        bookingId: booking.id,
        name: [booking.first_name, booking.last_name].filter(Boolean).join(" "),
        phone: booking.phone || "",
        date: booking.booking_date,
        time: String(booking.booking_time || "").slice(0, 5),
        status: booking.status,
        paymentStatus: booking.payment_status,
      },
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("BOOKING APPROVAL DETAILS ERROR:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500, headers: corsHeaders },
    );
  }
});
