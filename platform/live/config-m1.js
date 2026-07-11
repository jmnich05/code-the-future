// ============================================================================
// Live Room — Module 1 session config ("What Is AI?" · first in-person session)
// Loaded by BOTH the host (projector) and kid (device) pages. ~20-30 minutes.
// type: 'lobby' | 'vote' (answer:null = opinion poll, otherwise scored) |
//       'dream' (pick your Module 4 Big Build) | 'end'
// ============================================================================
window.LIVE_SESSION = {
  id: 'm1',
  channel: 'live:m1',
  title: 'Module 1 · What Is AI?',
  stages: [
    { id:'lobby', type:'lobby', title:'Welcome, Future Builders! 🛠️',
      sub:'Grab your device, log in, and join the room. Your name pops up on the big screen when you\'re in!' },

    // ---- warm-up opinion vote (no right answer — discussion starter) -------
    { id:'poll1', type:'vote', title:'Warm-up vote', e:'🤔',
      q:'AI is most like…', answer:null,
      opts:[ {e:'🧠', t:'A robot brain that thinks like us'},
             {e:'📚', t:'A super-fast pattern learner'},
             {e:'🔮', t:'A magic answer machine'},
             {e:'🐶', t:'A puppy you train with examples'} ],
      why:'No wrong answers — but by the end of camp, most builders vote 📚 or 🐶. AI learns patterns from examples!' },

    // ---- AI or NOT? — 6 scored rounds ---------------------------------------
    // All-fresh items: the module's arcade game already quizzes YouTube recs,
    // calculator, face-finding, flashlight, autocorrect, maps, robot vacuum,
    // smart speaker, game enemies, toaster, microwave, bicycle. Don't repeat those.
    { id:'q1', type:'vote', title:'AI or NOT? · Round 1', e:'🐶',
      q:'A photo filter that gives you dog ears', answer:0,
      opts:[ {e:'🤖', t:'AI'}, {e:'🚫', t:'NOT AI'} ],
      why:'It learned where eyes, ears, and noses go from millions of faces — that\'s how the ears stick to YOU when you move.' },
    { id:'q2', type:'vote', title:'AI or NOT? · Round 2', e:'🚪',
      q:'Automatic doors at the grocery store', answer:1,
      opts:[ {e:'🤖', t:'AI'}, {e:'🚫', t:'NOT AI'} ],
      why:'One sensor, one rule: something moves close → open. It never learns, never guesses — same trick forever.' },
    { id:'q3', type:'vote', title:'AI or NOT? · Round 3', e:'🤖',
      q:'A robot that learns to walk by falling down a lot', answer:0,
      opts:[ {e:'🤖', t:'AI'}, {e:'🚫', t:'NOT AI'} ],
      why:'Every fall is an example! It tries, wobbles, falls, and adjusts — just like YOU learned to ride a bike.' },
    { id:'q4', type:'vote', title:'AI or NOT? · Round 4', e:'🥤',
      q:'A vending machine dropping your snack', answer:1,
      opts:[ {e:'🤖', t:'AI'}, {e:'🚫', t:'NOT AI'} ],
      why:'Press B4, get chips. Fixed steps, zero learning — it would hand a robber the same chips.' },
    { id:'q5', type:'vote', title:'AI or NOT? · Round 5', e:'🚗',
      q:'A car that drives itself', answer:0,
      opts:[ {e:'🤖', t:'AI'}, {e:'🚫', t:'NOT AI'} ],
      why:'It learned from millions of miles of driving what roads, people, and stop signs look like — and it\'s still learning.' },
    { id:'q6', type:'vote', title:'AI or NOT? · Round 6', e:'🎲',
      q:'Rolling dice in a board game app', answer:1,
      opts:[ {e:'🤖', t:'AI'}, {e:'🚫', t:'NOT AI'} ],
      why:'Random isn\'t smart! Picking a random number takes no learning at all.' },

    // ---- watch together (projected) — "Computer Science is Changing Everything"
    // (Code.org, 5:35). NOT used in any self-serve module — the modules use
    // "How AI Works" (Ok-xpKjKp2g), so never reuse that one here.
    { id:'vid1', type:'video', title:'Movie time: YOU build the future 🍿', yt:'QvyTEx1wyOY',
      sub:'Eyes on the big screen! Music, sports, medicine, games — technology is rebuilding ALL of it, and AI just hit the gas. Your generation gets to do the building. Catch your breath — Mythbusters is next.' },

    // ---- Mythbusters — 3 scored votes ---------------------------------------
    // All-fresh myths: the module already TEACHES "AI has no feelings" and
    // "AI makes mistakes" — don't re-quiz those here.
    { id:'my1', type:'vote', title:'Mythbusters · 1', e:'♟️',
      q:'“An AI has beaten the world champion at chess.”', answer:0,
      opts:[ {e:'✅', t:'True'}, {e:'❌', t:'False'}, {e:'🤏', t:'Sort of'} ],
      why:'TRUE — and it happened before your parents had smartphones! It studied millions of games. Pattern power beats even champions.' },
    { id:'my2', type:'vote', title:'Mythbusters · 2', e:'😴',
      q:'“AI gets smarter all by itself while you sleep.”', answer:1,
      opts:[ {e:'✅', t:'True'}, {e:'❌', t:'False'}, {e:'🤏', t:'Sort of'} ],
      why:'MYTH! AI only gets smarter when PEOPLE feed it new examples and train it. No builders — no learning. That\'s the job.' },
    { id:'my3', type:'vote', title:'Mythbusters · 3', e:'🧒',
      q:'“AI is only for grown-up engineers.”', answer:1,
      opts:[ {e:'✅', t:'True'}, {e:'❌', t:'False'}, {e:'🤏', t:'Sort of'} ],
      why:'The BIGGEST myth in this room! In about one minute, every single one of you picks the real app YOU are going to build with AI. Ready?' },

    // ---- THE FINALE: pick your Module 4 Big Build --------------------------
    { id:'dream', type:'dream', title:'Pick your Big Build! 🌉',
      sub:'This summer you\'ll build a REAL app or game — yours to own, show your family, and keep. Choose on your device and make it yours — your pick pops up on the big screen!' },

    { id:'end', type:'end', title:'Great work, Future Builders! 🏆',
      sub:'Your missions continue on the platform this week — see you at the next session!' }
  ]
};
