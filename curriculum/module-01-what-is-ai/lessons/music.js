/* ==========================================================================
   Code the Future — lo-fi study beats (window.CTFMusic)
   A tiny PROCEDURAL music engine: everything is synthesized live with the
   Web Audio API (no audio files, no licensing). Kids get creative control:
   vibes, tempo, layers, and a "remix" that re-generates the patterns —
   a hands-on taste of generative/AI-style music.
   ========================================================================== */
(function () {
  var ctx = null, master = null, musicGain = null, started = false;
  var lookahead = null, nextNoteTime = 0, step = 0;
  var crackleNode = null, rainNode = null, crackleGain = null, rainGain = null;

  var state = {
    on: false, vibe: "chill", tempo: 76,
    vinyl: true, rain: false, seed: 4242
  };
  try { Object.assign(state, JSON.parse(localStorage.getItem("ctf:music") || "{}")); } catch (e) {}
  state.on = false; // never autoplay — browsers require a tap anyway

  // mulberry32 seeded random so "remix" is reproducible-ish fun
  function rng(seed) { var t = seed; return function () { t |= 0; t = (t + 0x6D2B79F5) | 0; var r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }

  // chord sets per vibe (frequencies built from semitone offsets on a root)
  var VIBES = {
    chill: { root: 220.0, prog: [[0, 4, 7, 11], [-3, 0, 4, 7], [5, 9, 12, 16], [-2, 2, 5, 9]], filter: 750 },  // Amaj7-ish journey
    space: { root: 196.0, prog: [[0, 3, 7, 14], [-4, 0, 5, 12], [3, 7, 10, 17], [-2, 3, 7, 12]], filter: 600 },
    sunny: { root: 261.6, prog: [[0, 4, 7, 12], [5, 9, 12, 17], [7, 11, 14, 19], [4, 7, 12, 16]], filter: 950 }
  };

  var pattern = { kick: [], snare: [], hat: [] };
  function regenPatterns() {
    var r = rng(state.seed);
    pattern.kick = []; pattern.snare = []; pattern.hat = [];
    for (var i = 0; i < 16; i++) {
      pattern.kick[i] = (i === 0 || i === 8) ? 1 : (i % 2 === 0 && r() < 0.18 ? 1 : 0);
      pattern.snare[i] = (i === 4 || i === 12) ? 1 : (r() < 0.06 ? 1 : 0);
      pattern.hat[i] = (i % 2 === 0) ? 1 : (r() < 0.45 ? 1 : 0);
    }
  }
  regenPatterns();

  function ensureCtx() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.32; musicGain.connect(master);
  }

  function noiseBuffer(seconds) {
    var b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function playKick(t) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
    g.gain.setValueAtTime(0.85, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + 0.25);
  }
  function playSnare(t) {
    var s = ctx.createBufferSource(); s.buffer = noiseBuffer(0.2);
    var f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1800; f.Q.value = 0.8;
    var g = ctx.createGain(); g.gain.setValueAtTime(0.28, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    s.connect(f); f.connect(g); g.connect(musicGain); s.start(t); s.stop(t + 0.2);
  }
  function playHat(t, open) {
    var s = ctx.createBufferSource(); s.buffer = noiseBuffer(0.08);
    var f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 7200;
    var g = ctx.createGain(); g.gain.setValueAtTime(open ? 0.12 : 0.07, t); g.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.09 : 0.04));
    s.connect(f); f.connect(g); g.connect(musicGain); s.start(t); s.stop(t + 0.1);
  }
  function playChord(t, dur, chordIdx) {
    var v = VIBES[state.vibe] || VIBES.chill;
    var semis = v.prog[chordIdx % v.prog.length];
    var f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = v.filter; f.Q.value = 0.4;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.085, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    f.connect(g); g.connect(musicGain);
    semis.forEach(function (s, i) {
      var o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = v.root * Math.pow(2, s / 12);
      o.detune.value = (i % 2 ? 6 : -5);
      o.connect(f); o.start(t); o.stop(t + dur + 0.05);
    });
  }

  function startTextures() {
    stopTextures();
    // vinyl crackle: quiet noise with random pops
    if (state.vinyl) {
      crackleNode = ctx.createBufferSource();
      var b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = (Math.random() < 0.0015 ? (Math.random() * 2 - 1) * 0.9 : (Math.random() * 2 - 1) * 0.012);
      crackleNode.buffer = b; crackleNode.loop = true;
      crackleGain = ctx.createGain(); crackleGain.gain.value = 0.5;
      crackleNode.connect(crackleGain); crackleGain.connect(musicGain); crackleNode.start();
    }
    // rain: lowpassed noise wash
    if (state.rain) {
      rainNode = ctx.createBufferSource(); rainNode.buffer = noiseBuffer(2); rainNode.loop = true;
      var f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 900;
      rainGain = ctx.createGain(); rainGain.gain.value = 0.06;
      rainNode.connect(f); f.connect(rainGain); rainGain.connect(musicGain); rainNode.start();
    }
  }
  function stopTextures() {
    [crackleNode, rainNode].forEach(function (n) { if (n) { try { n.stop(); } catch (e) {} } });
    crackleNode = rainNode = null;
  }

  var chordIdx = 0;
  function scheduler() {
    var spb = 60 / state.tempo / 4; // 16th note seconds
    while (nextNoteTime < ctx.currentTime + 0.15) {
      var s16 = step % 16;
      if (pattern.kick[s16]) playKick(nextNoteTime);
      if (pattern.snare[s16]) playSnare(nextNoteTime);
      if (pattern.hat[s16]) playHat(nextNoteTime, s16 % 4 === 2);
      if (s16 === 0) { playChord(nextNoteTime, spb * 16, chordIdx); chordIdx++; }
      nextNoteTime += spb;
      step++;
    }
  }

  function persist() { try { localStorage.setItem("ctf:music", JSON.stringify({ vibe: state.vibe, tempo: state.tempo, vinyl: state.vinyl, rain: state.rain, seed: state.seed })); } catch (e) {} }

  var api = {
    get state() { return state; },
    start: function () {
      ensureCtx();
      if (ctx.state === "suspended") ctx.resume();
      if (state.on) return;
      state.on = true; started = true;
      step = 0; chordIdx = 0; nextNoteTime = ctx.currentTime + 0.06;
      startTextures();
      lookahead = setInterval(scheduler, 90);
      api.onchange && api.onchange();
    },
    stop: function () {
      state.on = false;
      if (lookahead) { clearInterval(lookahead); lookahead = null; }
      stopTextures();
      api.onchange && api.onchange();
    },
    toggle: function () { state.on ? api.stop() : api.start(); },
    setVibe: function (v) { if (VIBES[v]) { state.vibe = v; persist(); api.onchange && api.onchange(); } },
    setTempo: function (t) { state.tempo = t; persist(); api.onchange && api.onchange(); },
    setLayer: function (name, on) {
      if (name === "vinyl") state.vinyl = on;
      if (name === "rain") state.rain = on;
      persist();
      if (state.on) startTextures();
      api.onchange && api.onchange();
    },
    remix: function () {
      state.seed = Math.floor(Math.random() * 1e9);
      regenPatterns(); persist();
      api.onchange && api.onchange();
    },
    duck: function (down) { if (musicGain) musicGain.gain.linearRampToValueAtTime(down ? 0.10 : 0.32, (ctx ? ctx.currentTime : 0) + 0.25); },
    onchange: null
  };
  window.CTFMusic = api;
})();
