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
  config; no tables). The big screen is the source of truth.
- **The "AI they built"** = the kid-safe `/api/ai` proxy, with the identity + rules + facts
  assembled into the prompt (`buildPrompt` in `lab.js`). The proxy's built-in kid-safe system
  prompt stays as an outer guardrail.
- **Moderation** = `CTFFilter` on each submission (client) **+** the mentor approve-gate
  (nothing hits the screen unapproved).

## Verified
Realtime round-trip (kid → screen → approve → brain → "approved" back to kid), stage sync,
moderation, and the Run-it call all tested. The AI call returns a mock on `localhost` and the
real answer when **deployed** (the function needs Netlify).

## Known limits / production TODOs
- **Ephemeral** — broadcast has no persistence; if the big screen reloads, the brain resets,
  and late joiners don't see prior facts. Add a small Supabase table for durability.
- **Prompt cap** — `/api/ai` caps input at 2000 chars, so facts are truncated to ~1200. For
  bigger knowledge bases, add a dedicated `/api/buildlab` endpoint (higher token budget,
  structured input, proper system prompt) instead of stuffing the user turn.
- **Gating** — `buildlab/` is currently public; add it to the edge gate before classroom use.
- **"Grab from the internet"** data source (a vetted encyclopedia-summary fetch) isn't wired
  yet — v1 is type-a-fact. Clear next addition.
- **Identity stage** is host-driven (kids suggest names, host picks); democratic voting = v2.
