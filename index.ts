// Supabase Edge Function: "gemini"
// Holds the Gemini API key server-side and proxies requests to Google.
// The browser calls THIS function; the real key is never sent to the client.
//
// Deploy:
//   supabase secrets set GEMINI_API_KEY=your_new_key_here
//   supabase functions deploy gemini
//
// The frontend calls: POST https://<project>.supabase.co/functions/v1/gemini
// with body { contents, generationConfig } and a Supabase auth header.

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const MODEL = "gemini-2.5-flash-lite";
const ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`;

// Tighten this to your real domain once deployed, e.g. "https://squadcal.app"
const ALLOW_ORIGIN = "*";

const cors = {
  "Access-Control-Allow-Origin": ALLOW_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!GEMINI_KEY) {
    return json({ error: "Server is missing GEMINI_API_KEY secret" }, 500);
  }

  // Note: with verify_jwt enabled (the default), Supabase already rejects
  // requests without a valid project JWT before this code runs, so this
  // function is not an open proxy. This is a defensive double-check.
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  let payload: { contents?: unknown; generationConfig?: unknown };
  try {
    const body = await req.json();
    // Only forward the generation payload. Ignore anything else the client sends.
    payload = {
      contents: body.contents,
      generationConfig: body.generationConfig,
    };
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  try {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    // Pass Google's status through so the frontend's gr.ok logic still works.
    return json(data, r.status);
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
});
