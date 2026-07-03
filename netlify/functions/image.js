// ==========================================================================
// Code the Future — kid-safe image generation proxy (Netlify Function)
//
// POST /api/image  { prompt, kind?, style? }
//   kind: "hero" (default — homepage remix, Louisville wrapper)
//         "scene"  — Sandbox background, landscape, kid's own subject + style
//         "sprite" — Sandbox object: single subject on a TRANSPARENT bg (png)
//         "cover"  — Storybook cover art, portrait
//   style: one of STYLES (scene/sprite/cover only)
//   → { image: "data:image/png;base64,..." }
//
// The OpenAI key stays server-side. Prompts are wrapped in kid-safe templates;
// OpenAI's safety system provides a second layer.
// ==========================================================================

const HERO_STYLE =
  "A joyful, vibrant, kid-friendly digital illustration for a children's coding camp " +
  "homepage hero. Scene: the Louisville, Kentucky skyline full of optimism and wonder — ";

const KID_SAFE =
  " Bright, friendly and whimsical, safe and appropriate for children ages 8-11. " +
  "No words, letters, or text in the image.";

const STYLES = {
  anime:      "in a bright, cheerful anime style",
  watercolor: "as a soft, dreamy watercolor painting",
  pixel:      "in colorful retro pixel-art style",
  comic:      "in a bold comic-book style with clean ink outlines",
  clay:       "in a cute 3D claymation style",
  storybook:  "as a classic children's storybook illustration"
};

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const key = process.env.OPENAI_API_KEY;
  if (!key) return json({ error: "Server is missing OPENAI_API_KEY." }, 500);

  let body = {};
  try { body = await req.json(); } catch (e) { return json({ error: "Invalid JSON body." }, 400); }

  const raw = (body.prompt || "").toString().slice(0, 400).trim();
  if (!raw) return json({ error: "Please describe your picture first." }, 400);
  const kind = ["scene", "sprite", "cover"].includes(body.kind) ? body.kind : "hero";
  const style = STYLES[body.style] || STYLES.storybook;

  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
  let prompt, size = "1536x1024", quality = "medium", extra = {};

  if (kind === "scene") {
    prompt = "A wide background scene for a kid's art project: " + raw + ", " + style +
      ". A rich detailed environment with open space, no main character in the foreground." + KID_SAFE;
  } else if (kind === "sprite") {
    prompt = "A single object for a kid's art project: " + raw + ", " + style +
      ". Exactly ONE subject, whole and centered, isolated on a fully transparent background. " +
      "No ground, no shadow, no scenery, nothing else in the image." + KID_SAFE;
    size = "1024x1024"; quality = "low";
    extra = { background: "transparent", output_format: "png" };
  } else if (kind === "cover") {
    prompt = "A beautiful children's storybook COVER illustration about: " + raw + ", " + style +
      ". Rich, magical, inviting — leave gentle space near the top for a title." + KID_SAFE;
    size = "1024x1536";
  } else {
    prompt = HERO_STYLE + raw + "." + KID_SAFE;
  }

  try {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({ model, prompt, n: 1, size, quality, ...extra })
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
