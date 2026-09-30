import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { EMAIL_SIGNATURE_BASE64 } from "https://raw.githubusercontent.com/amitpavon-debug/lilach-public-site/dac5c97e91b9c030f9b6790422767a9ad8d69003/supabase/functions/approve-booking/email_signature.ts";

Deno.serve(() => {
  const binary = atob(EMAIL_SIGNATURE_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(bytes.length),
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
