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

  const text = cleanForSpeech((body.text || "").toString()).slice(0, 900);
  if (!text) return json({ error: "Nothing to read." }, 400);

  // Unhurried delivery: the voice otherwise sprints straight through periods.
  // <break> is ElevenLabs' pause tag — inject one at every sentence end (and a
  // shorter one after colons). Must run AFTER cleanForSpeech, which strips <>/ .
  const paced = text
    .replace(/([.!?])\s+/g, '$1 <break time="0.4s" /> ')
    .replace(/:\s+/g, ': <break time="0.25s" /> ');

  const voice = process.env.ELEVENLABS_VOICE_ID || "VZL4mFdzQmqG9QkUfhNw"; // Jon's chosen narrator voice
  // 0.7–1.2; default 1.0 reads rushed for kids. Override with ELEVENLABS_SPEED.
  const speed = Math.min(1.2, Math.max(0.7, parseFloat(process.env.ELEVENLABS_SPEED) || 0.9));

  try {
    const r = await fetch(
      "https://api.elevenlabs.io/v1/text-to-speech/" + voice + "?output_format=mp3_44100_64",
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: paced,
          model_id: "eleven_turbo_v2_5",
          voice_settings: { stability: 0.5, similarity_boost: 0.75, speed }
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

// Make text sound natural when read aloud: symbols become pauses or vanish
// instead of being pronounced ("—" was read as "dash dash"). Every caller
// (player narration, tour, widgets) is covered here in one place.
function cleanForSpeech(s) {
  return String(s)
    // emoji + pictographs + dingbats + variation selectors → gone
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}️‍]/gu, " ")
    // number ranges & fractions read naturally: 1--4 / 1–4 → "1 to 4", 10/12 → "10 of 12"
    .replace(/(\d)\s*(?:--+|[—–-])\s*(\d)/g, "$1 to $2")
    .replace(/(\d+)\s*\/\s*(\d+)/g, "$1 of $2")
    // em/en dashes and "--" become a spoken pause (comma)
    .replace(/\s*[—–]+\s*/g, ", ")
    .replace(/\s*--+\s*/g, ", ")
    // ellipsis → a sentence break; bullets/markup symbols → silence
    .replace(/(\.{3,}|…)/g, ". ")
    .replace(/[•·▪▸►★☆✓✔✗✦*_`#~^|<>{}\[\]\\\/]+/g, " ")
    // curly quotes → plain (read naturally), stray plus/equals → words kids hear right
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    // tidy up: collapse spaces, fix space-before-punctuation and doubled commas/periods
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?])(?:\s*[,.;:]+)+/g, "$1")
    .replace(/,\s*([.!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json" }
  });
}
