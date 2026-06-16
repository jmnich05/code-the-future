# Build Lab — working prototype

The screens-up half of the Library Session: the room builds one real AI together, live.
Design + run-of-show: [`../curriculum/in-person/build-lab.md`](../curriculum/in-person/build-lab.md).

## How to run it
1. **Big screen** (Jon's laptop → projector): open **`screen.html`**. It generates a 4-letter
   **JOIN CODE** (top right). Use the stage chips to drive the room: *Who Is It? → Feed the
   Brain → House Rules → First Contact.*
2. **Kids' devices**: open **`play.html`**, type the code + a name, **Join**.
3. Kids submit name ideas / facts / rules. Everything lands in the mentor **approve-gate** on
   the big screen — tap ✓ to send it into the brain (kids get a "✓ it learned your fact!").
4. **First Contact**: type the room's question, hit **▶ Run it** — the AI answers in its
   personality using only the facts they fed it (real OpenAI via `/api/ai`).

## How it works
- **Realtime** = Supabase broadcast channel `buildlab:<CODE>` (reuses the project's anon
  config). The big screen is the source of truth.
- **Persistence** = the big screen saves the whole assembled AI (identity + facts + rules +
  stage) as a blob in the `buildlab_sessions` table, debounced. On reload with the same
  `?code=`, it **rehydrates** — so a projector hiccup doesn't wipe the room's work.
- **The "AI they built"** = the dedicated **`/api/buildlab`** endpoint. The kids' identity,
  rules, and facts are assembled server-side into a system prompt behind a **fixed kid-safe
  preamble that their content can't override** (bigger knowledge base + token budget than
  `/api/ai`).
- **Moderation** = `CTFFilter` on each submission (client) **+** the mentor approve-gate
  (nothing hits the screen unapproved) **+** the fixed safety preamble in the endpoint.

## Verified
Realtime round-trip (kid → screen → approve → brain → "approved" back to kid), stage sync,
moderation, and **persistence (reload rehydrates from Supabase)** all tested in preview. The
AI call returns a mock on `localhost` and the real answer when **deployed** (the function
needs Netlify) — confirm First Contact on the deploy preview.

## Known limits / next steps
- **Gating** — `buildlab/` is intentionally public (kids need frictionless phone access; the
  4-letter code is the soft gate). Revisit if needed.
- **"Grab from the internet"** data source (a vetted encyclopedia-summary fetch) isn't wired
  yet — v1 is type-a-fact. Clear next addition.
- **Identity stage** is host-driven (kids suggest names, host picks); democratic voting = v2.
- **Cleanup** — old `buildlab_sessions` rows aren't auto-pruned; add a TTL/cron later.
