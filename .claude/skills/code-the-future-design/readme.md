# Code the Future — Design System

Brand identity and design system for **Code the Future**: a platform + in-person summer
camp (2026) teaching kids and teens AI literacy and modern coding, with special focus on
how AI is reshaping software development.

> **Tagline:** *Learn to build what's next.*

This system was created from the product brief and the project's curriculum/context repo.
There were **no pre-existing visual assets** — the logo, palette, type, and components here
are an original brand kit built to the brief.

---

## Sources used

| Source | Where | What it gave us |
|---|---|---|
| Brand brief | Project prompt | Personality, audience, color/type direction, logo concepts, deliverables |
| `Code the Future/` codebase | Local mount (read-only) | Product context, teaching philosophy, voice, the mental models |
| `jmnich05/code-the-future` | GitHub (private) — https://github.com/jmnich05/code-the-future | Same content as the local mount: `README.md`, `CLAUDE.md`, `AGENTS.md`, `MEMORY.md`, `curriculum/` |

The repo is mostly curriculum prose and operator context — no design files. If you have
access, explore it (and the curriculum modules) to write copy and lessons that match the
real teaching voice. **The voice in this system is lifted directly from that material.**

---

## What this is

**Two products, one mission:**

1. **Platform** — a web app for learning AI + modern coding the way the work actually
   happens (real tools, real workflows, not toy CS). → `ui_kits/platform/`
2. **Summer camp (2026)** — hands-on, in-person, Louisville KY. → marketed via
   `ui_kits/website/`

Audience: **kids (8–11, primary; an adult parallel track comes later)** and **parents
(secondary — must feel safe and credible)**. Personality: optimistic, curious, forward-looking, hands-on,
smart-but-not-intimidating. Mood: bright and energetic with a futuristic edge — fun like a
camp, clearly about AI and the future, never a generic kids' brand.

---

## The logo

A **combination mark**: an icon + the "Code the Future" wordmark.

- **Icon concept — the Forward Branch.** A rising path that forks: one branch sprouts to a
  node (a path, a choice), the other shoots forward and resolves into an arrowhead (the
  future). It reads at once as a **code branch** (git), **growth/sprout**, and **forward
  motion / play**. It deliberately avoids the clichés the brief called out — no `</>`
  brackets, no robots. The icon stands alone as an app icon / avatar mark.
- **Wordmark** — "Code the Future" set in Space Grotesk Bold, tight tracking, with
  *Future* in brand blue (or teal on dark).

Assets in `assets/`:

| File | Use |
|---|---|
| `logo-icon.svg` | Icon, full color, for light backgrounds |
| `logo-icon-dark.svg` | Icon, brightened nodes, for dark backgrounds |
| `logo-icon-mono.svg` | One-color icon (`currentColor`) — stamps, embroidery, single-color print |
| `logo-icon-tile.svg` | App icon — mark on a rounded space-navy tile with glow |

The **lockups** (icon + wordmark) live as live HTML in `guidelines/logo-*.card.html` because
the wordmark uses the Space Grotesk webfont. Recreate them with the icon SVG + the wordmark
type spec rather than rasterizing.

**Clear space:** keep at least the height of the icon's lowest node clear on all sides.
**Don't:** recolor the icon outside the palette, stretch it, add effects, or set the
wordmark in another typeface.

---

## CONTENT FUNDAMENTALS

How Code the Future writes. The voice comes straight from the curriculum and operator
material in the source repo.

- **Lead with the concept, then the example.** Plain-English first, the worked example
  second. Never bury the point.
- **Operator-grade, not generic CS tutoring.** Talk about real loops — orders, files,
  inbox, inventory, transcripts, tickets — not `foo`/`bar`. Kids build things that *do*
  something.
- **Voice: "you," warm and direct.** Address the learner ("You're on Module 03"). For
  parents, the same plainness reads as credibility. Confident, never condescending, never
  hype-y. We don't talk down to kids.
- **Smart but not intimidating.** Short sentences. Concrete verbs. A little wit is welcome;
  jargon is not (and when a real term shows up — *agent loop, confidence threshold* — we
  define it in one line).
- **Casing:** Title case for the wordmark and nav; sentence case for headlines and body
  ("Learn to build what's next."). Mono, UPPERCASE, wide-tracked for eyebrows/labels only.
- **The signature mental models** (use verbatim — they are brand assets):
  > Code handles the loop. AI handles the judgment inside the loop. Rules handle the
  > guardrails. Humans handle exceptions.

  > The model is becoming less like one brain in a box and more like a reasoning engine
  > inside a workflow system.
- **Punchy, builder-flavored copy.** Examples in use: "Reserve a spot," "Ship something
  real," "Two weeks. One real build.", "Run in sandbox," "keep the loop running."
- **Emoji:** **no.** We use Lucide icons (and the flame/streak motif via icon, not emoji)
  so the brand stays crisp across kids' delight moments and parent-facing pages alike.

---

## VISUAL FOUNDATIONS

**Color.** Electric blue is the optimistic, forward anchor (`--blue-600 #2A5FF0` is the
interactive workhorse; `--blue-500 #3D74FF` is the brighter "spark"). Teal/cyan
(`--teal-500`/`--teal-400`) is the futuristic edge and the icon's node accent. Warm accents
— coral (`--coral-500 #FF5A38`) for camp energy and delight CTAs, amber for sun/optimism —
keep it from feeling cold and corporate. Deep **space-navy** (`--space-800 #0A1226`) is the
ink and the dark-surface family; off-white (`--ink-50 #F6F8FC`) is the page. Imagery and
gradients skew **cool and bright** with warm sparks — energetic, never neon-garish.

