# Module 2 — AI and Our World

**Status: curriculum sketch (Pass 0).** This is the design blueprint, not finished copy.
Full mission prose, interactive widgets, and the capstone get built in later passes, the
same way Module 1 did. See [`curriculum-sketch.md`](curriculum-sketch.md) for the
mission-by-mission detail.

The second week of Code the Future. Module 1 answered *what AI is* — that machines follow
rules and AI learns from examples. Module 2 zooms out to **what AI does in the world, and
the big choices that come with a powerful tool**: how it's already helping people (curing
diseases, clean energy, science), how it's changing work and society, and the
responsibilities that come with it — privacy, fairness, who holds the power, and who gets
to decide where AI goes next. It lands where Module 1 did: *you get to help build it.*

> **The throughline, kid-sized:** A tool isn't good or bad by itself — a hammer can build a
> house or break a window. AI is the most powerful tool humans have ever made, so the
> question isn't just *"what can it do?"* but *"what should we choose to do with it — and
> who gets to choose?"* And the answer includes **you**.

## Same scale as Module 1

- **12 missions + a Big Mission capstone**, ~10 minutes each → a ~2-hour module.
- **Three-wave drip pacing** (same engine as Module 1): Missions unlock across the week so
  kids come back, not binge.
- **A code.org video in most missions** — short, age-appropriate, embedded inline (same
  `youtube-nocookie` video beat the Module 1 player already supports). Exact video IDs get
  the same research-and-verify pass Module 1's did before launch — they're listed as
  topics in the sketch, not yet locked.
- **More hands-on interaction than Module 1.** Module 1 leaned on recall widgets (sort,
  quiz, arcade). Module 2's themes are about *choices*, so it adds **decision / scenario**
  interactives where kids weigh a situation and see the trade-off — plus the familiar
  poll/sort/arcade where they fit.

## Tracks

- **Type A — Kids (ages 8–11):** the focus of this sketch. Wonder + agency, short
  sentences, vivid analogies, hard topics made concrete and safe. Carries the bigger
  societal and ethics ideas without fear — every "careful" mission ends on what kids *can
  do*, not what they should be scared of.
- **Type B — Adults (new to AI):** parallel spine, drafted after the kids track is locked
  (mirrors Module 1's two-track structure). Real discussion of the economy, policy, power,
  and governance for grown-ups.

## The 12-unit spine

The arc deliberately goes **wonder → responsibility → agency**: open with the exciting,
real ways AI helps the world, pivot to the choices and risks, and land on the kids' own
power to shape it. The hopeful missions come first on purpose — kids meet the ethics
questions already believing the tool is worth getting right.

| # | Mission (kids) | Theme | Big idea |
|---|----------------|-------|----------|
| 1 | Welcome Back, Future Builder | recap → preview | You know what AI *is*. Now: what it *does*, and the choices that come with it. |
| 2 | AI Is Already Out There | society | AI is woven into the world right now — way past toasters and chatbots. |
| 3 | AI the Doctor's Helper | health / disease | AI helps doctors spot sickness and invent medicine faster. |
| 4 | AI and the Planet | energy / science | AI helps with clean energy, weather, and giant science problems. |
| 5 | AI at Work | economy / jobs | *Code does the loop, AI does the judgment, humans handle the exceptions.* |
| 6 | Every Tool Can Help or Hurt | ethics pivot | A tool isn't good or bad — the *choices* are. |
| 7 | Your Stuff Is Yours | privacy | Your information is like your belongings: you get a say in who sees it. |
| 8 | Who Holds the Biggest Tools? | concentration of power | What if one kid owned every ball at recess? Who controls AI matters. |
| 9 | Tools, Rules, and Freedom | power & control | Powerful tools can help people *or* boss them around — that's why control matters. |
| 10 | Who Decides the Future of AI? | governance / voice | Not one company or one ruler — people decide together, including you. |
| 11 | You Get to Help Build It | agency | A good builder = curiosity + judgment + kindness. |
| 12 | You Did It! | recap + celebrate | Look how big you can now think about AI. |

**Big Mission (capstone):** *Build an AI Helper for the World* — kids use real AI to design,
name, and prompt a helper that solves a problem they care about, watch it work, then run it
through a kid-sized **ethics checkpoint** (Is it fair? Does it respect privacy? Who could it
hurt?). The make and the responsibility, in one project.

## Age-appropriateness & the hard topics (Kenya review)

Module 2 deliberately handles heavier material than Module 1 — power, surveillance,
authoritarian misuse, fairness. The design rules, for Kenya's review:

- **Concrete before abstract.** "Concentration of power" arrives as *one kid owning all the
  recess balls*, not as a lecture. Every big idea has a playground-sized analogy first.
- **Hope brackets the hard parts.** The exciting missions (3–5) come before the careful ones
  (6–10), and the module ends on agency (11–12). No mission ends on fear.
- **Name feelings, give actions.** Where a topic could worry a kid (a powerful AI in the
  wrong hands), the mission names that it's *okay to wonder about that* and points to what
  people — and kids — get to do about it.
- **Missions flagged `[KENYA REVIEW]`** in the sketch are the ones that carry the most
  weight (esp. 8, 9, 10) and need her eyes on framing and word choice before they're built.

## Build path (mirrors Module 1)

This folder will grow to match `module-01-what-is-ai/`:

```
module-02-ai-and-society/
  README.md              # this file
  curriculum-sketch.md   # the mission-by-mission blueprint  ← we are here
  type-a-kids.md         # Pass 1: full kids copy
  type-b-adults.md       # Pass 1: full adults copy
  lessons/content/kids.json  + adults.json   # Pass 1: structured beats for the player
  interactive/           # Pass 2: new decision/scenario widgets + reused ones
  assets/art/            # Pass 2: 12 mission scenes + badge art
  capstone/              # Pass 3: "Build an AI Helper for the World" (live OpenAI)
```

1. **Pass 0 — Sketch (this):** spine, themes, per-mission beats, video topics, interactives,
   capstone concept, Kenya review flags.
2. **Pass 1 — Copy:** full read-aloud lesson words for both tracks, in the `kids.json`
   beat schema the Module 1 player already renders.
3. **Pass 2 — Interactive + art + video:** build the decision/scenario widgets, generate the
   12 mission scenes and badges, lock + verify the code.org embeds.
4. **Pass 3 — Capstone:** the live "Build an AI Helper for the World" page.
