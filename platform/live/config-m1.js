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
    { id:'lobby', type:'lobby', title:'Welcome, AI Apprentices! 🛠️',
      sub:'Grab your device, log in, and join the room. Your name pops up on the big screen when you\'re in!' },

    // ---- warm-up opinion vote (no right answer — discussion starter) -------
    { id:'poll1', type:'vote', title:'Warm-up vote', e:'🤔',
      q:'AI is most like…', answer:null,
      opts:[ {e:'🧠', t:'A robot brain that thinks like us'},
             {e:'📚', t:'A super-fast pattern learner'},
             {e:'🔮', t:'A magic answer machine'},
             {e:'🐶', t:'A puppy you train with examples'} ],
      why:'No wrong answers — but by the end of camp, most builders vote 📚 or 🐶. AI learns patterns from examples!' },

    // ---- AI or NOT? — 6 scored rounds (recaps Mission 1-2) -----------------
    { id:'q1', type:'vote', title:'AI or NOT? · Round 1', e:'📺',
      q:'YouTube picking your next video', answer:0,
      opts:[ {e:'🤖', t:'AI'}, {e:'🚫', t:'NOT AI'} ],
      why:'It learned what you like from millions of examples of what people watch.' },
    { id:'q2', type:'vote', title:'AI or NOT? · Round 2', e:'🧮',
      q:'A calculator doing 25 × 4', answer:1,
      opts:[ {e:'🤖', t:'AI'}, {e:'🚫', t:'NOT AI'} ],
      why:'A calculator follows fixed rules — it never learns or changes. Same input, same answer, forever.' },
    { id:'q3', type:'vote', title:'AI or NOT? · Round 3', e:'📱',
      q:'Your face unlocking a phone', answer:0,
      opts:[ {e:'🤖', t:'AI'}, {e:'🚫', t:'NOT AI'} ],
      why:'It was trained on examples of faces — and learned to recognize YOURS from different angles.' },
    { id:'q4', type:'vote', title:'AI or NOT? · Round 4', e:'🔦',
      q:'The flashlight app', answer:1,
      opts:[ {e:'🤖', t:'AI'}, {e:'🚫', t:'NOT AI'} ],
      why:'One button, one light. No learning, no patterns — just a switch.' },
    { id:'q5', type:'vote', title:'AI or NOT? · Round 5', e:'📧',
      q:'Email putting junk mail in Spam', answer:0,
      opts:[ {e:'🤖', t:'AI'}, {e:'🚫', t:'NOT AI'} ],
      why:'It learned from millions of examples of junk mail what "spammy" looks like.' },
    { id:'q6', type:'vote', title:'AI or NOT? · Round 6', e:'🎲',
      q:'Rolling dice in a board game app', answer:1,
      opts:[ {e:'🤖', t:'AI'}, {e:'🚫', t:'NOT AI'} ],
      why:'Random isn\'t smart! Picking a random number takes no learning at all.' },

    // ---- Mythbusters — 3 scored votes (recaps the fact-checker mission) ----
    { id:'my1', type:'vote', title:'Mythbusters · 1', e:'🧠',
      q:'“AI knows everything.”', answer:1,
      opts:[ {e:'✅', t:'True'}, {e:'❌', t:'False'}, {e:'🤏', t:'Sort of'} ],
      why:'MYTH! It only knows patterns from its training examples — and it can be flat-out wrong. That\'s why YOU fact-check it.' },
    { id:'my2', type:'vote', title:'Mythbusters · 2', e:'🙊',
      q:'“AI can make mistakes.”', answer:0,
      opts:[ {e:'✅', t:'True'}, {e:'❌', t:'False'}, {e:'🤏', t:'Sort of'} ],
      why:'TRUE! It guesses from patterns, so sometimes it guesses wrong — remember when it fumbled your drawings?' },
    { id:'my3', type:'vote', title:'Mythbusters · 3', e:'💛',
      q:'“AI has feelings.”', answer:1,
      opts:[ {e:'✅', t:'True'}, {e:'❌', t:'False'}, {e:'🤏', t:'Sort of'} ],
      why:'MYTH! It can SOUND friendly because it learned from friendly words — but there\'s nobody in there feeling anything.' },

    // ---- THE FINALE: pick your Module 4 Big Build --------------------------
    { id:'dream', type:'dream', title:'Pick your Big Build! 🌉',
      sub:'This summer you\'ll build a REAL app or game and put it on the internet. Open the Dream Picker on your device, choose, and make it yours — your pick pops up on the big screen!' },

    { id:'end', type:'end', title:'Great work, Apprentices! 🏆',
      sub:'Your missions continue on the platform this week — see you at the next session!' }
  ]
};
