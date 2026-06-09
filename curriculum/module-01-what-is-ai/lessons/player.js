/* ==========================================================================
   Code the Future — Lesson PLAYER engine
   Renders one beat per screen. Words trickle in. Tap / Space / → to continue.
   Loads lessons/content/<track>.json (track from ?track=kids|adults).
   ========================================================================== */
(function () {
  "use strict";
  var qs = new URLSearchParams(location.search);
  var TRACK = qs.get("track") === "adults" ? "adults" : "kids";
  var POSKEY = "ctf:pos:" + TRACK;

  var MODULE = "module-01-what-is-ai";
  var stage, label, fill, backBtn, nextBtn, hint;
  var DATA, STEPS = [], pos = 0, animating = false, revealTimer = null, hadLocalPos = false;

  // ---- Supabase sync (optional; no-ops if CTFDB unconfigured) -------------
  function db() { return (window.CTFDB && window.CTFDB.enabled) ? window.CTFDB : null; }
  function cloudSaveProgress() { var d = db(); if (d) d.saveProgress(MODULE, TRACK, pos, pos >= STEPS.length - 1); }
  function onDbReady() {
    var d = db(); if (!d) return;
    if (!hadLocalPos) {
      d.getProgress(MODULE, TRACK).then(function (rp) {
        if (rp && typeof rp.position === "number" && rp.position > pos && rp.position < STEPS.length) { pos = rp.position; render(); }
        cloudSaveProgress();
      });
    } else { cloudSaveProgress(); }
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
        beat.innerHTML = '<div class="wrap">' + step.b.html + "</div>";
        var dd = db();
        if (dd && step.m && step.m.n) { dd.awardBadge(TRACK + "-m" + step.m.n, { module: MODULE, track: TRACK }); dd.logEvent("mission_complete", { module: MODULE, track: TRACK, n: step.m.n }); }
      } else if (type === "capstone") {
        beat.innerHTML = '<div class="inner">' + step.b.html + "</div>";
        var dc = db(); if (dc) dc.awardBadge(TRACK + "-" + MODULE + "-complete", { module: MODULE, track: TRACK });
      } else beat.innerHTML = step.b.html;
    }

    stage.innerHTML = "";
    stage.appendChild(beat);
    stage.scrollTop = 0;

    if (type === "widget" && window.CTFWidgets) window.CTFWidgets.init(stage);

    var dur = applyReveal(beat, type);
    animating = true; clearTimeout(revealTimer);
    revealTimer = setTimeout(function () { animating = false; syncControls(); }, dur);

    save();
    syncControls();
  }

  function syncControls() {
    var step = STEPS[pos], atEnd = pos >= STEPS.length - 1;
    var m = step.m;
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
    }
    hint.textContent = animating ? "tap to reveal" : (step.kind === "title" ? "tap anywhere to begin" : "");
  }

  function next() {
    if (animating) { finishReveal(); return; }
    if (pos < STEPS.length - 1) { pos++; render(); }
  }
  function prev() { if (pos > 0) { pos--; render(); finishReveal(); } }

  function save() { try { localStorage.setItem(POSKEY, String(pos)); } catch (e) {} cloudSaveProgress(); }
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
      '<div class="p-top"><a class="p-exit" href="index.html">✕ Exit</a><span class="p-label" id="pLabel"></span><span class="p-track"><i id="pFill"></i></span></div>' +
      '<div class="p-stage" id="pStage"></div>' +
      '<div class="p-bottom"><button class="p-back" id="pBack">‹ Back</button><span class="p-hint" id="pHint"></span><button class="p-next" id="pNext">Continue →</button></div>';
    stage = document.getElementById("pStage");
    label = document.getElementById("pLabel");
    fill = document.getElementById("pFill");
    backBtn = document.getElementById("pBack");
    nextBtn = document.getElementById("pNext");
    hint = document.getElementById("pHint");

    nextBtn.addEventListener("click", next);
    backBtn.addEventListener("click", prev);
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
    document.title = "Code the Future — " + (TRACK === "kids" ? "What Is AI? (Kids)" : "What Is AI? (Adults)");
    STEPS = flatten(data);
    build();
    var savedRaw = localStorage.getItem(POSKEY);
    hadLocalPos = savedRaw !== null && location.hash !== "#restart";
    var saved = parseInt(savedRaw || "0", 10);
    pos = (location.hash === "#restart" || isNaN(saved) || saved < 0 || saved >= STEPS.length) ? 0 : saved;
    render();
    // Supabase may finish initializing after this script runs:
    if (db()) onDbReady(); else window.addEventListener("ctfdb:ready", onDbReady, { once: true });
  }).catch(function (e) {
    document.getElementById("player").innerHTML = '<div style="padding:40px;font-family:sans-serif">Could not load lesson content. Run <code>node lessons/build.mjs</code> and serve the module folder.</div>';
  });
})();
