# Module 1 — Capstone (the "create & use AI" project)

The end-of-module big project: a live OpenAI model embedded in the page so learners stop
*reading about* AI and start *using* it. Two flavors, one engine:

- **Kids — "The Big Mission"** (`kids-big-mission.html`): a safe, friendly playground with
  idea chips. Steady settings, kid-appropriate guardrails.
- **Adults — "Capstone"** (`adults-capstone.html`): a prompt sandbox with the **temperature**
  dial from Section 8, so they can feel predictable vs. adventurous output.

## The golden rule: the API key never goes in the browser

The page talks to a small **server-side proxy** (`/api/ai`). Your OpenAI key lives only on
the server (an env var). The browser never sees it, and it never goes in git. This matters
everywhere, and doubly for a kids' product.

```
Browser (page)  →  /api/ai proxy (holds the key)  →  OpenAI  →  back to the page
```

## How to give it your key

**You** place the key — I never need to see it. Two places:

### 1) Local testing
1. `cd "curriculum/module-01-what-is-ai/capstone"`
2. `cp .env.example .env`
3. Edit `.env` and paste your key: `OPENAI_API_KEY=sk-...`  *(`.env` is gitignored)*
4. `node server/dev-server.mjs`  *(needs Node 18+; no installs required)*
5. Open <http://localhost:8788/kids-big-mission.html> (or `adults-capstone.html`)

### 2) Production (Netlify — matches your stack)
1. Deploy this `capstone/` folder as a Netlify site (or fold `netlify.toml` + the function
   into the main site).
2. In **Netlify → Site configuration → Environment variables**, add `OPENAI_API_KEY`
   (and optionally `OPENAI_MODEL`).
3. Done — `netlify.toml` already routes `/api/ai` → the serverless function.

> Prefer Vercel/Cloudflare/Express instead of Netlify? The proxy is ~60 lines
> (`netlify/functions/ai.js`); port it to your platform's function format and keep the
> `/api/ai` path. The client doesn't change.

## Files

| File | Role |
|------|------|
| `kids-big-mission.html` / `adults-capstone.html` | Embeddable lesson pages |
| `index.html` | Simple chooser linking both |
| `ctf-ai.js` | Client — builds the sandbox, calls `/api/ai`, reveals text word-by-word |
| `ctf-ai.css` | Styling (reuses the widget/design tokens) |
| `netlify/functions/ai.js` | Serverless proxy (holds the key, calls OpenAI) |
| `server/dev-server.mjs` | Local dev: serves the pages **and** `/api/ai`, reads `.env` |
| `netlify.toml` | Publish + functions + `/api/ai` redirect |
| `.env.example` | Template — copy to `.env`, never commit the real key |

## Embedding in the HTML site

```html
<link rel="stylesheet" href="ctf-ai.css">
<div class="ctf"><div data-ctf-ai="kids" data-endpoint="/api/ai"></div></div>
<script src="ctf-ai.js"></script>
```

- `data-ctf-ai` = `kids` or `adults`.
- `data-endpoint` defaults to `/api/ai`; change it if your proxy lives elsewhere.

## Safety & cost notes

- **Guardrails:** the kids system prompt enforces safe, age-appropriate topics and refuses
  personal-info requests; responses are length-capped. For a public kids launch, add an
  OpenAI **moderation** pre-check and rate-limiting in the proxy (a natural next step).
- **Model/cost:** defaults to `gpt-4o-mini` (inexpensive). Token caps keep each call small.
- **Pedagogy:** the client reveals the answer word-by-word on purpose — it echoes "AI guesses
  one token at a time." For the real thing, the proxy can be upgraded to true streaming (SSE).
