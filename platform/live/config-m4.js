// ============================================================================
// Live Room — Module 4 session config ("Demo Day" · Saturday final session)
// Loaded by BOTH the host (projector) and kid (device) pages.
// type: 'lobby' | 'story' (full-screen real-news story) | 'vote' | 'board' | 'end'
// Run of show: two REAL news stories (the wow + the pause) → 10-question trivia
// with the live scoreboard in the corner → champion board (PRIZE) → then the
// DEMOS: each kid answers the three questions and plays their build full screen
// (host: /platform/m4/demoday.html).
// ============================================================================
window.LIVE_SESSION = {
  id: 'm4',
  channel: 'live:m4',
  title: 'Demo Day · The Grand Finale',
  stages: [
    { id:'lobby', type:'lobby', title:'DEMO DAY, Future Builders! 🏆',
      sub:'Four weeks. Four builders. Four real apps. Log in and join the room — two true stories, ten questions for the trophy, and then… YOU take the stage.' },

    // ========================= STORY 1 · THE WOW =========================
    // AI wildfire cameras in the western US: an AI camera in Arizona's
    // Coconino National Forest flagged smoke, human analysts verified, and
    // crews contained the fire at ~7 acres. ABC News wire + WBUR On Point
    // (Jul 10, 2026). Told as SLIDES — one visual, one line, Next-paced.
    { id:'s1a', type:'slide', e:'🔥', img:'/platform/assets/live-m4/fire1.jpg',
      kicker:'True story · this summer',
      title:'Fires start <b>small</b>.',
      sub:'By the time a person spots the smoke… it can already be too late.' },
    { id:'s1b', type:'slide', e:'🔥', img:'/platform/assets/live-m4/fire2.jpg',
      kicker:'The western United States · 2026',
      title:'So AI cameras started watching the forests.',
      sub:'Millions of trees. All day. All night. No person can do that — a computer can.' },
    { id:'s1c', type:'slide', e:'🔥', img:'/platform/assets/live-m4/fire3.jpg',
      kicker:'Arizona · real event',
      title:'The AI saw a smudge. Humans checked. <b>FIRE.</b>',
      sub:'Stopped at 7 acres — five soccer fields, instead of a whole forest.' },
    { id:'s1d', type:'slide', e:'🔥',
      kicker:'The pattern — say it with me',
      title:'AI <b>watched</b>. Humans <b>decided</b>. Firefighters <b>acted</b>.',
      sub:'The exact loop you learned all summer. Nobody replaced — everybody faster.',
      ask:'What ELSE should an AI keep watch over — and who makes the final call?' },

    // ========================= STORY 2 · THE PAUSE =========================
    // Real, this summer: lawyers in an Australian murder case filed AI-written
    // documents citing court cases that never existed (Yahoo/AP coverage), and
    // research (MIT, via Axios) found AI uses MORE confident language when
    // it's wrong. The camp lesson wearing a courtroom costume: humans verify.
    { id:'s2a', type:'slide', e:'⚖️', tone:'warn', img:'/platform/assets/live-m4/law1.jpg',
      kicker:'Also true · this summer',
      title:'A robot walked into a courtroom…',
      sub:'Real lawyers, in a REAL trial, let an AI write their court papers. They didn\'t check them.' },
    { id:'s2b', type:'slide', e:'⚖️', tone:'warn',
      kicker:'What was in those papers',
      title:'Court cases that <b>never existed</b>.',
      sub:'Made-up names. Made-up quotes. The AI invented all of it — and sounded completely sure.' },
    { id:'s2c', type:'slide', e:'🔍', tone:'warn', img:'/platform/assets/live-m4/law2.jpg',
      kicker:'Scientists measured it',
      title:'The wronger AI is… the <b>surer</b> it sounds.',
      sub:'Wrong answers come out MORE confident than right ones. Let that sink in.' },
    { id:'s2d', type:'slide', e:'🔍', tone:'warn',
      kicker:'The rule that saves you',
      title:'AI <b>predicts</b>. Humans <b>verify</b>.',
      sub:'The lawyers forgot to check. You four never will — you\'ve been checking all summer.',
      ask:'An AI tells you something and sounds 100% sure. What do you do BEFORE you trust it?' },

    // ===================== TRIVIA · 10 QUESTIONS =====================
    // Grand-finale review across all four modules + their build week.
    // NO project spoilers — the apps stay CLASSIFIED until the demos.
    { id:'q1', type:'vote', title:'Question 1 · Where it all started', e:'🔁',
      q:'What does a LOOP do in code?', answer:2,
      opts:[ {e:'🎢', t:'Makes the computer dizzy'}, {e:'🔐', t:'Locks the program'}, {e:'🔁', t:'Repeats steps over and over'}, {e:'🎨', t:'Draws circles'} ],
      why:'Loops repeat steps — that\'s how a game redraws the screen 60 times a second, and how every app you built today keeps running. Week 1 knowledge, still the foundation.' },

    { id:'q2', type:'vote', title:'Question 2 · The magic word', e:'📋',
      q:'A clear list of exact steps for a computer is called…', answer:1,
      opts:[ {e:'🥣', t:'A recipe-gorithm'}, {e:'📋', t:'An algorithm'}, {e:'🎼', t:'A rhythm'}, {e:'🤖', t:'A robo-list'} ],
      why:'An ALGORITHM — exact steps, followed exactly. Fun fact: "recipe" is honestly a great way to think about it, but the computer never improvises the way a chef does.' },

    { id:'q3', type:'vote', title:'Question 3 · When it breaks', e:'🐛',
      q:'You find and fix a mistake in your program. What did you just do?', answer:3,
      opts:[ {e:'🧹', t:'Cleaning'}, {e:'🚑', t:'Code surgery'}, {e:'🔨', t:'Smashing'}, {e:'🐛', t:'Debugging'} ],
      why:'DEBUGGING. Every builder in this room did it this week — found something broken, stayed calm, fixed ONE thing, tested again. That skill is the whole job.' },

    { id:'q4', type:'vote', title:'Question 4 · Talking to AI', e:'💬',
      q:'What you type to tell an AI what you want is called…', answer:0,
      opts:[ {e:'💬', t:'A prompt'}, {e:'📮', t:'A request form'}, {e:'🪄', t:'A spell'}, {e:'📢', t:'A command shout'} ],
      why:'A PROMPT. And you all learned the secret: clear thinking beats fast typing. The better you describe it, the better the AI builds it.' },

    { id:'q5', type:'vote', title:'Question 5 · The golden rule', e:'⚠️',
      q:'An AI does exactly what you ______, not what you ______.', answer:2,
      opts:[ {e:'🙏', t:'wish · deserve'}, {e:'💭', t:'imagine · type'}, {e:'⌨️', t:'ASK · MEANT'}, {e:'😴', t:'dream · forgot'} ],
      why:'What you ASK, not what you MEANT. Sloppy goal in, surprise out. It\'s why builders describe things carefully — and why guardrails exist.' },

    { id:'q6', type:'vote', title:'Question 6 · The builder\'s loop', e:'🔂',
      q:'This week you each made version after version — v1, v2, v3… What is that called?', answer:1,
      opts:[ {e:'🔁', t:'Looping-the-loop'}, {e:'🔂', t:'Iteration — how real teams build'}, {e:'♻️', t:'Recycling'}, {e:'📚', t:'Homework'} ],
      why:'ITERATION: build → play it → notice → improve → ship. Real software teams do exactly what you did — they just have worse snacks.' },

    { id:'q7', type:'vote', title:'Question 7 · The locked room', e:'🧱',
      q:'Why do builders test powerful AI inside a "sandbox"?', answer:3,
      opts:[ {e:'🏖️', t:'AIs love the beach'}, {e:'🧸', t:'It\'s comfier in there'}, {e:'💸', t:'It\'s cheaper'}, {e:'🧱', t:'So mistakes stay INSIDE while you watch what it does'} ],
      why:'A sandbox keeps surprises contained. Remember the AI that escaped its test room? That\'s WHY the walls exist — powerful helpers get watched first, trusted second.' },

    { id:'q8', type:'vote', title:'Question 8 · Who decides?', e:'🧑‍⚖️',
      q:'In the fire-spotter story: AI saw the smoke. Who decided it was real and sent the trucks?', answer:0,
      opts:[ {e:'🧑‍🚒', t:'Humans — experts made the call'}, {e:'🤖', t:'The AI decided alone'}, {e:'🎲', t:'A coin flip'}, {e:'🐿️', t:'A very alert squirrel'} ],
      why:'Humans made the call. That\'s the pattern for everything you built: AI helps inside the loop, people hold the judgment. Never forget which seat is yours.' },

    { id:'q9', type:'vote', title:'Question 9 · This very room', e:'🏗️',
      q:'Every app being demoed today was planned, prompted, tested, and shipped by…', answer:2,
      opts:[ {e:'🧑‍🏫', t:'Mr. Jon while you slept'}, {e:'🤖', t:'The AI all by itself'}, {e:'🧒', t:'THE BUILDERS IN THIS ROOM'}, {e:'👽', t:'Mysterious space engineers'} ],
      why:'YOU. The AI typed fast, but every idea, every choice, every "no, make it MORE like this" came from a kid in this room. That\'s what builder means.' },

    { id:'q10', type:'vote', title:'Question 10 · The last word', e:'🚀',
      q:'What does it mean to SHIP something?', answer:1,
      opts:[ {e:'📦', t:'Mail it in a box'}, {e:'🚀', t:'Release it to the world — done beats perfect'}, {e:'⛵', t:'Throw it in the ocean'}, {e:'🏪', t:'Sell it at a store'} ],
      why:'To ship = to release it for real. Perfect is not the goal — SHIPPED is. And in about ten minutes, all four of you officially become shipped software builders. 🚀' },

    // ===================== CHAMPION BOARD + HANDOFF =====================
    { id:'board', type:'board', title:'🏆 THE FINAL SCOREBOARD',
      sub:'Champion takes the prize! Then screens up — it\'s DEMO TIME.' },
    { id:'end', type:'end', title:'Now the real show begins. 🎬',
      sub:'Four apps. Four builders. Each one answers three questions, then plays it FULL SCREEN. Host: open /platform/m4/demoday.html' }
  ]
};