**Type.** Display/wordmark/headlines: **Space Grotesk** (geometric, friendly, a little
futuristic), bold, tracking −0.02em. Body/UI: **Plus Jakarta Sans** (clean humanist sans,
readable for kids and parents). Code/labels/eyebrows: **JetBrains Mono** — the "operator"
voice. Scale is a 1.250 major third; hero type goes large and tight.

**Spacing & layout.** 8px base grid, generous and breathable (camp-friendly, not cramped).
Centered max-width containers (1120px marketing, full-bleed app shell). Touch targets never
below 44px — this is a kids' product.

**Backgrounds.** Mostly clean off-white with lots of air. Futuristic moments use the
**Night gradient** (space-navy) for dark panels — the hero code card, the mental-model
strip, the platform sidebar. The **Spark** (blue→teal) and **Sunrise** (coral→amber)
gradients appear sparingly on hero washes, the camp CTA band, badge stickers, and the icon
glow. No busy patterns or textures; energy comes from color and the mark, not noise.

**Corner radii.** Rounded and friendly — `--radius-md 14px` for cards/inputs, `--radius-lg
20px` for feature cards, `--radius-xl/2xl` for hero panels and bands, and **pills**
(`--radius-pill`) for buttons, badges, tabs, and the nav bar. Nothing sharp.

**Shadows & elevation.** Soft, cool, layered shadows (light from above) — `--shadow-sm`
through `--shadow-xl`. On dark/hero, brand **glows** (`--glow-blue`, `--glow-coral`) add
energy. Cards = white surface, 1px `--border-subtle`, `--shadow-sm`; elevated cards deepen
to `--shadow-lg`.

**Borders.** Hairline `1px --border-subtle` on light cards; `2px` accent borders on
secondary buttons, outline cards, and the round sticker. On dark, `--border-on-dark`
(white at 12%).

**Glass & blur.** The marketing nav uses `--blur-md` glass over the page. Reserve blur for
floating chrome over content; don't blur everything.

**Motion.** Snappy and optimistic. `--ease-out` for most transitions (120–200ms);
`--ease-spring` (slight overshoot) for delight moments. **Hover:** cards lift
(`translateY(-3px)`) and deepen their shadow; links shift to brand blue. **Press:** buttons
scale to `0.97` (a tactile squish). Fades over flashy slides. No infinite decorative loops.

**Iconography vibe in imagery:** cool/bright, high-energy, optimistic. If you add photos,
favor real kids building real things, well-lit, warm-but-bright. No stocky "diverse team
points at laptop" clichés.

---

## ICONOGRAPHY

- **Icon set: [Lucide](https://lucide.dev)** — clean, geometric, rounded 2px stroke. It
  matches the friendly-but-modern personality and pairs naturally with Space Grotesk. This
  was a **deliberate selection** (the brand had no icon set); it's loaded from CDN in the
  UI kits via `lucide@0.460.0` UMD and hydrated with `lucide.createIcons()`.
- **Usage:** 2px stroke weight, `currentColor` so icons inherit text/brand color. Common
  glyphs in use: `arrow-right`, `sparkles`, `play`, `git-branch`, `braces`, `rocket`,
  `book-open`, `terminal`, `flame`, `check`, `lock`, `layout-dashboard`.
- **The brand mark is not an icon** — don't substitute Lucide for the logo. The Forward
  Branch SVGs in `assets/` are the only marks.
- **Emoji / unicode:** not used as iconography. The streak "flame" and similar gamification
  cues use the Lucide `flame` glyph, not 🔥, to keep rendering crisp and on-brand.
- **To recolor the mono icon:** set `color:` on its container — `logo-icon-mono.svg` draws
  with `currentColor`.

---

## VISUAL SUBSTITUTIONS — please review

- **Fonts are loaded from Google Fonts CDN** (`tokens/fonts.css` `@import`), not self-hosted
  binaries, because no font files were supplied. Space Grotesk / Plus Jakarta Sans /
  JetBrains Mono are all free Google Fonts. **If you'd like them self-hosted** (for offline
  use or to ship binaries to consumers), send the `.woff2` files and I'll swap the `@import`
  for `@font-face` rules. The compiler currently reports "Fonts: none" for this reason —
  expected with the CDN approach.
- **Icon set (Lucide) is a selection, not a recreation** — there was no existing set to
  match. Swap it if you have a preferred library.

---

## INDEX / manifest

**Root**
- `styles.css` — global entry point (import this). `@import`s every token + font file.
- `readme.md` — this guide.
- `SKILL.md` — Agent Skills wrapper for use in Claude Code.

**`tokens/`** — `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `effects.css`
(radii, shadows, glows, blur, motion).

**`assets/`** — `logo-icon.svg`, `logo-icon-dark.svg`, `logo-icon-mono.svg`,
`logo-icon-tile.svg`.

**`guidelines/`** — foundation + brand specimen cards (Design System tab): logo lockup,
icon variants, dark/stacked lockup; color scales (primary, secondary, accent, neutrals,
semantic, gradients); type (display, body, mono, scale); spacing, radii, shadows.

**`applications/`** — brand-in-use cards: app icon, stickers & tee, website header.

**`components/`** — reusable React primitives (compiled into `window.CodeTheFutureDesignSystem_909f12`):
- `core/` — **Button**, **Badge**, **Card**, **Avatar**
- `forms/` — **Input**
- `navigation/` — **Tabs**

**`ui_kits/`** — full-screen recreations composing the components:
- `website/` — marketing home (hero, pillars, mental-model strip, camp band, footer)
- `platform/` — learning dashboard (sidebar, progress stats, lesson path, sandbox)

> Each component has a sibling `.d.ts` (props), `.prompt.md` (what/when + example), and a
> directory `@dsCard` HTML. `Button`, `Card`, and the two UI kits are tagged as
> **starting points** for consuming projects.
