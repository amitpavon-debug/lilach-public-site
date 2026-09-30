import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { CHUNK1 } from "./logo_1.ts";
import { CHUNK2 } from "./logo_2.ts";
import { CHUNK3 } from "./logo_3.ts";
import { CHUNK4 } from "./logo_4.ts";

const BASE64 = CHUNK1 + CHUNK2 + CHUNK3 + CHUNK4;
const bytes = Uint8Array.from(atob(BASE64), (c) => c.charCodeAt(0));

Deno.serve(() => new Response(bytes, {
  headers: {
    "Content-Type": "image/jpeg",
    "Cache-Control": "public, max-age=86400, s-maxage=604800",
    "Access-Control-Allow-Origin": "*",
  },
}));
