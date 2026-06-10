/* ==========================================================================
   Code the Future — composable avatar (window.CTFAvatar)
   A friendly "buddy" built from swappable parts (background, color, face,
   accessory). Original vector art, saved as JSON in profiles.avatar.

   v2: structured for CSS animation (.av-all bob, .av-eyes blink — styles in
   app.css) + 12 unlockable reward accessories (one per Module 1 mission).
   ========================================================================== */
(function () {
  var COLORS = { blue: "#3D74FF", teal: "#26C7D1", coral: "#FF5A38", amber: "#FFB320", violet: "#7C5CFF", green: "#2FBF71", pink: "#FF6FB5", ink: "#2A3349" };
  var BG = { sky: "#EAF1FF", mint: "#E4FBFC", peach: "#FFF0EC", sun: "#FFF7E6", lilac: "#EFEAFF", night: "#0F1B3A" };
  var FACES = ["happy", "wink", "cool", "surprised", "star"];
  var INK = "#0C1322";

  // base accessories (free) + mission rewards (unlocked by badges)
  var BASE_ACCS = ["none", "cap", "glasses", "headphones", "bow", "crown"];
  var REWARDS = {
    1:  { key: "cape",      label: "Hero Cape",        emoji: "🦸" },
    2:  { key: "antenna",   label: "Robo Antenna",     emoji: "🤖" },
    3:  { key: "wizard",    label: "Wizard Hat",       emoji: "🧙" },
    4:  { key: "headband",  label: "Trainer Headband", emoji: "💪" },
    5:  { key: "detective", label: "Detective Hat",    emoji: "🕵️" },
    6:  { key: "sparkles",  label: "Magic Sparkles",   emoji: "✨" },
    7:  { key: "starpin",   label: "Star Pin",         emoji: "⭐" },
    8:  { key: "halo",      label: "Glow Halo",        emoji: "😇" },
    9:  { key: "propeller", label: "Time-Spinner Cap", emoji: "🚁" },
    10: { key: "visor",     label: "Boss Visor",       emoji: "😎" },
    11: { key: "jetpack",   label: "Jetpack",          emoji: "🚀" },
    12: { key: "laurel",    label: "Champion Laurel",  emoji: "🏆" }
  };
  var REWARD_KEYS = Object.keys(REWARDS).map(function (n) { return REWARDS[n].key; });
  var ACCS = BASE_ACCS.concat(REWARD_KEYS);
  var BEHIND = { cape: 1, jetpack: 1 };   // drawn behind the body

  function eyes(lx, ly, rx, ry, pr) {
    return '<circle cx="' + lx + '" cy="' + ly + '" r="18" fill="#fff"/><circle cx="' + rx + '" cy="' + ry + '" r="18" fill="#fff"/>' +
      '<circle cx="' + (lx + 2) + '" cy="' + (ly + 3) + '" r="' + pr + '" fill="' + INK + '"/><circle cx="' + (rx + 2) + '" cy="' + (ry + 3) + '" r="' + pr + '" fill="' + INK + '"/>';
  }
  function star(cx, cy, r, fill) {
    var p = "";
    for (var i = 0; i < 10; i++) { var a = Math.PI / 5 * i - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; p += (i ? "L" : "M") + (cx + rr * Math.cos(a)).toFixed(1) + " " + (cy + rr * Math.sin(a)).toFixed(1); }
    return '<path d="' + p + 'Z" fill="' + (fill || INK) + '"/>';
  }

  // face split into {eyes, mouth} so only the eyes blink
  function face(f) {
    switch (f) {
      case "wink":
        return { eyes: '<circle cx="100" cy="118" r="18" fill="#fff"/><circle cx="102" cy="121" r="8" fill="' + INK + '"/><path d="M132 118 h16" stroke="' + INK + '" stroke-width="6" stroke-linecap="round"/>',
                 mouth: '<path d="M101 150 q20 22 40 0" stroke="' + INK + '" stroke-width="6" fill="none" stroke-linecap="round"/>' };
      case "cool":
        return { eyes: '<rect x="84" y="112" width="32" height="12" rx="6" fill="#fff"/><rect x="124" y="112" width="32" height="12" rx="6" fill="#fff"/>',
                 mouth: '<path d="M104 150 h32" stroke="' + INK + '" stroke-width="6" stroke-linecap="round"/>' };
      case "surprised":
        return { eyes: eyes(100, 116, 140, 116, 9), mouth: '<circle cx="120" cy="154" r="11" fill="' + INK + '"/>' };
      case "star":
        return { eyes: '<g fill="' + INK + '">' + star(100, 118, 17) + star(140, 118, 17) + '</g>',
                 mouth: '<path d="M98 148 q22 26 44 0 q-22 10 -44 0z" fill="' + INK + '"/>' };
      default:
        return { eyes: eyes(100, 118, 140, 118, 8), mouth: '<path d="M100 150 q20 24 40 0" stroke="' + INK + '" stroke-width="6" fill="none" stroke-linecap="round"/>' };
    }
  }

  function acc(a, c) {
    switch (a) {
      // ---- base set ----
      case "cap":
        return '<path d="M60 86 q60 -58 120 0z" fill="' + c + '"/><path d="M52 86 h80 a8 8 0 0 1 0 16 h-80z" fill="' + c + '"/><circle cx="120" cy="40" r="7" fill="#fff"/>';
      case "glasses":
        return '<g fill="none" stroke="' + INK + '" stroke-width="6"><circle cx="100" cy="118" r="22"/><circle cx="140" cy="118" r="22"/></g><path d="M78 116 h-14 M162 116 h14" stroke="' + INK + '" stroke-width="6" stroke-linecap="round"/>';
      case "headphones":
        return '<path d="M58 120 a62 62 0 0 1 124 0" fill="none" stroke="' + c + '" stroke-width="11" stroke-linecap="round"/><rect x="48" y="112" width="22" height="40" rx="10" fill="' + c + '"/><rect x="170" y="112" width="22" height="40" rx="10" fill="' + c + '"/>';
      case "bow":
        return '<g fill="' + c + '"><path d="M120 52 l-30 -16 v32z"/><path d="M120 52 l30 -16 v32z"/><circle cx="120" cy="52" r="10"/></g>';
      case "crown":
        return '<path d="M78 60 l10 -30 18 22 14 -28 14 28 18 -22 10 30z" fill="' + c + '"/><circle cx="120" cy="34" r="5" fill="#fff"/>';
      // ---- mission rewards ----
      case "cape":
        return '<path d="M52 130 q-18 60 14 92 q26 -12 38 -34z" fill="#FF5A38"/><path d="M188 130 q18 60 -14 92 q-26 -12 -38 -34z" fill="#FF5A38"/><path d="M58 122 q62 -34 124 0 l-8 14 q-54 -28 -108 0z" fill="#E8401F"/>';
      case "antenna":
        return '<path d="M120 44 v-22" stroke="' + INK + '" stroke-width="7" stroke-linecap="round"/><circle cx="120" cy="16" r="10" fill="#26C7D1"/><circle cx="120" cy="16" r="16" fill="#26C7D1" opacity=".25"/>';
      case "wizard":
        return '<path d="M120 -2 l34 74 h-68z" fill="#7C5CFF"/><path d="M78 70 h84 a8 8 0 0 1 0 16 h-84 a8 8 0 0 1 0 -16z" fill="#5b3fd6"/>' + star(120, 42, 10, "#FFB320");
      case "headband":
        return '<path d="M62 96 q58 -26 116 0 l-3 14 q-55 -24 -110 0z" fill="#FF5A38"/><rect x="104" y="84" width="32" height="10" rx="5" fill="#FFB320"/>';
      case "detective":
        return '<path d="M70 78 q50 -44 100 0 l8 4 q-58 -16 -116 0z" fill="#8a6a4b"/><path d="M84 78 q36 -30 72 0 v-18 q-36 -26 -72 0z" fill="#a8835d"/><path d="M84 66 h72 v8 h-72z" fill="#6e5238"/>';
      case "sparkles":
        return '<g fill="#FFB320">' + star(56, 60, 9) + star(186, 78, 7) + star(166, 34, 10) + '</g><g fill="#26C7D1">' + star(74, 30, 7) + star(196, 130, 6) + '</g>';
      case "starpin":
        return star(78, 176, 16, "#FFB320") + '<circle cx="78" cy="176" r="22" fill="none" stroke="#fff" stroke-width="4"/>';
      case "halo":
        return '<ellipse cx="120" cy="22" rx="42" ry="12" fill="none" stroke="#FFB320" stroke-width="8"/><ellipse cx="120" cy="22" rx="42" ry="12" fill="none" stroke="#FFD980" stroke-width="3"/>';
      case "propeller":
        return '<path d="M120 34 v-12" stroke="' + INK + '" stroke-width="6"/><ellipse cx="92" cy="18" rx="26" ry="9" fill="#FF5A38"/><ellipse cx="148" cy="18" rx="26" ry="9" fill="#26C7D1"/><circle cx="120" cy="18" r="8" fill="#FFB320"/>';
      case "visor":
        return '<path d="M76 106 h88 a12 12 0 0 1 12 12 v6 a12 12 0 0 1 -12 12 h-88 a12 12 0 0 1 -12 -12 v-6 a12 12 0 0 1 12 -12z" fill="#0F1B3A"/><rect x="82" y="112" width="76" height="14" rx="7" fill="#26C7D1" opacity=".85"/>';
      case "jetpack":
        return '<rect x="30" y="120" width="26" height="56" rx="12" fill="#8A93A8"/><rect x="184" y="120" width="26" height="56" rx="12" fill="#8A93A8"/><path d="M38 178 l8 18 8 -18z" fill="#FFB320"/><path d="M192 178 l8 18 8 -18z" fill="#FFB320"/>';
      case "laurel":
        return '<g fill="#FFB320"><path d="M58 96 q-16 36 6 66 l10 -8 q-16 -24 -4 -52z"/><path d="M182 96 q16 36 -6 66 l-10 -8 q16 -24 4 -52z"/></g>' + star(120, 30, 12, "#FFB320");
      default: return "";
    }
  }

  function render(cfg) {
    cfg = cfg || {};
    var bg = BG[cfg.bg] || BG.sky;
    var col = COLORS[cfg.color] || COLORS.blue;
    var accCol = COLORS[cfg.acc === "headphones" || cfg.acc === "cap" ? (cfg.color === "amber" ? "blue" : "amber") : "amber"] || "#FFB320";
    var f = face(cfg.face);
    var a = cfg.acc && cfg.acc !== "none" ? acc(cfg.acc, accCol) : "";
    var behind = BEHIND[cfg.acc] ? a : "";
    var front = BEHIND[cfg.acc] ? "" : a;
    return '<svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" class="ctf-avatar-svg" role="img" aria-label="avatar">' +
      '<rect width="240" height="240" rx="44" fill="' + bg + '"/>' +
      '<ellipse cx="120" cy="214" rx="64" ry="12" fill="rgba(12,19,34,.10)"/>' +
      '<g class="av-all">' +
        behind +
        '<circle cx="120" cy="126" r="84" fill="' + col + '"/>' +
        '<ellipse cx="120" cy="150" rx="56" ry="48" fill="rgba(255,255,255,.16)"/>' +
        '<g class="av-eyes">' + f.eyes + '</g>' +
        f.mouth +
        front +
      '</g></svg>';
  }

  function random() {
    var pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };
    return { bg: pick(Object.keys(BG)), color: pick(Object.keys(COLORS)), face: pick(FACES), acc: pick(BASE_ACCS) };
  }

  // which reward accessories are unlocked, given earned badge keys
  function unlockedFromBadges(badgeKeys) {
    var set = {};
    (badgeKeys || []).forEach(function (k) {
      var m = String(k).match(/-m(\d+)$/);
      if (m && REWARDS[+m[1]]) set[REWARDS[+m[1]].key] = true;
    });
    return set;
  }
  function rewardForAcc(key) {
    for (var n in REWARDS) if (REWARDS[n].key === key) return { n: +n, label: REWARDS[n].label, emoji: REWARDS[n].emoji };
    return null;
  }

  window.CTFAvatar = {
    render: render, random: random,
    COLORS: Object.keys(COLORS), BG: Object.keys(BG), FACES: FACES, ACCS: ACCS,
    BASE_ACCS: BASE_ACCS, REWARDS: REWARDS, REWARD_KEYS: REWARD_KEYS,
    unlockedFromBadges: unlockedFromBadges, rewardForAcc: rewardForAcc,
    colorHex: function (k) { return COLORS[k]; }, bgHex: function (k) { return BG[k]; },
    DEFAULT: { bg: "sky", color: "blue", face: "happy", acc: "none" }
  };
})();
