// ==========================================================================
// Code the Future — kid-safe image generation proxy (Netlify Function)
//
// POST /api/image  { prompt: "a robot parade" }
//   → { image: "data:image/png;base64,..." }
//
// The OpenAI key stays server-side (Netlify env var OPENAI_API_KEY).
// Prompts are wrapped in a kid-safe, on-brand template; OpenAI's own safety
// system provides a second layer. Optional env: OPENAI_IMAGE_MODEL (default
// dall-e-3).
// ==========================================================================

const STYLE =
  "A joyful, vibrant, kid-friendly digital illustration for a children's coding camp " +
  "homepage hero. Scene: the Louisville, Kentucky skyline full of optimism and wonder — ";

const SUFFIX =
  ". Bright colors, warm light, friendly and whimsical, safe and appropriate for children " +
  "ages 8-11. No words, letters, or text in the image.";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const key = process.env.OPENAI_API_KEY;
  if (!key) return json({ error: "Server is missing OPENAI_API_KEY." }, 500);

  let body = {};
  try { body = await req.json(); } catch (e) { return json({ error: "Invalid JSON body." }, 400); }

  const raw = (body.prompt || "").toString().slice(0, 400).trim();
  if (!raw) return json({ error: "Please describe your picture first." }, 400);

  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

  try {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({
        model,
        prompt: STYLE + raw + SUFFIX,
        n: 1,
        size: "1536x1024",
        quality: "medium"
      })
    });

    if (!r.ok) {
      const detail = await r.text();
      // OpenAI safety refusals come back as 400s — give kids a friendly nudge.
      const friendly = r.status === 400
        ? "Hmm, the art robot couldn't draw that one. Try describing something different!"
        : "The art robot is having trouble right now (" + r.status + "). Try again in a moment.";
      return json({ error: friendly, detail: detail.slice(0, 300) }, 502);
    }
    const data = await r.json();
    const item = data && data.data && data.data[0];
    let b64 = item && item.b64_json;
    if (!b64 && item && item.url) {
      // some models return a (temporary) URL — fetch it server-side so the
      // client gets a stable data URL instead of a link that expires.
      const ir = await fetch(item.url);
      if (ir.ok) b64 = Buffer.from(await ir.arrayBuffer()).toString("base64");
    }
    if (!b64) return json({ error: "No image came back — try again!" }, 502);
    return json({ image: "data:image/png;base64," + b64, model });
  } catch (e) {
    return json({ error: "Could not reach the art robot.", detail: String(e).slice(0, 200) }, 502);
  }
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json" }
  });
}
