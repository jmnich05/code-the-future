/* ==========================================================================
   Code the Future — badge medallions (window.CTFBadge)
   Original SVG medals: scalloped gradient ring, night core, star + mission
   number. Used by the lesson player (earn moment) and the profile (badge case).
   ========================================================================== */
(function () {
  var KIDS_NAMES = [
    "Future Builder", "AI Spotter", "Pattern Finder", "Brain Trainer",
    "Pixel Detective", "Word Wizard", "Attention Ace", "Neuron Navigator",
    "Time Traveler", "Smart Boss", "Future Maker", "AI Explorer — Level 1"
  ];
  // Module 2 — "AI and Our World" badge names (keys: kids-mod2-N)
  var KIDS_NAMES_M2 = [
    "Returning Builder", "World Spotter", "Healer's Helper", "Planet Protector",
    "Team Captain", "Wise Builder", "Privacy Guard", "Fair Player",
    "Freedom Keeper", "Rule Maker", "World Builder", "AI Explorer — Level 2"
  ];
  // Module 3 — "How Coding Got Done" badge names (keys: kids-mod3-N)
  var KIDS_NAMES_M3 = [
    "Code Cadet", "Language Linker", "Line Writer", "Bug Hunter",
    "Toolsmith", "Time Traveler", "Prompt Pilot", "Agent Ace",
    "Team Director", "Chief of Taste", "Real Builder", "Future Coder"
  ];
  var COLORS = [
    ["#3D74FF", "#26C7D1"], ["#26C7D1", "#2FBF71"], ["#FF5A38", "#FFB320"],
    ["#7C5CFF", "#3D74FF"], ["#12B2BC", "#7C5CFF"], ["#FFB320", "#FF6FB5"],
    ["#3D74FF", "#FF5A38"], ["#2FBF71", "#26C7D1"], ["#FF6FB5", "#7C5CFF"],
    ["#FFB320", "#3D74FF"], ["#26C7D1", "#FF5A38"], ["#FFB320", "#FFD980"]
  ];

  function scallops(cx, cy, r, n) {
    var out = "";
    for (var i = 0; i < n; i++) {
      var a = (Math.PI * 2 / n) * i;
      out += '<circle cx="' + (cx + r * Math.cos(a)).toFixed(1) + '" cy="' + (cy + r * Math.sin(a)).toFixed(1) + '" r="11"/>';
    }
    return out;
  }
  function star(cx, cy, r) {
    var p = "";
    for (var i = 0; i < 10; i++) {
      var a = Math.PI / 5 * i - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
      p += (i ? "L" : "M") + (cx + rr * Math.cos(a)).toFixed(1) + " " + (cy + rr * Math.sin(a)).toFixed(1);
    }
    return '<path d="' + p + 'Z" fill="#FFB320"/>';
  }

  // Generated badge artwork (gpt-image-1, committed PNGs); SVG is the fallback.
  var ART_BASE = "/platform/assets/badges/badge-";

  // n = mission number 1..12 — returns art <img> with hidden SVG fallback
  function render(n, opts) {
    return '<span class="ctf-badge-svg" style="display:block;position:relative">' +
      '<img src="' + ART_BASE + n + '.png" alt="" loading="lazy" ' +
      'style="display:block;width:100%;height:100%;object-fit:contain" ' +
      'onerror="this.style.display=\'none\';this.parentNode.querySelector(\'svg\').style.display=\'block\'">' +
      renderSvg(n, { hidden: true }) + '</span>';
  }

  // n = mission number 1..12 (12 = module finale, gets the trophy treatment)
  function renderSvg(n, opts) {
    opts = opts || {};
    var c = COLORS[(n - 1) % COLORS.length];
    var gid = "bg" + n + Math.floor(Math.random() * 1e5);
    var finale = n === 12;
    return '<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="badge"' +
      (opts.hidden ? ' style="display:none;width:100%;height:100%"' : ' class="ctf-badge-svg"') + '>' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="1" x2="1" y2="0">' +
      '<stop offset="0" stop-color="' + c[0] + '"/><stop offset="1" stop-color="' + c[1] + '"/></linearGradient></defs>' +
      '<g fill="url(#' + gid + ')">' + scallops(100, 100, 86, 12) + '<circle cx="100" cy="100" r="86"/></g>' +
      '<circle cx="100" cy="100" r="70" fill="#0F1B3A"/>' +
      '<circle cx="100" cy="100" r="70" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="3"/>' +
      (finale
        ? star(100, 84, 34) + '<text x="100" y="142" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-weight="700" font-size="26" fill="#fff">12/12</text>'
        : star(100, 88, 30) + '<text x="100" y="146" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-weight="700" font-size="30" fill="#fff">M' + n + '</text>') +
      '</svg>';
  }

  function nameFor(key) {
    key = String(key || "");
    var m3 = key.match(/-mod3-(\d+)$/);
    if (m3) return KIDS_NAMES_M3[parseInt(m3[1], 10) - 1] || ("Mission " + m3[1]);
    var m2 = key.match(/-mod2-(\d+)$/);
    if (m2) return KIDS_NAMES_M2[parseInt(m2[1], 10) - 1] || ("Mission " + m2[1]);
    var m = key.match(/-m(\d+)$/);
    if (m) return KIDS_NAMES[parseInt(m[1], 10) - 1] || ("Mission " + m[1]);
    if (/module-03[\w-]*-complete$/.test(key)) return "Module 3 Complete";
    if (/module-02[\w-]*-complete$/.test(key)) return "Module 2 Complete";
    if (/complete$/.test(key)) return "Module 1 Complete";
    return key;
  }
  function numFor(key) {
    key = String(key || "");
    var m3 = key.match(/-mod3-(\d+)$/); if (m3) return parseInt(m3[1], 10);
    var m2 = key.match(/-mod2-(\d+)$/); if (m2) return parseInt(m2[1], 10);
    var m = key.match(/-m(\d+)$/);      if (m)  return parseInt(m[1], 10);
    if (/complete$/.test(key)) return 12;
    return 1;
  }
  // which art set a badge key belongs to ("mod3-"/"mod2-" → that module's art, "" → Module 1)
  function setFor(key) {
    key = String(key || "");
    if (/-mod3-\d+$|module-03[\w-]*-complete$/.test(key)) return "mod3-";
    if (/-mod2-\d+$|module-02[\w-]*-complete$/.test(key)) return "mod2-";
    return "";
  }
  // module-aware art <img> (with hidden SVG fallback) for a badge KEY
  function renderKey(key) {
    var n = numFor(key), set = setFor(key);
    return '<span class="ctf-badge-svg" style="display:block;position:relative">' +
      '<img src="' + ART_BASE + set + n + '.png" alt="" loading="lazy" ' +
      'style="display:block;width:100%;height:100%;object-fit:contain" ' +
      'onerror="this.style.display=\'none\';this.parentNode.querySelector(\'svg\').style.display=\'block\'">' +
      renderSvg(n, { hidden: true }) + '</span>';
  }

  window.CTFBadge = { render: render, renderKey: renderKey, renderSvg: renderSvg, nameFor: nameFor, numFor: numFor, setFor: setFor, NAMES: KIDS_NAMES, NAMES_M2: KIDS_NAMES_M2, NAMES_M3: KIDS_NAMES_M3 };
})();
