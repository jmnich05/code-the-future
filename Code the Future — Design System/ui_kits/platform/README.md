# Platform UI kit — Code the Future learning dashboard

The signed-in learner view, built on the design system primitives.

**Layout:** dark `Sidebar` (brand, nav, streak card) + `Dashboard` main (greeting topbar
with avatar, three progress stat cards, the lesson "path" list with done/now/next states,
and a dark "Today's loop" sandbox card with a runnable code block).

**Files:** `index.html` (loads React, Babel, Lucide, the DS bundle, then the JSX),
`platform.css` (layout — not tokens), `Sidebar.jsx`, `Dashboard.jsx`, `App.jsx`. Reuses
`../website/icons.jsx` for the Lucide helper.

Composes `Button`, `Badge`, `Avatar`, `Card` from `window.CodeTheFutureDesignSystem_909f12`.
Tagged as a starting point ("Platform").
