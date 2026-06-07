---
name: code-the-future-design
description: Use this skill to generate well-branded interfaces and assets for Code the Future, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and
create static HTML files for the user to view. If working on production code, you can copy
assets and read the rules here to become an expert in designing with this brand.

Quick map:
- `styles.css` — link this; it pulls in all tokens (`tokens/`) and webfonts.
- `assets/` — logo + icon SVGs (light, dark, mono, app tile).
- `guidelines/` — foundation + brand specimen cards.
- `applications/` — brand-in-use examples (app icon, merch, web header).
- `components/` — React primitives (Button, Badge, Card, Avatar, Input, Tabs).
- `ui_kits/website` and `ui_kits/platform` — full-screen reference builds.

Brand in one breath: optimistic, curious, forward-looking; bright + energetic with a
futuristic edge; electric blue + teal with coral/amber warmth on deep space-navy ink;
Space Grotesk display, Plus Jakarta Sans body, JetBrains Mono code; Lucide icons; pill
buttons; rounded friendly cards; "Learn to build what's next." Voice: lead with the concept,
operator-grade examples, "you," smart but never intimidating, no emoji.

If the user invokes this skill without any other guidance, ask them what they want to build
or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_
production code, depending on the need.

## Building the two production sites

This system ships **reference builds** of both products — copy their structure, don't
reinvent it:
- **Marketing site** → `ui_kits/website/` (`Nav`, `Hero`, `Sections`, `site.css`)
- **Learning platform** (signed-in) → `ui_kits/platform/` (`Sidebar`, `Dashboard`,
  `platform.css`)

To port into a real codebase (Next.js / Vite / etc.):
1. **Tokens first.** Copy `styles.css` + the whole `tokens/` folder in as global CSS, or
   translate the `--*` custom properties into your framework's theme. Everything keys off
   these — never hard-code a hex or font that already has a token.
2. **Fonts.** `tokens/fonts.css` loads Space Grotesk / Plus Jakarta Sans / JetBrains Mono
   from Google Fonts. Swap to `next/font` or self-hosted `@font-face` if you prefer; keep
   the same families and the fallback stacks in `tokens/typography.css`.
3. **Components.** The `.jsx` in `components/*` are plain React (no deps beyond React) and
   style via CSS variables — paste them in directly, or use their `.d.ts` + `.prompt.md` as
   the spec to rebuild in your component library. Props contracts are in the `.d.ts`.
4. **Icons.** Lucide (`lucide-react` in a real app). 2px stroke, `currentColor`.
5. **Logo.** Use the SVGs in `assets/` as-is; don't redraw the mark. `Future` is blue on
   light, teal on dark.
6. **Voice & rules.** `readme.md` has the full CONTENT FUNDAMENTALS, VISUAL FOUNDATIONS, and
   ICONOGRAPHY sections — treat them as law for copy and layout decisions.

The `_ds_*` files are build artifacts from the design-system tooling; ignore them in a
production port (they only power the reference HTML cards).
