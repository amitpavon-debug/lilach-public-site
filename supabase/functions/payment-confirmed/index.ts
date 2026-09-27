import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-payment-secret",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

async function sha256(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function createApprovalToken(bookingId: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`lilach-booking-approval:${bookingId}`),
  );

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return Response.json({ error: "POST only" }, { status: 405, headers: corsHeaders });
  }

  try {
    const expectedSecret = Deno.env.get("PAYMENT_WEBHOOK_SECRET") || "";
    const approvalLinkSecret = Deno.env.get("APPROVAL_LINK_SECRET") || "";
    if (!expectedSecret) throw new Error("payment_webhook_secret_not_configured");
    if (!approvalLinkSecret) throw new Error("approval_link_secret_not_configured");

    const receivedSecret = req.headers.get("x-payment-secret") || "";
    if (receivedSecret !== expectedSecret) {
      return Response.json({ error: "unauthorized" }, { status: 401, headers: corsHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const bookingId = String(body?.bookingId || "").trim();
    const paymentReference = String(body?.paymentReference || "").trim();
    if (!bookingId) {
      return Response.json({ error: "booking_id_required" }, { status: 400, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) throw new Error("missing_supabase_server_credentials");

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: booking, error: bookingError } = await supabase
      .from("intake_bookings")
      .select("id,status,payment_status,booking_date,booking_time")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError) throw bookingError;
    if (!booking) {
      return Response.json({ error: "booking_not_found" }, { status: 404, headers: corsHeaders });
    }

    const approvalToken = await createApprovalToken(booking.id, approvalLinkSecret);
    const approvalTokenHash = await sha256(approvalToken);
    const approvalPageBase = Deno.env.get("APPROVAL_SITE_URL") || "https://lilach-public-site.vercel.app/approval";
    const approvalUrl = `${approvalPageBase}?bookingId=${encodeURIComponent(booking.id)}&token=${encodeURIComponent(approvalToken)}`;

    if (
      booking.payment_status === "paid" &&
      ["awaiting_approval", "confirmed"].includes(booking.status)
    ) {
      const { error: tokenUpdateError } = await supabase
        .from("intake_bookings")
        .update({
          approval_token_hash: approvalTokenHash,
          updated_at: new Date().toISOString(),
        })
        .eq("id", booking.id);

      if (tokenUpdateError) throw tokenUpdateError;

      return Response.json(
        {
          ok: true,
          alreadyProcessed: true,
          bookingId: booking.id,
          status: booking.status,
          paymentStatus: booking.payment_status,
          approvalUrl,
        },
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!["pending_payment", "expired"].includes(booking.status)) {
      return Response.json(
        { error: "invalid_booking_status", status: booking.status },
        { status: 409, headers: corsHeaders },
      );
    }

    const updatePayload: Record<string, unknown> = {
      payment_status: "paid",
      status: "awaiting_approval",
      approval_token_hash: approvalTokenHash,
      updated_at: new Date().toISOString(),
    };

    if (paymentReference) updatePayload.payment_reference = paymentReference;

    const { data: updated, error: updateError } = await supabase
      .from("intake_bookings")
      .update(updatePayload)
      .eq("id", booking.id)
      .select("id,status,payment_status,booking_date,booking_time")
      .single();

    if (updateError) throw updateError;

    return Response.json(
      {
        ok: true,
        bookingId: updated.id,
        status: updated.status,
        paymentStatus: updated.payment_status,
        date: updated.booking_date,
        time: String(updated.booking_time || "").slice(0, 5),
        approvalUrl,
      },
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("PAYMENT CONFIRMED ERROR:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500, headers: corsHeaders },
    );
  }
});
