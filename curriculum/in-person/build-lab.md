# The Build Lab — the screens-up half of the Library Session

The Library Session breathes in two halves. The **front half is screens-down** (the
game-show review and warm-ups — devices in bags, bodies moving). Then a bathroom break.
Then the **back half is screens-up: the Build Lab** — devices out, Jon's laptop on the
library's big screen, and the whole room **builds a real AI together, live**, over three
weeks.

> **The promise:** by the end of the three-session arc, the kids will talk to an AI that
> *they* built — and they'll have done it the way real AI engineers actually do it.

## The sequenced 90 minutes (Build Lab weeks)

| Min | Half | What happens |
|---|---|---|
| 0–20 | **Screens-down** | Power-Up + **Mission Recap Showdown** (the game-show review of last week's platform missions) — devices stay in bags. |
| 20–25 | **Break** | Bathroom / water / wiggle. Devices come out as they return. |
| 25–70 | **Screens-up · Build Lab** | The 45-minute build. Kids on their devices feed one shared AI on the big screen. |
| 70–75 | **Land it** | Stand up, devices away, one-sentence "what we built today," next-week cliffhanger. |

(On non-build weeks, the session uses the fully screens-down 7-segment shape in the
[README](README.md). The Build Lab is the arc for the first three sessions.)

## The honest frame (say this to the kids — it's true *and* it's the magic)

Real AI engineers **do not** build a giant AI from scratch — that costs millions and takes
a company months. The giant company already did the hard part: it built a "base brain" that
read a huge chunk of the internet. That step is called **pre-training**, and it's already
done.

What engineers *actually do* — the real job, the thing this camp is about — is take that
base brain and **teach it to become something specific and useful.** They do it in three
moves, and that's exactly what the Build Lab does:

| Real engineer move | Kid words | The Build Lab stage |
|---|---|---|
| Give it a job + personality (the *system prompt*) | "Decide who it is" | **Session 1 · Step 1** |
| Feed it the right information (a *knowledge base*) | "Feed its brain" | **Session 1 · Step 2** + Session 2 |
| Show it examples + corrections (*shaping its answers*) | "Teach it the rules" | **Session 1 · Step 3** + Session 2 |
| Run it (*inference*) | "Ask it" | **First Contact** (S1) → polished in **Session 3** |

So we never tell kids a fib. We say: *"The big company taught it to read. **You** get to
teach it what to be."* That is the whole operator thesis of Code the Future, lived in 45
minutes — **code runs the loop, the AI makes the guess, and the humans (you) build the
workflow and the judgment around it.**

## How the Build Lab works (the platform)

A small web app — most of it already exists in this repo. **Two views:**

- **Kid view** (phone/tablet): join with the cohort code (same join flow the platform
  already uses), then a dead-simple, stage-by-stage submission screen — vote, add a fact,
  add a rule. One big input, one big button. No accounts, no personal data.
- **Big-screen view** (Jon's laptop, shared to the room): the live **Build Lab dashboard** —
  the AI's Identity Card, a **brain that visibly fills** with every fact, a stack of example
  cards, a "smartness" meter, and a **"Run it"** button that calls the real AI.

**Under the hood, the "AI they built" is:** the base model (via the existing
`netlify/functions/ai.js` OpenAI proxy) + a **system prompt** (the identity + rules they
chose) + a **knowledge base** (the facts they fed, injected as context) + a few **example
Q&As** (their corrections). That's a real, professional way to build an AI product on top
of a base model — RAG plus prompting — and it runs instantly and reliably in a classroom.

**What we reuse (most of it):**
- **Real-time multiplayer** → `platform/lib/ctf-db.js` already does Supabase presence +
  live updates. "Everyone's entries appear on the big screen instantly" is the same wiring.
- **The AI call** → `netlify/functions/ai.js` already proxies OpenAI with the key safe on
  the server.
- **Safety filter** → `platform/lib/filter.js` (the language filter the chat already uses).
- **Brand, join codes, avatars** → all reusable.

**What we'd build new:** the stage flow (3 submission stages), the big-screen dashboard
(brain-fills-up visuals + Run button), and the prompt-assembly that turns their entries
into the live AI call. A focused prototype, not a from-scratch project.

## Safety & moderation (kid devices + a projected screen)

Free text from kids, on a wall, in a library — so the screen is **never** unfiltered:
- Every submission passes `filter.js` **before** it can reach the big screen.
- A **mentor "approve to the brain" gate**: entries land in a holding lane on Jon's laptop;
  he taps to send them to the screen. Default-deny anything off.
- **Data comes in three safe ways** (no open-web browsing on kids' devices):
  1. **Type a fact** they know.
  2. **Pull a vetted summary** — the app fetches a kid-safe encyclopedia summary (e.g., a
     Wikipedia REST summary) for the *topic the class chose*; this is the real "grab it
     from the internet" moment, but controlled and mentor-approved.
  3. **Starter pack** — a mentor-curated set of facts to seed the brain if the room needs a
     push.
- **No personal data**, ever — the AI is about a *topic*, not about the kids. [KENYA:
  review the moderation flow + the "what topics are off-limits" list.]

---

## Session 1 · "Feed the Brain" — the 45-minute run of show

Kids walk in (post-break) to the big screen showing an **empty brain** pulsing gently and
the words *"Today we build a real AI. Step one: wake it up."*

### 25:00–29:00 · The Reveal ⚡ *(4 min)*
Mentor, big energy: *"Today, the five of us are going to build a real, working AI — live,
on this screen. Not a pretend one. A real one you can talk to. Here's the secret the
biggest companies don't tell you…"* — deliver **the honest frame** above: the base brain
already read the internet; *our* job is to teach it what to be. *"By the time your grown-ups
pick you up, this thing will be alive — and you made it."*

### 29:00–33:00 · Boot Up 🔌 *(4 min)*
Devices out. Kids join with the cohort code. As each joins, their **name pops onto the big
screen** (reusing presence) and the brain gives a little spark. *"That's you — you're
plugged into the lab."* Quick check that everyone's connected; pair up any device hiccups.

### 33:00–41:00 · Step 1 — Who Is It? 🪪 *(8 min)*
The class **decides together who their AI is.** On their devices, kids submit/vote on three
things; the big screen tallies live and assembles an **Identity Card**:
1. **A name** (everyone submits one, the room votes — instant ownership).
2. **What it's an expert in** (pick a topic the room loves: animals, space, Louisville,
   video games, dinosaurs).
3. **Its personality** (tap knobs: Funny ↔ Serious, Calm ↔ Excited, etc.).

Mentor: *"This is the AI's job description — engineers call it the system prompt. You just
wrote one."* The Identity Card locks in on screen. (This becomes the system prompt.)

### 41:00–59:00 · Step 2 — Feed the Brain 🧠 *(18 min — the core)*
The brain on screen is nearly empty and a little dumb. The goal appears: **"Fill the brain
to 50 facts!"** with a meter. Kids race to feed it, three ways (above): type a fact, pull a
vetted web summary about the chosen topic, or grab from the starter pack. Each approved fact
flies into the brain as a card **with the kid's name on it**, and the meter climbs.

- Mentor runs the **approve gate** — taps good facts onto the screen, gently bounces the
  silly ones (*"great try, but is that a real fact about dolphins?"* → a teaching moment
  about **good data vs. bad data**, a callback to Module 1).
- Hype the milestones: *"10 facts! 25! The brain's lighting up!"*
- Land the lesson mid-flow: *"This is the AI's knowledge — engineers call gathering it
  building the knowledge base. The better your facts, the smarter it gets. Garbage in…"*
  (kids finish it: *"…garbage out!"*).

### 59:00–65:00 · Step 3 — House Rules 📜 *(6 min)*
Now the kids **teach it how to act.** On devices, each adds one **rule** or one **example
answer** — e.g. *"Always be kind,"* *"If you don't know, say so — don't make it up,"* or
*"When someone asks your favorite animal, say a dolphin."* Cards stack on screen under
**"How I behave."** Mentor: *"You're correcting it before it even speaks — that's called
shaping, and it's exactly how engineers make an AI behave."*

### 65:00–69:00 · First Contact 🎤 *(4 min — the payoff)*
The big screen assembles everything — **Identity + Brain + Rules** — into one live prompt.
Mentor: *"Okay. It's never spoken before. Let's wake it up."* The room picks **one
question.** Mentor hits **"Run it"** → a real call to the AI → it answers **in its
personality, using their facts.** It'll be charming and a little rough — maybe it nails a
fed fact and totally whiffs on something it wasn't taught. **That's the point:** big laugh,
real awe (*"it's ALIVE"*), and an obvious gap (*"…it doesn't know that yet!"*).

### 69:00–70:00 · Cliffhanger 🎬 *(1 min)*
Mentor, trailer voice: *"You just built the first version of an AI. It's a baby genius —
it knows a little, and it's polite. **Next week, we make it SMART.** You'll feed it more,
correct its mistakes, and watch its brain level up. Same time, same lab."* Devices away,
stand up, pickup.

### Session 1 success looks like
Every kid: joined on a device, named/voted the AI, got **at least one fact (with their
name) onto the big screen**, added a rule, and heard their AI speak for the first time. The
room understands, in their own words: **an AI is a base brain + the knowledge and rules we
give it.** Zero unmoderated content hit the screen.

---

## Where the arc goes (Sessions 2–3)

Session 1 builds the skeleton and gets a first laugh. The next two make it real:

- **Session 2 · "Make It Smart" + Build Your Society.** Go deeper: kids feed and **correct**
  the AI (watch the smartness meter climb as examples accumulate), and — per the bigger
  theme — turn it toward **society**. The class uses their AI to think through *how they'd
  build their world with AI*: what should it help with, what rules should it follow, who
  should it be fair to. This is the Module 2 ethics arc (privacy, fairness, who decides),
  lived through the thing they built. Optional magic: kick off a real overnight fine-tune as
  the *"sending it to the AI gym"* moment.
- **Session 3 · "Ask It Anything."** The polished AI, now genuinely smart about its topic
  and well-behaved, takes live questions from the whole room — the graduation payoff:
  *"you built this."* Then the on-ramp to each kid building their **own** mini-app from a
  4–5 template menu (Trivia Bot · Story Buddy · Homework Explainer · Pet Translator ·
  Compliment Machine).

## Open questions / mentor notes
- **Topic of the class AI** — kid-chosen for ownership; mentor keeps a short off-limits list.
  [KENYA: review the topic guardrails + moderation flow.]
- **Group size** — designed for the 5-kid founding cohort; scales fine (more devices = a
  faster-filling brain). With a bigger room, add a second approve-helper.
- **The "pull from the internet" source** — recommend a vetted encyclopedia summary API for
  v1 (controlled, real, safe) rather than open web on kids' devices.
- **Prototype next** — a focused build using the realtime + `ai.js` parts already in the
  repo; this doc is the spec.
