// ==========================================================================
// Code the Future — text-to-speech proxy (ElevenLabs)
//
// POST /api/tts  { text: "..." }  →  audio/mpeg
//
// The ElevenLabs key stays server-side: set ELEVENLABS_API_KEY in Netlify
// env vars (and locally in capstone/.env). Optional: ELEVENLABS_VOICE_ID
// (defaults to the project's chosen narrator voice — Jon's ElevenLabs voice).
// Built for the lesson player's "Read to me" accessibility button.
// ==========================================================================

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return json({ error: "Voice isn't set up yet — add ELEVENLABS_API_KEY." }, 500);

  let body = {};
  try { body = await req.json(); } catch (e) { return json({ error: "Invalid JSON body." }, 400); }

  const text = (body.text || "").toString().replace(/\s+/g, " ").trim().slice(0, 900);
  if (!text) return json({ error: "Nothing to read." }, 400);

  const voice = process.env.ELEVENLABS_VOICE_ID || "VZL4mFdzQmqG9QkUfhNw"; // Jon's chosen narrator voice

  try {
    const r = await fetch(
      "https://api.elevenlabs.io/v1/text-to-speech/" + voice + "?output_format=mp3_44100_64",
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 }
        })
      }
    );
    if (!r.ok) {
      const detail = await r.text();
      return json({ error: "Voice service error (" + r.status + ").", detail: detail.slice(0, 300) }, 502);
    }
    return new Response(await r.arrayBuffer(), {
      status: 200,
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" }
    });
  } catch (e) {
    return json({ error: "Could not reach the voice service.", detail: String(e).slice(0, 200) }, 502);
  }
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json" }
  });
}
