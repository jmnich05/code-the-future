/* ==========================================================================
   Code the Future — Lesson PLAYER engine
   Renders one beat per screen. Words trickle in. Tap / Space / → to continue.
   Loads lessons/content/<track>.json (track from ?track=kids|adults).
   ========================================================================== */
(function () {
  "use strict";
  var qs = new URLSearchParams(location.search);
  var TRACK = qs.get("track") === "adults" ? "adults" : "kids";
  var MODULE = "module-02-ai-and-society";
  var POSKEY = "ctf:pos:" + MODULE + ":" + TRACK;
  var stage, label, fill, backBtn, nextBtn, hint;
  var DATA, STEPS = [], pos = 0, animating = false, revealTimer = null, hadLocalPos = false;
  // anti-skip-spam: a minimum dwell on each genuinely-NEW beat before you can
  // advance. Content-proportional, so it completes faster than a kid actually
  // reads (never blocks a real reader) — but a spammer can't race to the reward.
  // Re-reads and replays are never gated. Tune with these three constants.
  var DWELL_FLOOR = 4400, DWELL_PER_WORD = 400, DWELL_CAP = 18000;
  var dwellTimer = null, dwellReady = true;
  var widgetReady = true;   // gate: a beat's activity must be played through once before Continue
  var videoTimer = null, videoRemain = -1;   // video beats: Continue waits the video's full length (no skipping)
  // furthest step ever reached — the high-water mark. Replays move `pos` back,
  // but `furthest` never decreases, and it's what we sync to the cloud so a
  // fresh browser can never wipe out real progress.
  var MAXKEY = "ctf:max:" + MODULE + ":" + TRACK;
  var furthest = 0, cloudReady = false;
  // ---- drip pacing: 3 parts, unlocked on days 0 / +2 / +4 ------------------
  var PARTS = [
    { n: 1, first: 1, last: 4, offset: 0 },
    { n: 2, first: 5, last: 8, offset: 2 },
    { n: 3, first: 9, last: 12, offset: 4 }
  ];
  var paceBypass = false, paceAnchor = null;
  // Module 2 launch floor: missions stay locked until this date no matter when
  // a learner first opens it. Self-expires (anyone who first plays after this
  // date anchors to their own start). Module 1 launches 2026-07-06; Module 2
  // follows the next week. Change this one line to move Module 2's launch.
  var LAUNCH_FLOOR = "2026-07-13";
  // LOCAL date, not toISOString (UTC) — an evening first-open used to stamp
  // tomorrow's date and lock Part 1 until the next day
  function localDate() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  try {
    if (new URLSearchParams(location.search).get("unlock") === "all") localStorage.setItem("ctf:unlockall", "1");
    paceBypass = localStorage.getItem("ctf:unlockall") === "1";
    paceAnchor = localStorage.getItem("ctf:firstplay:" + MODULE);
    if (!paceAnchor || paceAnchor > localDate()) {  // self-heal future-dated anchors
      paceAnchor = localDate();
      localStorage.setItem("ctf:firstplay:" + MODULE, paceAnchor);
    }
  } catch (e) { paceAnchor = localDate(); }
  function stepMission(st) {
    if (!st || !st.m) return null;
    if (st.m.n) return st.m.n;
    if (st.m.kind === "capstone") return 12;   // capstone unlocks with Part 3
    return null;                                // intro: always open
  }
  function partOf(m) { for (var i = 0; i < PARTS.length; i++) if (m >= PARTS[i].first && m <= PARTS[i].last) return PARTS[i]; return PARTS[0]; }
  function unlockDate(part) {
    var a = (paceAnchor && paceAnchor > LAUNCH_FLOOR) ? paceAnchor : LAUNCH_FLOOR;  // never before launch day
    var d = new Date(a + "T00:00:00"); d.setDate(d.getDate() + part.offset); return d;
  }
  function isLocked(m) {
    if (paceBypass || !m) return false;
    return new Date() < unlockDate(partOf(m));
  }
  function unlockLabel(part) {
    var d = unlockDate(part);
    var days = Math.ceil((d - new Date()) / 86400000);
    var wd = d.toLocaleDateString("en-US", { weekday: "long" });
    var dateStr = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    return { weekday: wd, days: days, dateStr: dateStr };
  }
  function lastUnlockedIndex() {
    for (var i = STEPS.length - 1; i >= 0; i--) {
      var mn = stepMission(STEPS[i]);
      if (!mn || !isLocked(mn)) return i;
    }
    return 0;
  }
  var bootTarget = null;  // saved position the boot clamp squashed (if any)
  function reclampForLocks() {
    var mn = stepMission(STEPS[pos]);
    if (mn && isLocked(mn)) { pos = lastUnlockedIndex(); render(); }
    else if (bootTarget != null) {
      // the cohort anchor arrived and may have unlocked what boot clamped —
      // give the kid their real spot back
      var tm = stepMission(STEPS[bootTarget]);
      if (!tm || !isLocked(tm)) { pos = bootTarget; bootTarget = null; render(); }
    }
  }
  function showLock(part) {
    stopSpeaking();
    var u = unlockLabel(part);
    var whenH = u.days <= 1 ? "tomorrow" : (u.days > 6 ? u.dateStr : "on " + u.weekday);
    var whenP = u.days <= 1 ? "tomorrow" : (u.days > 6 ? u.dateStr : u.weekday);
    var preLaunch = part.n === 1;  // Module 2 itself hasn't opened yet
    stage.innerHTML =
      '<div class="beat t-lock revealed"><div class="lock-card">' +
      '<div class="lock-ico">' + (preLaunch ? "🚀" : "🔒") + '</div>' +
      '<h2>' + (preLaunch ? "Module 2 opens " + whenH : "Part " + part.n + " unlocks " + whenH) + '!</h2>' +
      (preLaunch
        ? '<p>Nice — you found the next adventure! 🚀 <b>Module 2: AI and Our World</b> is fueled up and opens on launch day. Keep building in Module 1 and watch for it!</p>'
        : '<p>Amazing work today, Future Builder! 🎉 Your brain needs time to let all those new ideas settle in — that\'s real learning.</p>') +
      '<p class="lock-sub">Missions ' + part.first + '–' + part.last + ' open ' + whenP + '. Until then: ' +
        (preLaunch ? 'keep building in Module 1, remix your homepage, or say hi on the board!' : 'replay any mission, remix your homepage, customize your character, or say hi on the board!') + '</p>' +
      '<a class="lock-btn" href="../../../platform/index.html">🏠 Back to home</a> ' +
      (preLaunch ? '' : '<button class="lock-btn lock-alt" onclick="document.getElementById(\'pMap\').click()">🗺️ Replay a mission</button>') +
      '</div></div>';
    nextBtn.style.display = "none";
    hint.textContent = "";
    label.textContent = preLaunch ? "Module 2 · locked 🚀" : ("Part " + part.n + " · locked");
  }

  var ttsAudio = null, speaking = false;
  var audioOn = false; try { audioOn = localStorage.getItem("ctf:audio") === "1"; } catch (e) {}
  function stopSpeaking() {
    if (ttsAudio) { try { ttsAudio.pause(); } catch (e) {} ttsAudio = null; }
    speaking = false;
    if (window.CTFMusic) window.CTFMusic.duck(false);
    syncAudioBtn();
  }
  function syncAudioBtn() {
    var b = document.getElementById("pAudio");
    if (!b) return;
    b.classList.toggle("on", audioOn);
    b.innerHTML = audioOn ? (speaking ? "🔊 Reading… <small>tap to turn off</small>" : "🔊 Audio learning <b>ON</b>") : "🔈 Turn on audio learning";
  }
  async function speakBeat() {
    var b = stage.querySelector(".beat"); if (!b) return;
    // audio learning reads TEXT only — never narrate over an activity or a video
    if (b.classList.contains("t-widget") || b.classList.contains("t-video")) { stopSpeaking(); return; }
    var text = (b.innerText || b.textContent || "").replace(/\s+/g, " ").trim().slice(0, 900);
    if (!text) return;   // image/art beats have nothing to read
    try {
      var r = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text }) });
      if (!r.ok || !audioOn) return;
      var blob = await r.blob();
      stopSpeaking();
      if (!audioOn) return;
      ttsAudio = new Audio(URL.createObjectURL(blob));
      speaking = true; syncAudioBtn();
      if (window.CTFMusic) window.CTFMusic.duck(true);
      ttsAudio.onended = function () { speaking = false; if (window.CTFMusic) window.CTFMusic.duck(false); syncAudioBtn(); };
      ttsAudio.play().catch(function () { speaking = false; if (window.CTFMusic) window.CTFMusic.duck(false); syncAudioBtn(); });
    } catch (e) {}
  }

  // ---- Supabase sync (optional; no-ops if CTFDB unconfigured) -------------
  function db() { return (window.CTFDB && window.CTFDB.enabled) ? window.CTFDB : null; }
  // cloud stores the HIGH-WATER MARK, and only after we've reconciled with the
  // cloud once — so a fresh browser at step 0 can never overwrite real progress
  function cloudSaveProgress() {
    if (!cloudReady) return;
    var d = db(); if (d) d.saveProgress(MODULE, TRACK, furthest, furthest >= STEPS.length - 1);
  }
  function onDbReady() {
    var d = db(); if (!d) return;
    // pacing anchor + staff bypass come from the cohort
    d.myCohorts().then(function (cs) {
      if (cs && cs.length) {
        if (cs[0].role === "staff") paceBypass = true;
        if (cs[0].starts_on) paceAnchor = cs[0].starts_on;
        reclampForLocks();
      }
    });
    // if we're sitting on a complete beat that rendered before DB init, award now
    var st = STEPS[pos];
    if (st && st.kind === "beat" && st.b.type === "complete" && st.m && st.m.n) {
      d.awardBadge(TRACK + "-mod2-" + st.m.n, { module: MODULE, track: TRACK });
    }
    // ALWAYS reconcile with the cloud: merge the high-water mark from wherever
    // this kid played before (other browser, other device, cleared storage)
    d.getProgress(MODULE, TRACK).then(function (rp) {
      var cloudPos = (rp && typeof rp.position === "number") ? rp.position : 0;
      if (cloudPos > furthest && cloudPos < STEPS.length) furthest = cloudPos;
      // no local position = fresh browser → resume at the furthest point
      if (!hadLocalPos && furthest > pos) {
        pos = furthest;
        var mn = stepMission(STEPS[pos]);
        if (mn && isLocked(mn)) pos = lastUnlockedIndex();
        render();
      }
      cloudReady = true;
      save();
    }).catch(function () { cloudReady = true; });
    d.logEvent("lesson_open", { module: MODULE, track: TRACK, pos: pos });
  }

  function el(t, c, h) { var n = document.createElement("t" === t ? "div" : t); n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; }

  // ---- word-by-word wrapping (preserves inline tags) ----------------------
  function wrapWords(node, st) {
    [].slice.call(node.childNodes).forEach(function (n) {
      if (n.nodeType === 3) {
        var parts = n.textContent.split(/(\s+)/), frag = document.createDocumentFragment();
        parts.forEach(function (p) {
          if (p === "" ) return;
          if (!p.trim()) { frag.appendChild(document.createTextNode(p)); return; }
          var s = document.createElement("span"); s.className = "w"; s.textContent = p;
          s.style.animationDelay = (st.i++ * 26) + "ms";
          frag.appendChild(s);
        });
        node.replaceChild(frag, n);
      } else if (n.nodeType === 1) { wrapWords(n, st); }
    });
  }

  function applyReveal(beatEl, type) {
    var total = 400;
    if (type === "text" || type === "quote") {
      var st = { i: 0 };
      [].slice.call(beatEl.querySelectorAll("h2,h3,h4,p,blockquote p")).forEach(function (e) { wrapWords(e, st); });
      total = st.i * 26 + 460;
    } else if (type === "list") {
      var st2 = { i: 0 };
      [].slice.call(beatEl.querySelectorAll("h2,h3,h4")).forEach(function (e) { wrapWords(e, st2); });
      var lis = [].slice.call(beatEl.querySelectorAll("li"));
      lis.forEach(function (li, i) { li.classList.add("reveal-child"); li.style.animationDelay = (st2.i * 26 + i * 95) + "ms"; });
      total = st2.i * 26 + lis.length * 95 + 540;
    } else {
      var cs = [].slice.call(beatEl.children);
      if (!cs.length) { beatEl.classList.add("reveal-child"); cs = [beatEl]; }
      cs.forEach(function (c, i) { c.classList.add("reveal-child"); c.style.animationDelay = (i * 110) + "ms"; });
      total = cs.length * 110 + 560;
    }
    return total;
  }

  function finishReveal() {
    var b = stage.querySelector(".beat"); if (b) b.classList.add("revealed");
    animating = false; clearTimeout(revealTimer); syncControls();
  }

  // ---- render one step ----------------------------------------------------
  function render() {
    stopSpeaking();
    var step = STEPS[pos];
    var beat = el("div", "beat");
    var type = step.kind;

    if (step.kind === "title") {
      type = "title";
      beat.className = "beat t-title";
      var m = step.m;
      var num = m.kind === "intro" ? "Start here" : (DATA.unitWord + " " + m.n + " of " + DATA.total);
      beat.innerHTML = '<div class="num">' + num + "</div><h2>" + esc(m.title) + "</h2>" + (m.meta ? '<div class="meta">' + m.meta + "</div>" : "");
    } else {
      type = step.b.type;
      beat.className = "beat t-" + type;
      if (type === "complete") {
        var n = step.m && step.m.n, total = 12;
        var bart = (window.CTFBadge && window.CTFBadge.renderKey && n) ? window.CTFBadge.renderKey("kids-mod2-" + n) : "";
        var bname = (window.CTFBadge && window.CTFBadge.nameFor && n) ? window.CTFBadge.nameFor("kids-mod2-" + n) : "";
        var dots = ""; for (var d = 1; d <= total; d++) dots += '<i class="' + (d <= n ? "on" : "") + '"></i>';
        beat.innerHTML =
          '<div class="cc">' +
            '<div class="cc-medal">' + bart + '</div>' +
            '<div class="cc-title">' + DATA.unitWord + " " + n + ' Complete!</div>' +
            (bname ? '<div class="cc-badge">' + esc(bname) + '</div>' : '') +
            '<div class="cc-dots">' + dots + '</div><div class="cc-count">' + n + ' of ' + total + '</div>' +
            (step.b.affirmation ? '<div class="cc-aff">' + step.b.affirmation + '</div>' : '') +
            (step.b.nextUp ? '<div class="cc-next"><span>Next up</span> ' + esc(step.b.nextUp) + '</div>' : '') +
          '</div>';
        confetti();
        var dd = db();
        if (dd && n) { dd.awardBadge(TRACK + "-mod2-" + n, { module: MODULE, track: TRACK }); dd.logEvent("mission_complete", { module: MODULE, track: TRACK, n: n }); }
        if (n === total) maybePetEarn();   // finished the last mission → earn your sidekick pet
      } else if (type === "capstone") {
        beat.innerHTML = '<div class="inner">' + step.b.html + "</div>";
        var dc = db(); if (dc) dc.awardBadge(TRACK + "-" + MODULE + "-complete", { module: MODULE, track: TRACK });
      } else beat.innerHTML = step.b.html;
    }

    stage.innerHTML = "";
    stage.appendChild(beat);
    stage.scrollTop = 0;

    if (type === "widget" && window.CTFWidgets) window.CTFWidgets.init(stage);
    // gate Continue until the activity on this beat has been played through once
    widgetReady = widgetsComplete(beat);

    var dur = applyReveal(beat, type);
    animating = true; clearTimeout(revealTimer);
    revealTimer = setTimeout(function () { animating = false; syncControls(); }, dur);

    // minimum dwell — only on genuinely-new beats (pos beyond the high-water
    // mark), never on titles, re-reads, or replays.
    setupDwell(beat, type, pos > furthest);
    setupVideoGate(beat, type, pos > furthest);   // videos can't be skipped — Continue waits their length

    if (audioOn) speakBeat();   // audio learning: read each screen aloud

    save();
    syncControls();
  }

  // true when every interactive widget on this beat is finished (or there are none)
  function widgetsComplete(beat) {
    if (!window.CTFWidgets || !window.CTFWidgets.isDone) return true;
    var nodes = beat.querySelectorAll("[data-ctf-id]");
    for (var k = 0; k < nodes.length; k++) {
      if (!window.CTFWidgets.isDone(nodes[k].getAttribute("data-ctf-id"))) return false;
    }
    return true;
  }

  function setupDwell(beat, type, isNew) {
    clearTimeout(dwellTimer);
    nextBtn.classList.remove("charging", "ready");
    if (!isNew || type === "title") { dwellReady = true; return; }
    var words = (beat.textContent || "").trim().split(/\s+/).filter(Boolean).length;
    var ms = Math.min(DWELL_CAP, Math.max(DWELL_FLOOR, words * DWELL_PER_WORD));
    dwellReady = false;
    nextBtn.style.setProperty("--charge-ms", ms + "ms");
    nextBtn.classList.add("charging");
    dwellTimer = setTimeout(function () {
      dwellReady = true;
      nextBtn.classList.remove("charging");
      nextBtn.classList.add("ready");
      syncControls();
    }, ms);
  }

  function fmtTime(s) { s = Math.max(0, Math.round(s)); var m = Math.floor(s / 60), x = s % 60; return m + ":" + (x < 10 ? "0" : "") + x; }

  // ---- video gate: Continue waits the video's ACTUAL length, so kids can't
  // skip a video. Duration is read live from the YouTube IFrame API (no hard-
  // coded lengths); a 120s fallback covers the rare case the API can't load.
  function loadYT(cb) {
    if (window.YT && window.YT.Player) { cb(); return; }
    (window.__ytcbs = window.__ytcbs || []).push(cb);
    if (!window.__ytloading) {
      window.__ytloading = true;
      var prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () { if (prev) prev(); (window.__ytcbs || []).forEach(function (f) { try { f(); } catch (e) {} }); window.__ytcbs = []; };
      var s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(s);
    }
  }
  function videoDuration(iframe, cb) {
    var done = false, fail = setTimeout(function () { if (!done) { done = true; cb(0); } }, 6500);
    function finish(d) { if (done) return; done = true; clearTimeout(fail); cb(d); }
    if (!iframe) { finish(0); return; }
    loadYT(function () {
      try {
        var p = new YT.Player(iframe, { events: { onReady: function () {
          var tries = 0;
          (function poll() {
            var d = 0; try { d = p.getDuration(); } catch (e) {}
            if (d && d > 0) finish(d);
            else if (tries++ < 12) setTimeout(poll, 400);
            else finish(0);
          })();
        } } });
      } catch (e) { finish(0); }
    });
  }
  function setupVideoGate(beat, type, isNew) {
    clearInterval(videoTimer); videoTimer = null; videoRemain = -1;
    if (type !== "video" || !isNew || paceBypass) return;   // re-watches & testers (?unlock=all) aren't gated
    clearTimeout(dwellTimer); dwellReady = true;   // the video gate is the sole gate here (don't let dwell cut the fill)
    widgetReady = false;
    nextBtn.classList.remove("charging", "ready");
    syncControls();
    videoDuration(beat.querySelector("iframe"), function (dur) {
      var secs = Math.max(5, Math.round(dur || 120));
      videoRemain = secs;
      nextBtn.style.setProperty("--charge-ms", (secs * 1000) + "ms");
      nextBtn.classList.add("charging");
      syncControls();
      videoTimer = setInterval(function () {
        videoRemain--;
        if (videoRemain <= 0) {
          clearInterval(videoTimer); videoTimer = null; videoRemain = -1;
          widgetReady = true;
          nextBtn.classList.remove("charging"); nextBtn.classList.add("ready");
        }
        syncControls();
      }, 1000);
    });
  }

  function syncControls() {
    var step = STEPS[pos], atEnd = pos >= STEPS.length - 1;
    var m = step.m;
    var isVid = step.kind === "beat" && step.b && step.b.type === "video";
    label.textContent = m.kind === "capstone" ? "Capstone" : m.kind === "intro" ? "Read this first" : (DATA.unitWord + " " + m.n + " · " + m.title);
    fill.style.width = (STEPS.length > 1 ? (pos / (STEPS.length - 1) * 100) : 100) + "%";
    backBtn.disabled = pos === 0;

    // next button
    if (step.kind === "beat" && step.b.type === "capstone") { nextBtn.style.display = "none"; }
    else {
      nextBtn.style.display = "";
      var nextStep = STEPS[pos + 1];
      if (step.kind === "title") nextBtn.textContent = "Begin →";
      else if (nextStep && nextStep.kind === "title") nextBtn.textContent = "Next " + DATA.unitWord + " →";
      else if (atEnd) nextBtn.textContent = "Finish";
      else nextBtn.textContent = animating ? "Skip →" : "Continue →";
      if (!animating && isVid && !widgetReady) nextBtn.textContent = videoRemain >= 0 ? ("⏳ " + fmtTime(videoRemain)) : "⏳ …";
    }
    // dim Continue while the activity is still unfinished
    nextBtn.classList.toggle("gated", !animating && !widgetReady);
    hint.textContent = animating ? "tap to reveal"
      : (isVid && !widgetReady ? (videoRemain >= 0 ? "🎬 watch the video — " + fmtTime(videoRemain) + " left" : "🎬 starting the video…")
      : (!widgetReady ? "▶ finish the activity to continue"
      : (!dwellReady ? "keep reading…"
      : (step.kind === "title" ? "tap anywhere to begin" : ""))));
  }

  function next() {
    if (animating) { finishReveal(); return; }
    if (!widgetReady) { nudgeNext(); return; }   // must play through the activity first
    if (!dwellReady) { nudgeNext(); return; }   // still charging — can't skip yet
    if (pos < STEPS.length - 1) {
      var nxm = stepMission(STEPS[pos + 1]);
      if (nxm && isLocked(nxm)) { showLock(partOf(nxm)); return; }
      pos++; render();
    }
  }
  function nudgeNext() {
    nextBtn.classList.remove("nudge"); void nextBtn.offsetWidth; nextBtn.classList.add("nudge");
  }
  function prev() { if (pos > 0) { pos--; render(); finishReveal(); } }

  function save() {
    if (pos > furthest) furthest = pos;
    try {
      localStorage.setItem(POSKEY, String(pos));
      localStorage.setItem(MAXKEY, String(furthest));
    } catch (e) {}
    cloudSaveProgress();
  }

  // ---- confetti burst on badge moments ------------------------------------
  function confetti() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var colors = ["#3D74FF", "#26C7D1", "#FF5A38", "#FFB320", "#7C5CFF", "#2FBF71", "#FF6FB5"];
    var holder = document.createElement("div");
    holder.className = "confetti";
    for (var i = 0; i < 34; i++) {
      var p = document.createElement("i");
      p.style.left = (Math.random() * 100) + "%";
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = (Math.random() * 0.6) + "s";
      p.style.animationDuration = (1.6 + Math.random() * 1.2) + "s";
      p.style.width = p.style.height = (6 + Math.random() * 8) + "px";
      if (i % 3 === 0) p.style.borderRadius = "50%";
      holder.appendChild(p);
    }
    stage.appendChild(holder);
    setTimeout(function () { if (holder.parentNode) holder.parentNode.removeChild(holder); }, 3400);
  }

  // ---- Module 2 sidekick pet picker (full-screen, first entry) --------------
  function getProfileLocal() { try { return JSON.parse(localStorage.getItem("ctf:profile") || "null") || {}; } catch (e) { return {}; } }
  function chosenPet() { var p = getProfileLocal(); return (p.avatar && p.avatar.pet) || p.pet || null; }
  function savePet(id) {
    var p = getProfileLocal(); p.avatar = p.avatar || {}; p.avatar.pet = id;
    try { localStorage.setItem("ctf:profile", JSON.stringify(p)); } catch (e) {}
    var d = db(); if (d && d.updateProfile) { try { d.updateProfile({ avatar: p.avatar }); } catch (e) {} d.logEvent && d.logEvent("pet_chosen", { pet: id }); }
  }
  function petBurst(host) {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var colors = ["#3D74FF", "#26C7D1", "#FF5A38", "#FFB320", "#7C5CFF", "#2FBF71", "#FF6FB5"];
    var h = document.createElement("div"); h.className = "confetti";
    for (var i = 0; i < 46; i++) { var p = document.createElement("i"); p.style.left = (Math.random() * 100) + "%"; p.style.background = colors[i % colors.length]; p.style.animationDelay = (Math.random() * .5) + "s"; p.style.animationDuration = (1.5 + Math.random() * 1.3) + "s"; p.style.width = p.style.height = (7 + Math.random() * 9) + "px"; if (i % 3 === 0) p.style.borderRadius = "50%"; h.appendChild(p); }
    host.appendChild(h); setTimeout(function () { if (h.parentNode) h.parentNode.removeChild(h); }, 3400);
  }
  function petCards() {
    return window.CTFAvatar.PETS.map(function (p) {
      return '<button class="pp-card" data-id="' + p.id + '" style="--c1:' + p.c1 + ';--c2:' + p.c2 + '">' +
        '<span class="pp-emoji">' + p.emoji + '</span><span class="pp-name">' + p.name + '</span></button>';
    }).join("");
  }
  // shown ONCE at the start of Module 2: a preview of the reward you can earn
  function maybePetPreview() {
    if (!window.CTFAvatar || !window.CTFAvatar.PETS) return;
    if (chosenPet()) return;                                 // already earned one
    var seen = false; try { seen = localStorage.getItem("ctf:m2:petpreview") === "1"; } catch (e) {}
    if (seen) return;
    try { localStorage.setItem("ctf:m2:petpreview", "1"); } catch (e) {}
    setTimeout(petPreview, 650);
  }
  function petPreview() {
    var ov = document.createElement("div"); ov.className = "pet-picker preview";
    ov.innerHTML =
      '<div class="pp-head">🎁 Finish Module 2 to earn a sidekick! 🎁</div>' +
      '<div class="pp-sub">Complete all 12 missions and ONE of these little friends is yours to keep — it\'ll tag along with you forever. Here\'s who\'s waiting!</div>' +
      '<div class="pp-grid">' + petCards() + '</div>' +
      '<button class="pp-go">Let\'s earn one! →</button>';
    document.body.appendChild(ov);
    requestAnimationFrame(function () { ov.classList.add("show"); });
    ov.querySelector(".pp-go").onclick = function () { ov.classList.add("out"); setTimeout(function () { if (ov.parentNode) ov.remove(); }, 350); };
  }
  // fired when the LAST mission is completed → now they choose & earn their pet
  function maybePetEarn() {
    if (!window.CTFAvatar || !window.CTFAvatar.PETS) return;
    if (chosenPet()) return;                                 // already claimed
    setTimeout(petPicker, 700);
  }
  function petPicker() {
    var A = window.CTFAvatar, sel = null;
    var ov = document.createElement("div"); ov.className = "pet-picker";
    ov.innerHTML =
      '<div class="pp-head">🎉 You finished Module 2! 🎉</div>' +
      '<div class="pp-sub">You earned a sidekick pet — pick the friend you want to keep!</div>' +
      '<div class="pp-grid">' + petCards() + '</div>' +
      '<button class="pp-go" disabled>Pick your reward</button>';
    document.body.appendChild(ov);
    requestAnimationFrame(function () { ov.classList.add("show"); });
    var go = ov.querySelector(".pp-go");
    ov.querySelectorAll(".pp-card").forEach(function (card) {
      card.onclick = function () {
        ov.querySelectorAll(".pp-card").forEach(function (c) { c.classList.remove("on"); });
        card.classList.add("on"); sel = card.getAttribute("data-id");
        go.disabled = false; go.textContent = "Choose " + A.petById(sel).name + "! →";
      };
    });
    go.onclick = function () {
      if (!sel) return;
      savePet(sel);
      var p = A.petById(sel);
      ov.classList.add("chosen");
      ov.querySelector(".pp-head").textContent = "🎉 Meet " + p.name + "! 🎉";
      ov.querySelector(".pp-sub").textContent = p.name + " is yours forever — find it on your Profile!";
      ov.querySelector(".pp-grid").innerHTML = '<div class="pp-pick">' + A.renderPet(sel, { size: 150 }) + '</div>';
      petBurst(ov);
      go.textContent = "Let's go! →";
      go.onclick = function () { ov.classList.add("out"); setTimeout(function () { if (ov.parentNode) ov.remove(); }, 350); };
    };
  }

  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]; }); }

  // ---- boot ---------------------------------------------------------------
  function flatten(data) {
    var steps = [];
    data.missions.forEach(function (m) {
      if (m.kind !== "capstone") steps.push({ kind: "title", m: m });
      m.beats.forEach(function (b) { steps.push({ kind: "beat", m: m, b: b }); });
    });
    return steps;
  }

  function build() {
    var root = document.getElementById("player");
    root.innerHTML =
      '<div class="p-top"><a class="p-exit" href="../../../platform/index.html">✕ Exit</a><button class="p-map" id="pMap">🗺️ Missions</button><span class="p-label" id="pLabel"></span><span class="p-track"><i id="pFill"></i></span></div>' +
      '<div class="p-stage" id="pStage"></div>' +
      '<div class="p-bottom"><button class="p-back" id="pBack">‹ Back</button><button class="p-audio" id="pAudio"></button><button class="p-music" id="pMusic">🎵</button><span class="p-hint" id="pHint"></span><button class="p-next" id="pNext">Continue →</button></div>' +
      '<div class="music-dock" id="musicDock">' +
        '<div class="md-head">🎵 Study Beats <span class="md-sub">made by code, remixed by you</span></div>' +
        '<button class="md-play" id="mdPlay">▶ Play beats</button>' +
        '<div class="md-row"><span class="md-lbl">Vibe</span>' +
          '<button class="md-chip" data-vibe="chill">😌 Chill</button>' +
          '<button class="md-chip" data-vibe="space">🌌 Space</button>' +
          '<button class="md-chip" data-vibe="sunny">🌞 Sunny</button></div>' +
        '<div class="md-row"><span class="md-lbl">Speed</span>' +
          '<button class="md-chip" data-tempo="68">🐢 Slow</button>' +
          '<button class="md-chip" data-tempo="76">🚶 Chill</button>' +
          '<button class="md-chip" data-tempo="88">🏃 Upbeat</button></div>' +
        '<div class="md-row"><span class="md-lbl">Layers</span>' +
          '<button class="md-chip" data-layer="vinyl">📀 Vinyl</button>' +
          '<button class="md-chip" data-layer="rain">🌧️ Rain</button></div>' +
        '<button class="md-remix" id="mdRemix">🎲 Remix the beat!</button>' +
        '<div class="md-note">The computer composes this live — and it keeps evolving as you listen: new drum patterns, little melodies, even key changes. No two minutes are ever the same. That\'s generative AI thinking!</div>' +
      '</div>' +
      '<div class="mmap" id="mmap"><div class="mmap-card">' +
        '<div class="mmap-head">🗺️ Mission Map <button class="mmap-close" id="mmapClose">✕</button></div>' +
        '<div class="mmap-sub">Replay any mission you\'ve finished, or jump back to where you left off.</div>' +
        '<div class="mmap-list" id="mmapList"></div>' +
      '</div></div>';
    stage = document.getElementById("pStage");
    label = document.getElementById("pLabel");
    fill = document.getElementById("pFill");
    backBtn = document.getElementById("pBack");
    nextBtn = document.getElementById("pNext");
    hint = document.getElementById("pHint");

    nextBtn.addEventListener("click", next);
    backBtn.addEventListener("click", prev);

    // an activity just finished — lift the gate on Continue if this beat is now done
    document.addEventListener("ctf:widget-done", function () {
      if (widgetReady) return;
      if (widgetsComplete(stage)) {
        widgetReady = true;
        nextBtn.classList.remove("gated");
        if (dwellReady) { nextBtn.classList.remove("charging"); nextBtn.classList.add("ready"); }
        syncControls();
      }
    });

    // 🎵 Study beats dock
    var musicBtn = document.getElementById("pMusic");
    var dock = document.getElementById("musicDock");
    function syncMusic() {
      var M = window.CTFMusic; if (!M) return;
      musicBtn.classList.toggle("on", M.state.on);
      musicBtn.textContent = M.state.on ? "🎵" : "🎵";
      document.getElementById("mdPlay").textContent = M.state.on ? "⏸ Pause beats" : "▶ Play beats";
      dock.querySelectorAll("[data-vibe]").forEach(function (c) { c.classList.toggle("sel", c.getAttribute("data-vibe") === M.state.vibe); });
      dock.querySelectorAll("[data-tempo]").forEach(function (c) { c.classList.toggle("sel", +c.getAttribute("data-tempo") === M.state.tempo); });
      dock.querySelectorAll("[data-layer]").forEach(function (c) {
        var k = c.getAttribute("data-layer"); c.classList.toggle("sel", !!M.state[k]);
      });
    }
    if (window.CTFMusic) {
      window.CTFMusic.onchange = syncMusic;
      musicBtn.addEventListener("click", function () { dock.classList.toggle("open"); syncMusic(); });
      document.getElementById("mdPlay").addEventListener("click", function () { window.CTFMusic.toggle(); });
      document.getElementById("mdRemix").addEventListener("click", function () {
        window.CTFMusic.remix();
        this.textContent = "🎲 Remixed! Again?";
        if (!window.CTFMusic.state.on) window.CTFMusic.start();
      });
      dock.querySelectorAll("[data-vibe]").forEach(function (c) { c.addEventListener("click", function () { window.CTFMusic.setVibe(c.getAttribute("data-vibe")); }); });
      dock.querySelectorAll("[data-tempo]").forEach(function (c) { c.addEventListener("click", function () { window.CTFMusic.setTempo(+c.getAttribute("data-tempo")); }); });
      dock.querySelectorAll("[data-layer]").forEach(function (c) { c.addEventListener("click", function () {
        var k = c.getAttribute("data-layer"); window.CTFMusic.setLayer(k, !window.CTFMusic.state[k]);
      }); });
      document.addEventListener("click", function (e) {
        if (dock.classList.contains("open") && !dock.contains(e.target) && e.target !== musicBtn) dock.classList.remove("open");
      });
      syncMusic();
    } else { musicBtn.style.display = "none"; }

    // 🗺️ Mission Map — replay finished missions / fast-forward to your spot
    var mapBtn = document.getElementById("pMap");
    var mapOv = document.getElementById("mmap");
    function missionRanges() {
      var out = [], cur = null;
      STEPS.forEach(function (st, i) {
        if (!cur || cur.m !== st.m) { cur = { m: st.m, start: i, end: i }; out.push(cur); }
        else cur.end = i;
      });
      return out;
    }
    function renderMap() {
      var list = document.getElementById("mmapList");
      list.innerHTML = missionRanges().map(function (r, idx) {
        var m = r.m;
        var name = m.kind === "intro" ? "Start here" : m.kind === "capstone" ? "🚀 The Big Mission" : "Mission " + m.n + " — " + m.title;
        var mn = m.kind === "capstone" ? 12 : m.n;
        var done = furthest > r.end;
        var here = furthest >= r.start && furthest <= r.end;
        var locked = mn ? isLocked(mn) : false;
        var cls = "mm-item", chip = "", act = "";
        if (locked) { cls += " mm-locked"; chip = "🔒 " + unlockLabel(partOf(mn)).weekday; }
        else if (done) { cls += " mm-done"; chip = "✅ Replay"; act = ' data-jump="' + r.start + '"'; }
        else if (here) { cls += " mm-here"; chip = "▶ Continue"; act = ' data-jump="' + furthest + '"'; }
        else { cls += " mm-soon"; chip = "Up next"; }
        return '<button class="' + cls + '"' + act + (locked || (!done && !here) ? " disabled" : "") + ">" +
          '<span class="mm-name">' + esc(name) + '</span><span class="mm-chip">' + chip + "</span></button>";
      }).join("");
      list.querySelectorAll("[data-jump]").forEach(function (b) {
        b.addEventListener("click", function () {
          pos = Math.min(parseInt(b.getAttribute("data-jump"), 10) || 0, STEPS.length - 1);
          mapOv.classList.remove("open");
          render(); finishReveal();
        });
      });
    }
    mapBtn.addEventListener("click", function () { renderMap(); mapOv.classList.add("open"); });
    document.getElementById("mmapClose").addEventListener("click", function () { mapOv.classList.remove("open"); });
    mapOv.addEventListener("click", function (e) { if (e.target === mapOv) mapOv.classList.remove("open"); });

    // "Audio learning" toggle — ElevenLabs reads each screen aloud while ON
    var audioBtn = document.getElementById("pAudio");
    syncAudioBtn();
    audioBtn.addEventListener("click", function () {
      audioOn = !audioOn;
      try { localStorage.setItem("ctf:audio", audioOn ? "1" : "0"); } catch (e) {}
      if (audioOn) { finishReveal(); speakBeat(); } else { stopSpeaking(); }
      syncAudioBtn();
    });
    stage.addEventListener("click", function (e) {
      if (e.target.closest("a,button,input,textarea,select,.ctf")) return;
      next();
    });
    document.addEventListener("keydown", function (e) {
      if (e.target.matches("input,textarea")) return;
      if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
    });
  }

  fetch("content/" + TRACK + ".json").then(function (r) { return r.json(); }).then(function (data) {
    DATA = data;
    document.body.classList.add(data.cls);
    document.title = "Code the Future — " + (data.title || "Lesson") + (TRACK === "kids" ? " (Kids)" : " (Adults)");
    STEPS = flatten(data);
    build();
    var savedRaw = localStorage.getItem(POSKEY);
    hadLocalPos = savedRaw !== null && location.hash !== "#restart";
    var saved = parseInt(savedRaw || "0", 10);
    pos = (location.hash === "#restart" || isNaN(saved) || saved < 0 || saved >= STEPS.length) ? 0 : saved;
    var savedMax = parseInt(localStorage.getItem(MAXKEY) || "0", 10);
    furthest = Math.max(isNaN(savedMax) ? 0 : savedMax, isNaN(saved) ? 0 : Math.max(saved, 0));
    if (furthest >= STEPS.length) furthest = STEPS.length - 1;
    var mn0 = stepMission(STEPS[pos]);
    if (mn0 && isLocked(mn0)) { bootTarget = pos; pos = lastUnlockedIndex(); }
    render();
    maybePetPreview();   // first time into Module 2 → preview the pet rewards
    // Supabase may finish initializing after this script runs:
    if (db()) onDbReady(); else window.addEventListener("ctfdb:ready", onDbReady, { once: true });
  }).catch(function (e) {
    document.getElementById("player").innerHTML = '<div style="padding:40px;font-family:sans-serif">Could not load lesson content. Run <code>node lessons/build.mjs</code> and serve the module folder.</div>';
  });
})();
