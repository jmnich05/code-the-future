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

  function profileName() {
    try { var p = JSON.parse(localStorage.getItem("ctf:profile") || "null"); return (p && p.display_name) || "Explorer"; }
    catch (e) { return "Explorer"; }
  }
  function hasProfile() { try { return !!localStorage.getItem("ctf:profile"); } catch (e) { return false; } }
  function done() { try { return localStorage.getItem(DONE_KEY) === "1"; } catch (e) { return false; } }
  function markDone() { try { localStorage.setItem(DONE_KEY, "1"); } catch (e) {} }

  var NAME = "Explorer";
  function steps() {
    return [
      { center: true, t: "Welcome, " + NAME + "! 👋",
        body: "I'm your guide. Let me show you around — it only takes a few minutes. Ready?",
        cta: "Show me around →" },
      { sel: "#continueTile", t: "Your missions live here 🚀",
        body: "This is where your learning missions are. Each one takes about 10 minutes, and you earn a badge every time you finish one." },
      { sel: "#continueTile", t: "Pick up where you left off ↩️",
        body: "The platform saves your spot for you. Whenever you come back, just tap Continue and you'll start right where you stopped — never lost." },
      { sel: 'a.tile[href="board.html"]', t: "Your cohort board 💬",
        body: "This is your board. Say hi to the other kids in your cohort, share what you make, and ask questions here." },
      { sel: 'a.tile[href="board.html"]', t: "Reach your teachers 🧑‍🏫",
        body: "Need a grown-up? On the board, tap “Ask in Help” to message your teachers, Jon and Kenya. They can always see your messages and they're here to help you." },
      { sel: 'a.tile[href="profile.html"]', t: "This is YOU ⭐",
        body: "Here's your character and your badges. Every mission unlocks new gear — come back here to dress up your character!" },
      { finish: true, t: "You're all set, " + NAME + "! 🎉",
        body: "That's the whole tour. Here's your very first reward — then you can start Mission 1. Let's build the future!" }
    ];
  }

  var ov, spot, bubble, i = 0, STEPS = [], audioOn = true, tts = null;

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
      ".ctf-tour-next{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:1rem;cursor:pointer;color:#fff;border:none;border-radius:999px;padding:11px 22px;background:linear-gradient(120deg,#2A5FF0,#0E9099);}",
      ".ctf-tour-skip{background:none;border:none;cursor:pointer;color:#8A93A8;font:inherit;font-size:.85rem;text-decoration:underline;}",
      ".ctf-tour-reward{text-align:center;}",
      ".ctf-tour-medal{font-size:3.6rem;animation:ctf-pop .7s cubic-bezier(.34,1.56,.64,1) both;}",
      ".ctf-tour-badge{display:inline-block;margin:6px 0 2px;font-family:'Space Grotesk',sans-serif;font-weight:700;color:#0E9099;}",
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
    i = n;
    var st = STEPS[n];
    var narr = st.t.replace(/[\u{1F000}-\u{1FFFF}☀-➿‍️]/gu, "") + ". " + st.body;

    if (st.finish) { finish(st); speak(narr); return; }

    if (st.center || !st.sel) { place(null, st); speak(narr); return; }

    var tgt = document.querySelector(st.sel);
    if (!tgt) { return show(n + 1); }            // element missing → skip gracefully
    tgt.scrollIntoView({ block: "center" });   // instant — so the rect is accurate
    setTimeout(function () { place(tgt.getBoundingClientRect(), st); speak(narr); }, 120);
  }

  function place(rect, st) {
    var total = STEPS.length;
    if (rect) {
      var pad = 8;
      spot.style.display = "block";
      spot.style.left = (rect.left - pad) + "px"; spot.style.top = (rect.top - pad) + "px";
      spot.style.width = (rect.width + pad * 2) + "px"; spot.style.height = (rect.height + pad * 2) + "px";
    } else { spot.style.display = "none"; }

    bubble.className = "ctf-tour-bub" + (rect ? "" : " ctf-center");
    bubble.innerHTML =
      "<h3>" + st.t + "</h3><p>" + st.body + "</p>" +
      '<div class="ctf-tour-row"><span class="ctf-tour-prog">' + (i + 1) + " / " + total + "</span>" +
      '<button class="ctf-tour-mute" title="Sound on/off">' + (audioOn ? "🔊" : "🔇") + "</button>" +
      (i > 0 ? '<button class="ctf-tour-skip" data-act="skip">Skip tour</button>' : "") +
      '<button class="ctf-tour-next" data-act="next">' + (st.cta || "Next →") + "</button></div>";

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
    var skip = bubble.querySelector('[data-act="skip"]'); if (skip) skip.addEventListener("click", end);
    bubble.querySelector(".ctf-tour-mute").addEventListener("click", function () {
      audioOn = !audioOn; if (!audioOn) stopAudio(); this.textContent = audioOn ? "🔊" : "🔇";
    });
  }

  function advance() { stopAudio(); if (i < STEPS.length - 1) show(i + 1); }

  function finish(st) {
    spot.style.display = "none";
    confetti();
    bubble.className = "ctf-tour-bub ctf-center";
    bubble.style.left = ""; bubble.style.top = ""; bubble.style.bottom = ""; bubble.style.transform = "";
    bubble.innerHTML =
      '<div class="ctf-tour-reward"><div class="ctf-tour-medal">🏅</div>' +
      '<div class="ctf-tour-badge">Badge earned: Explorer — Welcome Aboard!</div>' +
      "<h3>" + st.t + "</h3><p>" + st.body + "</p>" +
      '<button class="ctf-tour-next" data-act="go">🚀 Start Mission 1</button></div>';
    bubble.querySelector('[data-act="go"]').addEventListener("click", function () {
      markDone(); end(true);
      var cta = document.querySelector('.cta[href*="player.html"]') || document.querySelector('#continueTile');
      if (cta) location.href = cta.getAttribute("href");
    });
    markDone();
    try { if (window.CTFDB && window.CTFDB.enabled && window.CTFDB.logEvent) window.CTFDB.logEvent("tour_complete", {}); } catch (e) {}
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
  function onKey(e) { if (e.key === "Escape") end(); else if (e.key === "ArrowRight" || e.key === "Enter") advance(); }

  function start() {
    NAME = profileName();
    STEPS = steps();
    css();
    ov = document.createElement("div"); ov.className = "ctf-tour-ov";
    spot = document.createElement("div"); spot.className = "ctf-tour-spot"; spot.style.display = "none";
    bubble = document.createElement("div"); bubble.className = "ctf-tour-bub ctf-center";
    ov.appendChild(spot); ov.appendChild(bubble); document.body.appendChild(ov);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", function () { if (STEPS[i] && STEPS[i].sel) show(i); });
    show(0);
  }

  function maybeStart() {
    if (done() || !hasProfile()) return false;
    // wait a tick so the home tiles have laid out
    setTimeout(start, 400);
    return true;
  }

  window.CTFTour = { start: start, maybeStart: maybeStart, reset: function () { try { localStorage.removeItem(DONE_KEY); } catch (e) {} } };

  // auto-run on the home page once a character exists
  if (/\/platform\/(index\.html)?($|\?|#)/.test(location.pathname + location.search) || /platform\/?$/.test(location.pathname)) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", maybeStart);
    else maybeStart();
  }
})();
