/* ==========================================================================
   Code the Future — shared platform header (window.CTFTopbar)
   One consistent top bar for platform pages: brand logo, nav pills with an
   active state, optional cohort chip + "me" slot (board fills these by id),
   and a breadcrumb row so kids/parents always know where they are.

   Usage (after avatar.js, before page script):
     <script src="lib/topbar.js"></script>
     <script>CTFTopbar.render({ active:"board", crumb:"Cohort Board", cohort:true, me:true });</script>
   ========================================================================== */
(function () {
  var NAV = [
    { key: "home",     label: "Home",     emoji: "🏠", href: "index.html" },
    { key: "missions", label: "Missions", emoji: "🚀", href: "../curriculum/module-01-what-is-ai/lessons/player.html?track=kids" },
    { key: "board",    label: "Board",    emoji: "💬", href: "board.html" },
    { key: "profile",  label: "Profile",  emoji: "⭐", href: "profile.html" }
  ];

  var CSS = "" +
    ".ctf-bar{background:linear-gradient(120deg,#0A1226 20%,#11214A 75%,#0B2D4D);color:#fff;position:relative}" +
    ".ctf-bar::after{content:'';position:absolute;left:0;right:0;bottom:0;height:3px;background:linear-gradient(90deg,#3D74FF,#26C7D1 55%,#FF5A38)}" +
    ".ctf-bar .in{max-width:1200px;margin:0 auto;padding:12px 20px;display:flex;align-items:center;gap:14px;flex-wrap:wrap}" +
    ".ctf-bar .brand{display:flex;align-items:center;gap:10px;font-family:var(--font-display,'Space Grotesk',sans-serif);font-weight:700;font-size:1.15rem;color:#fff;text-decoration:none;white-space:nowrap}" +
    ".ctf-bar .brand img{width:34px;height:34px;display:block;filter:drop-shadow(0 2px 6px rgba(0,0,0,.4))}" +
    ".ctf-bar .brand .accent{color:#26C7D1}" +
    ".ctf-nav{display:flex;gap:6px;margin-left:6px}" +
    ".ctf-nav a{display:inline-flex;align-items:center;gap:7px;color:rgba(255,255,255,.82);text-decoration:none;font-weight:700;font-size:.92rem;border-radius:999px;padding:8px 15px;border:1px solid transparent;transition:background .14s,border-color .14s}" +
    ".ctf-nav a:hover{background:rgba(255,255,255,.10);border-color:rgba(255,255,255,.18)}" +
    ".ctf-nav a.active{background:#fff;color:#0C1322;box-shadow:0 4px 14px rgba(0,0,0,.3)}" +
    ".ctf-bar .right{margin-left:auto;display:flex;align-items:center;gap:10px;font-size:.9rem}" +
    ".ctf-bar .cohort-chip{background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:6px 14px;font-size:.85rem;white-space:nowrap}" +
    ".ctf-bar .right a{color:#CFE0FF;text-decoration:none;font-weight:700}" +
    ".ctf-crumbs{max-width:1200px;margin:0 auto;padding:12px 20px 0;font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-500,#5A6478);display:flex;align-items:center;gap:8px}" +
    ".ctf-crumbs a{color:var(--blue-700,#1D46C2);text-decoration:none;font-weight:600}" +
    ".ctf-crumbs a:hover{text-decoration:underline}" +
    ".ctf-crumbs .sep{color:var(--ink-300,#B9C1D4)}" +
    ".ctf-crumbs b{color:var(--ink-900,#0C1322)}" +
    "@media(max-width:720px){.ctf-nav a span.lbl{display:none}.ctf-nav a{padding:8px 12px}.ctf-bar .right .who-name{display:none}}";

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }

  function render(opts) {
    opts = opts || {};
    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    var nav = NAV.map(function (n) {
      return '<a class="' + (opts.active === n.key ? "active" : "") + '" href="' + n.href + '">' +
        '<span aria-hidden="true">' + n.emoji + '</span><span class="lbl">' + n.label + "</span></a>";
    }).join("");

    var right = "";
    if (opts.cohort) right += '<span class="cohort-chip" id="cohortName">◆ Cohort</span>';
    if (opts.me) right += '<span class="avatar sm" id="meAv" style="width:38px;height:38px"></span><a class="who-name" href="profile.html" id="meName">Me</a>';

    var crumb = "";
    if (opts.crumb) {
      crumb = '<div class="ctf-crumbs"><a href="index.html">🏠 Home</a><span class="sep">›</span><b>' + esc(opts.crumb) + "</b></div>";
    }

    var el = document.createElement("div");
    el.innerHTML =
      '<header class="ctf-bar"><div class="in">' +
        '<a class="brand" href="index.html"><img src="assets/logo-icon-dark.svg" alt="Code the Future logo">Code the <span class="accent">Future</span></a>' +
        '<nav class="ctf-nav" aria-label="Main">' + nav + "</nav>" +
        '<span class="right">' + right + "</span>" +
      "</div></header>" + crumb;
    var ref = document.body.firstChild;
    while (el.firstChild) document.body.insertBefore(el.firstChild, ref);
  }

  window.CTFTopbar = { render: render, NAV: NAV };
})();
