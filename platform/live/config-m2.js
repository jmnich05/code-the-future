// ============================================================================
// Live Room — Module 2 session config ("AI and Our World" · Saturday session 2)
// Loaded by BOTH the host (projector) and kid (device) pages.
// type: 'lobby' | 'vote' (answer:null = opinion poll, otherwise scored) |
//       'board' (live leaderboard checkpoint) | 'video' | 'end'
// Run of show: 10-question trivia (Q1–5 · halftime board · Q6–10 · champion
// board = PRIZE moment) → then later in the session: video + memory mixers.
// The Tycoon game is a separate tool: /platform/live/tycoon.html
// ============================================================================
window.LIVE_SESSION = {
  id: 'm2',
  channel: 'live:m2',
  title: 'Module 2 · AI and Our World',
  stages: [
    { id:'lobby', type:'lobby', title:'Welcome back, Future Builders! 🌍',
      sub:'Grab your device, log in, and join the room. This week: AI out in the REAL world — and 10 questions between you and the trophy.' },

    // ---- warm-up opinion vote (no right answer — discussion starter) -------
    { id:'poll1', type:'vote', title:'Warm-up vote', e:'🌍',
      q:'If you could point AI at ONE big world problem…', answer:null,
      opts:[ {e:'🩺', t:'Helping doctors cure sickness'},
             {e:'🌎', t:'Taking care of the planet'},
             {e:'🏫', t:'Making school way better'},
             {e:'🛟', t:'Keeping people safe'} ],
      why:'No wrong answers — real builders are pointing AI at ALL four right now. Today you\'ll see how… and then you\'ll start a company that does one of them.' },

    // ============== TRIVIA · FIRST HALF (AI out in the world) ==============
    { id:'q1', type:'vote', title:'Question 1 · Module 2 review', e:'💡',
      q:'AI today is like which invention from 100 years ago?', answer:0,
      opts:[ {e:'💡', t:'Electricity'}, {e:'📺', t:'The TV'}, {e:'☎️', t:'The telephone'}, {e:'✈️', t:'The airplane'} ],
      why:'Electricity started as ONE light bulb people stared at — then it quietly slipped behind everything: fridges, schools, hospitals. AI is doing the exact same thing right now, in YOUR lifetime.' },

    { id:'q2', type:'vote', title:'Question 2 · AI or NOT?', e:'🌾',
      q:'A farm drone that learns which plants need water', answer:0,
      opts:[ {e:'🤖', t:'AI'}, {e:'🚫', t:'NOT AI'} ],
      why:'It LEARNS from examples — thirsty plants look different from happy plants, and it gets better at spotting them. Remember the master question: does it learn? Yes → AI.' },

    { id:'q3', type:'vote', title:'Question 3 · Module 2 review', e:'🩺',
      q:'AI helping a doctor read an X-ray is like a…', answer:0,
      opts:[ {e:'🔍', t:'Metal detector that beeps "look here!"'}, {e:'👑', t:'Robot boss making the call'}, {e:'🎱', t:'Magic 8-ball'}, {e:'📸', t:'Fancy camera'} ],
      why:'A metal detector doesn\'t dig up the treasure — it just BEEPS so the human knows where to look. The AI beeps, the doctor looks, the DOCTOR decides. Helper, never boss.' },

    { id:'q4', type:'vote', title:'Question 4 · Module 2 review', e:'🌪️',
      q:'Why is AI so good at storm warnings?', answer:1,
      opts:[ {e:'👀', t:'It can see tomorrow'}, {e:'📚', t:'It studied a BILLION past storms'}, {e:'🍀', t:'It\'s lucky'}, {e:'📡', t:'It controls the weather'} ],
      why:'Same trick as always: patterns from tons of examples. Study a billion storms and you get really good at guessing what THIS one does next — and earlier warnings save lives.' },

    { id:'q5', type:'vote', title:'Question 5 · The camp rule', e:'🔁',
      q:'Finish the rule: “Code handles the ___”', answer:0,
      opts:[ {e:'🔁', t:'Loop'}, {e:'🧠', t:'Judgment'}, {e:'🚨', t:'Exceptions'}, {e:'🍕', t:'Pizza orders'} ],
      why:'Code does the LOOP — the boring, repeating part, ten thousand times without yawning. AI does the judgment inside the loop. And the exceptions…? Hold that thought through the scoreboard break. 😏' },

    // ============== HALFTIME ==============
    { id:'board1', type:'board', title:'Halftime scoreboard! 🍿',
      sub:'Five down, five to go — the trophy is still up for grabs. Shake it out, take a breath…' },

    // ============== TRIVIA · SECOND HALF (jobs, choices, power, YOU) ==============
    { id:'q6', type:'vote', title:'Question 6 · The camp rule', e:'🚨',
      q:'Who handles the EXCEPTIONS — the weird, tricky stuff?', answer:2,
      opts:[ {e:'🔁', t:'Code'}, {e:'🤖', t:'AI'}, {e:'🧑', t:'Humans'} ],
      why:'Humans! The strange, sad, brand-new stuff the AI has never seen needs real care and real judgment. That\'s the part of every job that stays deeply human.' },

    { id:'q7', type:'vote', title:'Question 7 · The hammer test', e:'🔨',
      q:'Is AI good or bad?', answer:2,
      opts:[ {e:'😇', t:'Always good'}, {e:'😈', t:'Always bad'}, {e:'🔨', t:'Neither — the CHOICES people make with it matter'} ],
      why:'A hammer can build a treehouse or smash a window — same hammer. AI is the same, just way more powerful, which means the choices matter way more.' },

    { id:'q8', type:'vote', title:'Question 8 · Privacy power', e:'👣',
      q:'The trail of info you leave online is called your digital ___', answer:0,
      opts:[ {e:'👣', t:'Footprint'}, {e:'🎒', t:'Backpack'}, {e:'🐾', t:'Pawprint'}, {e:'🌊', t:'Wake'} ],
      why:'Your digital FOOTPRINT — what you watch, search, and type leaves little trails. AI learns from data like that, so YOU should be the boss of what you leave behind.' },

    { id:'q9', type:'vote', title:'Question 9 · The recess test', e:'⚽',
      q:'One kid owns EVERY ball at recess. What\'s the real problem?', answer:1,
      opts:[ {e:'😠', t:'The kid must be mean'}, {e:'⚖️', t:'It\'s not fair — even if they\'re nice'}, {e:'💸', t:'Balls are expensive'} ],
      why:'Even a NICE kid owning everything isn\'t fair — everyone has to come asking. The biggest AI tools are like that today: held by just a few groups. Tools that shape the world should help everybody.' },

    { id:'q10', type:'vote', title:'Question 10 · For the trophy! 🏆', e:'🌟',
      q:'A great builder = curiosity + kindness + ___', answer:1,
      opts:[ {e:'💰', t:'Money'}, {e:'🧠', t:'Judgment'}, {e:'⚡', t:'Speed'}, {e:'🍀', t:'Luck'} ],
      why:'JUDGMENT — asking “should we? is it fair? who could this help or hurt?” AI brings the speed. YOU bring the wisdom. That\'s the whole secret of this camp.' },

    // ============== CHAMPION — award the prize here ==============
    { id:'board2', type:'board', title:'🏆 Trivia Champion!',
      sub:'Ten questions about how AI is changing the whole world — and look who was paying attention. Champion, come claim your prize!' },

    // ============== LATER IN THE SESSION: movie + memory mixers ==============
    // TED-Ed "How will AI change the world?" (5:55). NOT used in any self-serve
    // module — modules use "How AI Works" (Ok-xpKjKp2g) and session 1 used
    // Code.org's QvyTEx1wyOY, so never reuse those here.
    { id:'vid1', type:'video', title:'Movie time: AI and YOUR future 🍿', yt:'RzkD_rTEBYs',
      sub:'Eyes on the big screen! Where is AI headed as you grow up — and how do humans stay the boss of it? Watch for the coffee robot. We\'ll talk after.' },

    // ---- Memory mixer 1 · Help or Hurt? (Missions 6 & 9) ----
    { id:'d1', type:'vote', title:'Detective round · Help or Hurt? · 1', e:'📚',
      q:'An AI recommends books — but it\'s set up to show you ONLY one kind of book, forever.', answer:1,
      opts:[ {e:'🙌', t:'Helping'}, {e:'😬', t:'Could hurt'} ],
      why:'Sneaky one! Recommendations are great — but locked to ONE kind forever, it traps you in a bubble and you never discover anything new. Same tool, different setup, different answer. The CHOICES matter.' },

    { id:'d2', type:'vote', title:'Detective round · Help or Hurt? · 2', e:'⚡',
      q:'An AI watches a city\'s energy and saves every spare bit of sun and wind power.', answer:0,
      opts:[ {e:'🙌', t:'Helping'}, {e:'😬', t:'Could hurt'} ],
      why:'Helping! Huge-number problems — a whole city\'s power — are exactly where AI shines. Humans decided what matters (waste less, clean energy); the AI helps do it better.' },

    { id:'d3', type:'vote', title:'Detective round · Help or Hurt? · 3', e:'👁️',
      q:'A tool that watches everyone, everywhere, all the time.', answer:1,
      opts:[ {e:'🙌', t:'Helping'}, {e:'😬', t:'Could hurt'} ],
      why:'That\'s a flashlight shined in your face — bossing, not helping. It\'s the biggest reason WHO controls powerful tools matters, and why good rules and many voices keep them helpful.' },

    // ---- Memory mixer 2 · Share or Keep? (Mission 7) ----
    { id:'p1', type:'vote', title:'Privacy round · Share or Keep? · 1', e:'🌈',
      q:'Your favorite color', answer:0,
      opts:[ {e:'📌', t:'Share it'}, {e:'🔒', t:'Keep it private'}, {e:'🧑', t:'Ask a grown-up first'} ],
      why:'Bulletin-board stuff! Favorite color, favorite team, a drawing you\'re proud of — share away. Being the boss of your info doesn\'t mean hiding everything.' },

    { id:'p2', type:'vote', title:'Privacy round · Share or Keep? · 2', e:'🔑',
      q:'Your password', answer:1,
      opts:[ {e:'📌', t:'Share it'}, {e:'🔒', t:'Keep it private'}, {e:'🧑', t:'Ask a grown-up first'} ],
      why:'Diary stuff — ALWAYS. Passwords, home address, where you\'ll be Saturday. Those are yours. No app, no game, no “friend online” ever needs your password.' },

    { id:'p3', type:'vote', title:'Privacy round · Share or Keep? · 3', e:'📸',
      q:'A photo of your school project — with your full name and school on it', answer:2,
      opts:[ {e:'📌', t:'Share it'}, {e:'🔒', t:'Keep it private'}, {e:'🧑', t:'Ask a grown-up first'} ],
      why:'The project? Bulletin board. Your full name AND school together? That\'s heading into diary territory. When it\'s a mix — ask a grown-up you trust. That\'s not babyish, that\'s exactly what smart people do.' },

    { id:'end', type:'end', title:'You leveled UP, Future Builders! 🌍',
      sub:'You know what AI is AND what it means for the world. Notebooks next — then the Sandbox is open. Missions continue on the platform this week!' }
  ]
};
