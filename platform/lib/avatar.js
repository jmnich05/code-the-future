/* ==========================================================================
   Code the Future — composable avatar (window.CTFAvatar)
   A friendly full-body "buddy" built from swappable parts: background, color,
   hair, eyes, brows, mouth, accessory. Original vector art, saved as JSON in
   profiles.avatar.

   v3: FULL BODY (chibi — big head, little body) so capes, jetpacks and pins
   actually live on a character. New part types: hair, brows, mouth.
   Back-compat: v2 configs ({bg,color,face,acc}) render without changes —
   `face` still picks the eye style, and a missing mouth/brows/hair falls back
   to a look derived from it.

   Animation hooks (styles in app.css): .av-all bob · .av-eyes blink ·
   .av-arm-r wave on hover.
   ========================================================================== */
(function () {
  var COLORS = { blue: "#3D74FF", teal: "#26C7D1", coral: "#FF5A38", amber: "#FFB320", violet: "#7C5CFF", green: "#2FBF71", pink: "#FF6FB5", ink: "#2A3349" };
  var BG = { sky: "#EAF1FF", mint: "#E4FBFC", peach: "#FFF0EC", sun: "#FFF7E6", lilac: "#EFEAFF", night: "#0F1B3A" };
  var FACES = ["happy", "wink", "cool", "surprised", "star"];
  var HAIR = ["none", "fluffy", "spiky", "curls", "long", "puffs", "buzz"];
  var BROWS = ["none", "soft", "raised", "determined"];
  var MOUTHS = ["smile", "grin", "ooh", "tongue", "flat", "smirk"];
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

  // geometry: head center (120,86) r 50 · torso 92..152 · feet at 196
  var HX = 120, HY = 86, HR = 50;

  // darken a hex color (hair = deeper shade of the body color)
  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return "rgb(" + Math.round(r * f) + "," + Math.round(g * f) + "," + Math.round(b * f) + ")";
  }

  function star(cx, cy, r, fill) {
    var p = "";
    for (var i = 0; i < 10; i++) { var a = Math.PI / 5 * i - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; p += (i ? "L" : "M") + (cx + rr * Math.cos(a)).toFixed(1) + " " + (cy + rr * Math.sin(a)).toFixed(1); }
    return '<path d="' + p + 'Z" fill="' + (fill || INK) + '"/>';
  }
  function dotEyes(pr) {
    return '<circle cx="104" cy="82" r="13" fill="#fff"/><circle cx="136" cy="82" r="13" fill="#fff"/>' +
      '<circle cx="106" cy="84" r="' + pr + '" fill="' + INK + '"/><circle cx="138" cy="84" r="' + pr + '" fill="' + INK + '"/>';
  }

  // eye styles (the old `face` key) — only these blink
  function eyes(f) {
    switch (f) {
      case "wink":
        return '<circle cx="104" cy="82" r="13" fill="#fff"/><circle cx="106" cy="84" r="6" fill="' + INK + '"/><path d="M128 82 h14" stroke="' + INK + '" stroke-width="5" stroke-linecap="round"/>';
      case "cool":
        return '<rect x="92" y="78" width="24" height="9" rx="4.5" fill="#fff"/><rect x="124" y="78" width="24" height="9" rx="4.5" fill="#fff"/>';
      case "surprised":
        return dotEyes(7);
      case "star":
        return '<g fill="' + INK + '">' + star(104, 82, 12) + star(136, 82, 12) + '</g>';
      default:
        return dotEyes(6);
    }
  }
  // mouth styles — defaults derived from the old face key for v2 configs
  function mouthFor(cfg) {
    var m = cfg.mouth;
    if (!m) m = { cool: "flat", surprised: "ooh", star: "grin" }[cfg.face] || "smile";
    switch (m) {
      case "grin":   return '<path d="M102 104 q18 22 36 0 q-18 9 -36 0z" fill="' + INK + '"/>';
      case "ooh":    return '<circle cx="120" cy="110" r="8" fill="' + INK + '"/>';
      case "tongue": return '<path d="M104 104 q16 18 32 0" stroke="' + INK + '" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M114 109 q6 12 14 4 l-2 -8z" fill="#FF6FB5"/>';
      case "flat":   return '<path d="M108 108 h24" stroke="' + INK + '" stroke-width="5" stroke-linecap="round"/>';
      case "smirk":  return '<path d="M106 108 q14 10 28 -2" stroke="' + INK + '" stroke-width="5" fill="none" stroke-linecap="round"/>';
      default:       return '<path d="M104 104 q16 18 32 0" stroke="' + INK + '" stroke-width="5" fill="none" stroke-linecap="round"/>';
    }
  }
  function browsFor(b) {
    switch (b) {
      case "soft":       return '<path d="M94 64 q10 -7 20 -2 M126 62 q10 -5 20 2" stroke="' + INK + '" stroke-width="4.5" fill="none" stroke-linecap="round"/>';
      case "raised":     return '<path d="M94 58 q10 -9 20 -4 M126 54 q10 -5 20 4" stroke="' + INK + '" stroke-width="4.5" fill="none" stroke-linecap="round"/>';
      case "determined": return '<path d="M94 60 l20 7 M146 60 l-20 7" stroke="' + INK + '" stroke-width="5" stroke-linecap="round"/>';
      default: return "";
    }
  }
  function hairFor(h, c) {
    var hc = shade(c, 0.62);
    switch (h) {
      case "fluffy":
        return '<g fill="' + hc + '"><circle cx="92" cy="44" r="17"/><circle cx="118" cy="36" r="20"/><circle cx="146" cy="44" r="16"/><circle cx="76" cy="58" r="12"/><circle cx="163" cy="58" r="11"/></g>';
      case "spiky":
        return '<path d="M76 60 l8 -26 10 18 8 -28 12 22 8 -26 12 24 8 -20 10 24 6 -14 6 22 q-44 -26 -88 4z" fill="' + hc + '"/>';
      case "curls":
        return '<g fill="' + hc + '"><circle cx="86" cy="50" r="13"/><circle cx="106" cy="38" r="14"/><circle cx="130" cy="36" r="14"/><circle cx="152" cy="46" r="13"/><circle cx="166" cy="64" r="10"/><circle cx="73" cy="66" r="10"/></g>';
      case "long":
        return '<path d="M72 64 q-8 56 6 86 l16 -6 q-8 -34 -2 -58z" fill="' + hc + '"/><path d="M168 64 q8 56 -6 86 l-16 -6 q8 -34 2 -58z" fill="' + hc + '"/><path d="M74 62 q46 -42 92 0 q-46 -22 -92 0z" fill="' + hc + '"/>';
      case "puffs":
        return '<g fill="' + hc + '"><circle cx="82" cy="40" r="17"/><circle cx="158" cy="40" r="17"/></g><path d="M82 56 q38 -26 76 0 q-38 -14 -76 0z" fill="' + hc + '"/>';
      case "buzz":
        return '<path d="M74 60 a50 50 0 0 1 92 0 q-46 -20 -92 0z" fill="' + hc + '"/>';
      default: return "";
    }
  }

  // accessories, positioned for the full-body rig
  function acc(a, c) {
    switch (a) {
      // ---- base set ----
      case "cap":
        return '<path d="M72 48 q48 -44 96 0z" fill="' + c + '"/><path d="M64 48 h66 a7 7 0 0 1 0 14 h-66z" fill="' + c + '"/><circle cx="120" cy="14" r="6" fill="#fff"/>';
      case "glasses":
        return '<g fill="none" stroke="' + INK + '" stroke-width="5"><circle cx="104" cy="82" r="17"/><circle cx="136" cy="82" r="17"/></g><path d="M87 80 h-12 M153 80 h12" stroke="' + INK + '" stroke-width="5" stroke-linecap="round"/>';
      case "headphones":
        return '<path d="M72 84 a48 48 0 0 1 96 0" fill="none" stroke="' + c + '" stroke-width="9" stroke-linecap="round"/><rect x="62" y="76" width="18" height="32" rx="8" fill="' + c + '"/><rect x="160" y="76" width="18" height="32" rx="8" fill="' + c + '"/>';
      case "bow":
        return '<g fill="' + c + '"><path d="M120 34 l-24 -13 v26z"/><path d="M120 34 l24 -13 v26z"/><circle cx="120" cy="34" r="8"/></g>';
      case "crown":
        return '<path d="M88 42 l8 -24 14 17 10 -22 10 22 14 -17 8 24z" fill="' + c + '"/><circle cx="120" cy="22" r="4" fill="#fff"/>';
      // ---- mission rewards ----
      case "cape":
        return '<path d="M78 122 q-26 48 -8 84 q22 -4 36 -20z" fill="#FF5A38"/><path d="M162 122 q26 48 8 84 q-22 -4 -36 -20z" fill="#FF5A38"/><path d="M80 118 q40 -22 80 0 l-6 12 q-34 -16 -68 0z" fill="#E8401F"/>';
      case "antenna":
        return '<path d="M120 38 v-20" stroke="' + INK + '" stroke-width="6" stroke-linecap="round"/><circle cx="120" cy="13" r="8" fill="#26C7D1"/><circle cx="120" cy="13" r="13" fill="#26C7D1" opacity=".25"/>';
      case "wizard":
        return '<path d="M120 -6 l30 62 h-60z" fill="#7C5CFF"/><path d="M84 54 h72 a7 7 0 0 1 0 14 h-72 a7 7 0 0 1 0 -14z" fill="#5b3fd6"/>' + star(120, 30, 8, "#FFB320");
      case "headband":
        return '<path d="M76 64 q44 -20 88 0 l-3 12 q-41 -17 -82 0z" fill="#FF5A38"/><rect x="106" y="54" width="28" height="9" rx="4.5" fill="#FFB320"/>';
      case "detective":
        return '<path d="M78 52 q42 -36 84 0 l8 4 q-50 -13 -100 0z" fill="#8a6a4b"/><path d="M90 52 q30 -25 60 0 v-15 q-30 -21 -60 0z" fill="#a8835d"/><path d="M90 42 h60 v7 h-60z" fill="#6e5238"/>';
      case "sparkles":
        return '<g fill="#FFB320">' + star(54, 56, 9) + star(190, 72, 7) + star(168, 26, 10) + '</g><g fill="#26C7D1">' + star(70, 24, 7) + star(196, 140, 6) + '</g>';
      case "starpin":
        return star(95, 120, 12, "#FFB320") + '<circle cx="95" cy="120" r="17" fill="none" stroke="#fff" stroke-width="3.5"/>';
      case "halo":
        return '<ellipse cx="120" cy="14" rx="36" ry="10" fill="none" stroke="#FFB320" stroke-width="7"/><ellipse cx="120" cy="14" rx="36" ry="10" fill="none" stroke="#FFD980" stroke-width="2.5"/>';
      case "propeller":
        return '<path d="M120 30 v-10" stroke="' + INK + '" stroke-width="5"/><ellipse cx="96" cy="16" rx="22" ry="8" fill="#FF5A38"/><ellipse cx="144" cy="16" rx="22" ry="8" fill="#26C7D1"/><circle cx="120" cy="16" r="7" fill="#FFB320"/>';
      case "visor":
        return '<path d="M84 72 h72 a10 10 0 0 1 10 10 v4 a10 10 0 0 1 -10 10 h-72 a10 10 0 0 1 -10 -10 v-4 a10 10 0 0 1 10 -10z" fill="#0F1B3A"/><rect x="88" y="77" width="64" height="12" rx="6" fill="#26C7D1" opacity=".85"/>';
      case "jetpack":
        return '<rect x="58" y="118" width="24" height="50" rx="11" fill="#8A93A8"/><rect x="158" y="118" width="24" height="50" rx="11" fill="#8A93A8"/><path d="M64 170 l6 16 6 -16z" fill="#FFB320"/><path d="M164 170 l6 16 6 -16z" fill="#FFB320"/>';
      case "laurel":
        return '<g fill="#FFB320"><path d="M64 64 q-14 32 6 58 l9 -7 q-14 -21 -4 -45z" fill="#FFB320"/><path d="M176 64 q14 32 -6 58 l-9 -7 q14 -21 4 -45z"/></g>' + star(120, 8, 10, "#FFB320");
      default: return "";
    }
  }

  function render(cfg) {
    cfg = cfg || {};
    var bg = BG[cfg.bg] || BG.sky;
    var col = COLORS[cfg.color] || COLORS.blue;
    var deep = shade(col, 0.72);
    var accCol = COLORS[cfg.acc === "headphones" || cfg.acc === "cap" ? (cfg.color === "amber" ? "blue" : "amber") : "amber"] || "#FFB320";
    var a = cfg.acc && cfg.acc !== "none" ? acc(cfg.acc, accCol) : "";
    var behind = BEHIND[cfg.acc] ? a : "";
    var front = BEHIND[cfg.acc] ? "" : a;
    return '<svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" class="ctf-avatar-svg" role="img" aria-label="avatar">' +
      '<rect width="240" height="240" rx="44" fill="' + bg + '"/>' +
      '<ellipse cx="120" cy="212" rx="58" ry="11" fill="rgba(12,19,34,.10)"/>' +
      '<g class="av-all">' +
        behind +
        // legs + feet
        '<rect x="98" y="178" width="16" height="24" rx="8" fill="' + deep + '"/>' +
        '<rect x="126" y="178" width="16" height="24" rx="8" fill="' + deep + '"/>' +
        '<ellipse cx="105" cy="203" rx="15" ry="8" fill="' + INK + '"/>' +
        '<ellipse cx="135" cy="203" rx="15" ry="8" fill="' + INK + '"/>' +
        // arms (right one waves on hover)
        '<g class="av-arm-l"><rect x="64" y="126" width="16" height="44" rx="8" fill="' + col + '" transform="rotate(14 72 130)"/></g>' +
        '<g class="av-arm-r"><rect x="160" y="126" width="16" height="44" rx="8" fill="' + col + '" transform="rotate(-14 168 130)"/></g>' +
        // torso
        '<path d="M86 124 h68 q4 0 4 8 v34 a22 22 0 0 1 -22 22 h-32 a22 22 0 0 1 -22 -22 v-34 q0 -8 4 -8z" fill="' + col + '"/>' +
        '<ellipse cx="120" cy="160" rx="26" ry="20" fill="rgba(255,255,255,.18)"/>' +
        // head
        '<circle cx="' + HX + '" cy="' + HY + '" r="' + HR + '" fill="' + col + '"/>' +
        '<ellipse cx="120" cy="104" rx="32" ry="22" fill="rgba(255,255,255,.16)"/>' +
        hairFor(cfg.hair, col) +
        browsFor(cfg.brows) +
        '<g class="av-eyes">' + eyes(cfg.face) + '</g>' +
        mouthFor(cfg) +
        front +
      '</g></svg>';
  }

  function random() {
    var pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };
    return {
      bg: pick(Object.keys(BG)), color: pick(Object.keys(COLORS)), face: pick(FACES),
      hair: pick(HAIR), brows: pick(BROWS.slice(1)), mouth: pick(MOUTHS), acc: pick(BASE_ACCS)
    };
  }

  // which reward accessories are unlocked, given earned badge keys
  function unlockedFromBadges(badgeKeys) {
    var set = {};
    (badgeKeys || []).forEach(function (k) {
      if (/-welcome$/.test(String(k))) set.starpin = true;   // onboarding-tour reward
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
    HAIR: HAIR, BROWS: BROWS, MOUTHS: MOUTHS,
    BASE_ACCS: BASE_ACCS, REWARDS: REWARDS, REWARD_KEYS: REWARD_KEYS,
    unlockedFromBadges: unlockedFromBadges, rewardForAcc: rewardForAcc,
    colorHex: function (k) { return COLORS[k]; }, bgHex: function (k) { return BG[k]; },
    DEFAULT: { bg: "sky", color: "blue", face: "happy", hair: "fluffy", brows: "soft", mouth: "smile", acc: "none" }
  };
})();
