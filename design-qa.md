# Design QA

## Visual target

- Source: the approved Ánimo homepage redesign at `http://127.0.0.1:4173/`.
- Implementation: the Code the Future redesign at `http://127.0.0.1:4174/`.
- Source capture: `/private/tmp/ctf-redesign/source-animo-hero.png`.
- Comparison surface: `/private/tmp/ctf-redesign/compare-home.html`.
- The source and implementation hero captures were reviewed together at the same desktop viewport and state. The implementation preserves the approved composition, border rhythm, offset shadows, announcement rail, split hero, and oversized type while using only Code the Future brand colors, typography, copy, and imagery.

## Responsive review

- Desktop: 1280 x 720.
- Mobile: 390 x 844.
- Checked the homepage, Programs, Why AI Now, Summer 2026, and Enrollment routes.
- Confirmed single-column mobile hero behavior, readable headings, working mobile navigation, visible close control, and no horizontal page overflow.

## Interaction review

- Hero expands on click and can be explored by pointer, touch, mouse wheel, and keyboard.
- Hero movement is bounded at every edge; the image remains visible without exposing a blank black area.
- Escape collapses the expanded hero and focus/navigation state is restored.
- Mobile navigation traps focus, updates its accessible label, and closes correctly.
- Legacy homepage fragments redirect to the matching new pages; `#signup` resolves to `/enroll.html#interest`.
- Breadcrumbs return to the homepage.
- Three checkout paths and the cohort-interest form remain present; no transaction or lead submission was sent during QA.

## Content and release review

- The founder screen-share walkthrough is absent from the homepage and launchpad.
- `platform/assets/film.mp4` and `platform/assets/film-poster.jpg` are explicitly excluded from the public build.
- No temporary founder or learner testimonial placeholders were added.
- Coral labels and CTA text use the dark ink token for accessible contrast.
- Browser console errors: none observed on tested routes.
- Automated JavaScript, SEO, build, sitemap, analytics, and whitespace checks passed.

## Summer 2026 gallery iteration

- Reference capture: `/private/tmp/ctf-redesign/summer-2026-before-gallery-focus.jpg`.
- Implementation captures: `/private/tmp/ctf-redesign/summer-2026-gallery-1265-current.png` and `/private/tmp/ctf-redesign/summer-2026-gallery-second-final-1265.png`.
- Combined comparison surface: `http://127.0.0.1:4175/compare-summer-gallery.html`.
- Compared the reference and implementation together at the same 1265 x 720 viewport. Full-page context was also reviewed before and after the change.
- Composition: the existing section title and anonymous-project framing stay intact; the four text-only cards become a balanced two-by-two visual gallery.
- Typography: category labels, product names, and descriptions retain the established mono/sans hierarchy and readable line lengths.
- Color and materials: the dark section, paper borders, rounded corners, and brand-color offset shadows remain consistent with the approved site system.
- Imagery: all four screenshots are real captures of the cohort builds, use consistent 16:10 crops, and contain no visible learner names.
- Spacing and alignment: card media and copy share consistent dimensions, internal padding, and row/column gaps on desktop and mobile.
- The first implementation used an invalid `box-shadow-color` declaration for alternating card accents. It was replaced with explicit valid shadows for all four cards and visually rechecked.
- Mobile was checked at 390 x 844: the gallery becomes one column, keeps every image and description readable, and introduces no horizontal overflow.
- Each image has explicit dimensions, descriptive non-attributing alt text, lazy loading, and async decoding. The static cards add no inaccessible interaction.
- Privacy checks found no student names, private demo links, or public routes into the gated showcase in the new gallery markup or images.

Final result: passed
