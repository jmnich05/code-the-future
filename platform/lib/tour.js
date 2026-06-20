/* ==========================================================================
   Code the Future — First-run guided tour (window.CTFTour)
   A narrated spotlight walkthrough of the home page the first time a kid lands
   here after building their character. Points at the REAL buttons: missions,
   resume, the board, reaching the teachers, and their character. Finishes with
   a reward, then Mission 1. Self-contained: injects its own styles, narrates
   with /api/tts (graceful if unavailable), and only runs once.
   ========================================================================== */
(function () {
  "use strict";
  var DONE_KEY = "ctf:tour:v1:done";
  var AT_KEY = "ctf:tour:v1:at";   // resume marker (step index) — persists across the home→board hop
  function pageOf(st) { return (st && st.page) || "home"; }
  function currentPage() { return /\/board\.html/.test(location.pathname) ? "board" : "home"; }
  function pageURL(pg) { return pg === "board" ? "board.html" : "index.html"; }
  function atMarker() { try { var v = localStorage.getItem(AT_KEY); return v == null ? null : parseInt(v, 10); } catch (e) { return null; } }
  function setAt(n) { try { localStorage.setItem(AT_KEY, String(n)); } catch (e) {} }
  function clearAt() { try { localStorage.removeItem(AT_KEY); } catch (e) {} }

  function profileName() {
    try { var p = JSON.parse(localStorage.getItem("ctf:profile") || "null"); return (p && p.display_name) || "Explorer"; }
    catch (e) { return "Explorer"; }
  }
  function hasProfile() { try { return !!localStorage.getItem("ctf:profile"); } catch (e) { return false; } }
  function done() { try { return localStorage.getItem(DONE_KEY) === "1"; } catch (e) { return false; } }
  function markDone() { try { localStorage.setItem(DONE_KEY, "1"); } catch (e) {} }

  var NAME = "Explorer";
  // Every step shows (a missing target just centers the card). Selectors list a
  // fallback (the tile OR the nav link) so a step never gets skipped.
  function steps() {
    return [
      { page: "home", center: true, t: "Welcome, " + NAME + "! 👋",
        body: "I'm your guide, and I'm going to show you around your new home. There's no rush — read each step, then tap Continue. Ready to explore?",
        cta: "Show me around →" },
      { page: "home", sel: '#continueTile, a[href="missions.html"]', t: "Your missions live here 🚀",
        body: "This is where your learning missions are. Each one takes about 10 minutes, and you earn a badge for your collection every single time you finish one." },
      { page: "home", sel: "#continueTile", t: "Pick up where you left off ↩️",
        body: "The platform remembers exactly where you stopped. Whenever you come back, just tap Continue and you'll start right where you left off — you can never lose your place." },
      { page: "home", sel: '.me-dock, a.tile[href="profile.html"]', t: "This is YOU 🧑‍🚀",
        body: "Up here is your very own character — that's you on the platform! Tap it any time to change your hair, your colors, and your gear." },
      { page: "home", sel: 'a.tile[href="profile.html"], .me-dock', t: "Earn badges and gear 🏅",
        body: "Every mission you finish earns a badge and unlocks new gear — capes, hats, jetpacks and more. Come back to your character to try them on. Next, let's go see where you talk with your cohort!" },
      // ---- these live on the BOARD page; the tour walks the kid there ----
      { page: "board", sel: '#viewFeed, .composer, #centerPanel', t: "Your message board 💬",
        body: "Here it is — your cohort board, your clubhouse! Type in this box to share the cool things you make with the other kids learning with you." },
      { page: "board", sel: '.panel, #channels', t: "Rooms for your cohort 🤝",
        body: "Over here are your rooms — Announcements, Show & Tell, and a Live Chat that lights up when friends are online. You're never learning alone!" },
      { page: "board", sel: '.teacher-cta, #askJon', t: "How to reach your teacher 🧑‍🏫",
        body: "Need a grown-up? Tap “Ask in Help” to send a message straight to your teachers, Jon and Kenya. They can always see your messages, and they're here whenever you're stuck." },
      { page: "board", finish: true, t: "You're all set, " + NAME + "! 🎉",
        body: "That's the whole tour — you know your way around now. Here's your very first reward, and then you can start Mission 1. Let's build the future!" }
    ];
  }

  var ov, spot, bubble, i = 0, STEPS = [], audioOn = true, tts = null;
  // per-step read-timer: Continue stays "charging" until they've had a moment to
  // read (content-proportional), so kids can't blast through. No skip button.
  var dwellReady = true, dwellTimer = null;
  var DWELL_PER_WORD = 170, DWELL_FLOOR = 3500, DWELL_CAP = 9000;

  function css() {
    if (document.getElementById("ctf-tour-css")) return;
    var s = document.createElement("style"); s.id = "ctf-tour-css";
    s.textContent = [
      ".ctf-tour-ov{position:fixed;inset:0;z-index:9000;}",
      ".ctf-tour-spot{position:fixed;border-radius:18px;box-shadow:0 0 0 9999px rgba(7,12,26,.72);transition:all .35s cubic-bezier(.22,1,.36,1);pointer-events:none;border:3px solid #26C7D1;}",
      ".ctf-tour-bub{position:fixed;z-index:9002;max-width:340px;background:#fff;color:#0C1322;border-radius:18px;box-shadow:0 18px 50px rgba(7,12,26,.4);padding:18px 20px;transition:all .3s cubic-bezier(.22,1,.36,1);font-family:'Plus Jakarta Sans',system-ui,sans-serif;}",
      ".ctf-tour-bub.ctf-center{left:50%;top:50%;transform:translate(-50%,-50%);max-width:420px;max-height:calc(100vh - 24px);overflow:auto;text-align:center;}",
      ".ctf-tour-bub h3{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:1.3rem;margin:0 0 6px;}",
      ".ctf-tour-bub p{font-size:1.02rem;line-height:1.5;margin:0 0 14px;color:#2A3349;}",
      ".ctf-tour-row{display:flex;align-items:center;gap:10px;}",
      ".ctf-tour-prog{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.1em;color:#8A93A8;}",
      ".ctf-tour-mute{margin-left:auto;background:none;border:none;cursor:pointer;font-size:1.1rem;opacity:.7;}",
      ".ctf-tour-next{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:1rem;cursor:pointer;color:#fff;border:none;border-radius:999px;padding:11px 22px;background:linear-gradient(120deg,#2A5FF0,#0E9099);position:relative;overflow:hidden;}",
      ".ctf-tour-next.charging{filter:saturate(.85) brightness(.9);cursor:default;}",
      ".ctf-tour-next.charging::after{content:'';position:absolute;left:0;bottom:0;height:4px;width:0;background:rgba(255,255,255,.92);border-radius:2px;animation:ctf-charge var(--charge,4000ms) linear forwards;}",
      "@keyframes ctf-charge{to{width:100%;}}",
      ".ctf-tour-next.ready{animation:ctf-nextpop .32s cubic-bezier(.34,1.56,.64,1);}",
      "@keyframes ctf-nextpop{0%{transform:scale(1);}45%{transform:scale(1.07);}100%{transform:scale(1);}}",
      ".ctf-tour-next.nudge{animation:ctf-nudge .4s;}",
      "@keyframes ctf-nudge{0%,100%{transform:translateX(0);}25%{transform:translateX(-5px);}75%{transform:translateX(5px);}}",
      ".ctf-tour-reward{text-align:center;}",
      ".ctf-tour-medal{font-size:3.6rem;animation:ctf-pop .7s cubic-bezier(.34,1.56,.64,1) both;}",
      ".ctf-tour-badge{display:inline-block;margin:6px 0 2px;font-family:'Space Grotesk',sans-serif;font-weight:700;color:#0E9099;}",
      ".ctf-tour-gift{font-size:.92rem;color:#2A3349;background:#FFF7E6;border:1px solid #FFC74D;border-radius:12px;padding:8px 12px;margin:6px auto 12px;max-width:90%;}",
      "@keyframes ctf-pop{0%{opacity:0;transform:scale(.3) rotate(-15deg);}70%{transform:scale(1.1) rotate(4deg);}100%{opacity:1;transform:scale(1);}}",
      ".ctf-tour-confetti{position:fixed;inset:0;z-index:9001;pointer-events:none;overflow:hidden;}",
      ".ctf-tour-confetti i{position:absolute;top:-20px;width:9px;height:9px;animation:ctf-fall linear both;}",
      "@keyframes ctf-fall{to{transform:translateY(105vh) rotate(720deg);opacity:.7;}}",
      ".ctf-pulse{animation:ctf-pulse 1.4s ease-in-out infinite;}",
      "@keyframes ctf-pulse{0%,100%{box-shadow:0 0 0 0 rgba(38,199,209,.5);}50%{box-shadow:0 0 0 12px rgba(38,199,209,0);}}",
      "@media(prefers-reduced-motion:reduce){.ctf-tour-spot,.ctf-tour-bub{transition:none;}.ctf-tour-medal{animation:none;}}"
    ].join("");
    document.head.appendChild(s);
  }

  function speak(text) {
    stopAudio();
    if (!audioOn) return;
    fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text }) })
      .then(function (r) { return r.ok ? r.blob() : null; })
      .then(function (b) { if (!b || !audioOn) return; tts = new Audio(URL.createObjectURL(b)); tts.play().catch(function () {}); })
      .catch(function () {});
  }
  function stopAudio() { if (tts) { try { tts.pause(); } catch (e) {} tts = null; } }

  function show(n) {
    i = n; setAt(n);   // persist progress so a reload (or the page hop) resumes here
    var st = STEPS[n];
    var narr = st.t.replace(/[\u{1F000}-\u{1FFFF}☀-➿‍️]/gu, "") + ". " + st.body;

    if (st.finish) { finish(st); speak(narr); return; }

    if (st.center || !st.sel) { place(null, st); speak(narr); return; }

    var tgt = document.querySelector(st.sel);
    if (!tgt) { place(null, st); speak(narr); return; }   // NEVER skip — show centered
    tgt.scrollIntoView({ block: "center" });   // instant — so the rect is accurate
    setTimeout(function () {
      var r = tgt.getBoundingClientRect();
      if (!r.width || !r.height) { place(null, st); speak(narr); return; }   // hidden target → center
      place(r, st); speak(narr);
    }, 120);
  }

  function place(rect, st) {
    var total = STEPS.length;
    if (rect) {
      var pad = 8;
      spot.style.display = "block";
      spot.style.left = (rect.left - pad) + "px"; spot.style.top = (rect.top - pad) + "px";
      spot.style.width = (rect.width + pad * 2) + "px"; spot.style.height = (rect.height + pad * 2) + "px";
    } else { spot.style.display = "none"; }

    var nxt = STEPS[i + 1];
    var crossing = nxt && !st.finish && pageOf(nxt) !== pageOf(st);
    var nextLabel = st.cta || (crossing ? "Take me there →" : "Continue →");

    bubble.className = "ctf-tour-bub" + (rect ? "" : " ctf-center");
    bubble.innerHTML =
      "<h3>" + st.t + "</h3><p>" + st.body + "</p>" +
      '<div class="ctf-tour-row"><span class="ctf-tour-prog">' + (i + 1) + " / " + total + "</span>" +
      '<button class="ctf-tour-mute" title="Sound on/off">' + (audioOn ? "🔊" : "🔇") + "</button>" +
      '<button class="ctf-tour-next" data-act="next">' + nextLabel + "</button></div>";

    if (rect) {
      // measure the rendered bubble, then place below / above / clamped so it's
      // ALWAYS fully on-screen (short viewports included)
      bubble.style.transform = "none"; bubble.style.bottom = "auto";
      var vh = window.innerHeight, vw = window.innerWidth, gap = 14;
      var bw = bubble.offsetWidth || 340, bh = bubble.offsetHeight || 170;
      var left = Math.min(Math.max(12, rect.left), vw - bw - 12);
      var top;
      if (rect.bottom + gap + bh <= vh - 8) top = rect.bottom + gap;          // below
      else if (rect.top - gap - bh >= 8) top = rect.top - gap - bh;           // above
      else top = Math.max(12, Math.min(vh - bh - 12, (vh - bh) / 2));         // clamp
      bubble.style.left = left + "px"; bubble.style.top = top + "px";
    } else {
      // centered card — clear any inline positioning so .ctf-center governs
      bubble.style.left = ""; bubble.style.top = ""; bubble.style.bottom = ""; bubble.style.transform = "";
    }

    bubble.querySelector('[data-act="next"]').addEventListener("click", advance);
    bubble.querySelector(".ctf-tour-mute").addEventListener("click", function () {
      audioOn = !audioOn; if (!audioOn) stopAudio(); this.textContent = audioOn ? "🔊" : "🔇";
    });
    setupDwell(st);
  }

  // start the read-timer: Continue charges up over a content-proportional dwell,
  // then becomes clickable. Tapping early just nudges (it won't advance).
  function setupDwell(st) {
    clearTimeout(dwellTimer);
    var btn = bubble.querySelector(".ctf-tour-next");
    if (!btn) { dwellReady = true; return; }
    btn.classList.remove("charging", "ready");
    var words = String(st.body || "").trim().split(/\s+/).filter(Boolean).length;
    var ms = Math.min(DWELL_CAP, Math.max(DWELL_FLOOR, words * DWELL_PER_WORD));
    dwellReady = false;
    btn.style.setProperty("--charge", ms + "ms");
    btn.classList.add("charging");
    dwellTimer = setTimeout(function () {
      dwellReady = true; btn.classList.remove("charging"); btn.classList.add("ready");
    }, ms);
  }
  function nudgeNext() {
    var btn = bubble.querySelector(".ctf-tour-next"); if (!btn) return;
    btn.classList.remove("nudge"); void btn.offsetWidth; btn.classList.add("nudge");
  }

  function advance() {
    if (!dwellReady) { nudgeNext(); return; }   // still reading — can't skip ahead
    stopAudio();
    if (i >= STEPS.length - 1) return;
    var next = i + 1, nst = STEPS[next];
    if (pageOf(nst) !== currentPage()) {   // the next stop lives on another page — take them there
      setAt(next);
      location.href = pageURL(pageOf(nst));
      return;
    }
    show(next);
  }

  function finish(st) {
    spot.style.display = "none";
    confetti();
    grantReward();
    bubble.className = "ctf-tour-bub ctf-center";
    bubble.style.left = ""; bubble.style.top = ""; bubble.style.bottom = ""; bubble.style.transform = "";
    bubble.innerHTML =
      '<div class="ctf-tour-reward"><div class="ctf-tour-medal">🏅</div>' +
      '<div class="ctf-tour-badge">Badge earned: Explorer — Welcome Aboard!</div>' +
      "<h3>" + st.t + "</h3><p>" + st.body + "</p>" +
      '<p class="ctf-tour-gift">🎁 You unlocked the <b>⭐ Star Pin</b> — try it on your character in <b>Profile</b>!</p>' +
      '<button class="ctf-tour-next" data-act="go">🚀 Start Mission 1</button></div>';
    bubble.querySelector('[data-act="go"]').addEventListener("click", function () {
      clearAt(); end(true);
      var cta = document.querySelector('.cta[href*="player.html"], #continueTile');
      location.href = cta ? cta.getAttribute("href") : "../curriculum/module-01-what-is-ai/lessons/player.html?track=kids";
    });
  }

  // real, persisted reward: a Welcome badge (counts on the home) that also
  // unlocks the ⭐ Star Pin accessory (see avatar.js unlockedFromBadges).
  function grantReward() {
    markDone();
    try {
      if (window.CTFDB && window.CTFDB.enabled) {
        if (window.CTFDB.awardBadge) window.CTFDB.awardBadge("kids-welcome", { module: "platform", track: "kids" });
        if (window.CTFDB.logEvent) window.CTFDB.logEvent("tour_complete", {});
      }
    } catch (e) {}
  }

  function confetti() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var c = document.createElement("div"); c.className = "ctf-tour-confetti";
    var cols = ["#3D74FF", "#26C7D1", "#FF5A38", "#FFB320", "#7C5CFF", "#2FBF71"];
    for (var k = 0; k < 40; k++) {
      var p = document.createElement("i");
      p.style.left = (Math.random() * 100) + "%";
      p.style.background = cols[k % cols.length];
      p.style.animationDelay = (Math.random() * .6) + "s";
      p.style.animationDuration = (1.6 + Math.random() * 1.3) + "s";
      if (k % 3 === 0) p.style.borderRadius = "50%";
      c.appendChild(p);
    }
    document.body.appendChild(c);
    setTimeout(function () { if (c.parentNode) c.parentNode.removeChild(c); }, 3600);
  }

  function end(keep) {
    stopAudio();
    markDone();
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    document.removeEventListener("keydown", onKey);
    if (!keep) {
      // leave a gentle nudge: pulse the Start Mission 1 button
      var cta = document.querySelector('.cta[href*="player.html"]');
      if (cta) { cta.classList.add("ctf-pulse"); setTimeout(function () { cta.classList.remove("ctf-pulse"); }, 6000); }
    }
  }
  function onKey(e) { if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); advance(); } }

  function startAt(n) {
    NAME = profileName();
    STEPS = steps();
    css();
    if (!ov || !ov.parentNode) {
      ov = document.createElement("div"); ov.className = "ctf-tour-ov";
      spot = document.createElement("div"); spot.className = "ctf-tour-spot"; spot.style.display = "none";
      bubble = document.createElement("div"); bubble.className = "ctf-tour-bub ctf-center";
      ov.appendChild(spot); ov.appendChild(bubble); document.body.appendChild(ov);
      document.addEventListener("keydown", onKey);
      window.addEventListener("resize", function () { if (STEPS[i] && STEPS[i].sel) show(i); });
    }
    show(n);
  }
  function start() { clearAt(); startAt(0); }   // fresh run from the top (used by the replay link)

  // Decide whether to auto-run/resume on this page. Progress is persisted on every
  // step (setAt), so this resumes correctly after the home→board hop or a reload.
  function maybeStart() {
    if (done() || !hasProfile()) return false;
    NAME = profileName(); STEPS = steps();
    var at = atMarker();
    if (at == null) {
      // never started: first-run only kicks off on the home page
      if (currentPage() === "home") { setTimeout(function () { startAt(0); }, 400); return true; }
      return false;
    }
    if (!STEPS[at]) { clearAt(); return false; }
    if (pageOf(STEPS[at]) === currentPage()) { setTimeout(function () { startAt(at); }, 350); return true; }
    location.replace(pageURL(pageOf(STEPS[at])));   // mid-tour but on the wrong page — go resume it
    return true;
  }

  // bind any "Replay the tour" link (#replayTour) — works even after the
  // one-time auto-run has been used up
  function bindReplay() {
    var rt = document.getElementById("replayTour");
    if (rt && !rt._ctfBound) {
      rt._ctfBound = 1;
      rt.addEventListener("click", function (e) {
        e.preventDefault();
        if (document.querySelector(".ctf-tour-ov")) return;   // already running
        try { localStorage.removeItem(DONE_KEY); } catch (e2) {}
        start();
      });
    }
  }
  function init() { bindReplay(); maybeStart(); }

  window.CTFTour = { start: start, maybeStart: maybeStart, reset: function () { try { localStorage.removeItem(DONE_KEY); } catch (e) {} clearAt(); } };

  // auto-run on the home page (first run) and resume on the board page (mid-tour)
  if (/\/platform\/(index|board)\.html/.test(location.pathname) ||
      /\/platform\/($|\?|#)/.test(location.pathname + location.search) ||
      /platform\/?$/.test(location.pathname)) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }
})();
