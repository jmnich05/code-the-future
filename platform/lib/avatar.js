/* ==========================================================================
   Code the Future — composable avatar (window.CTFAvatar)
   A friendly "buddy" built from swappable parts (background, color, face,
   accessory). Original vector art — license-clean, on-brand, saved as a tiny
   JSON config in profiles.avatar and rendered to SVG anywhere.
   ========================================================================== */
(function () {
  var COLORS = { blue: "#3D74FF", teal: "#26C7D1", coral: "#FF5A38", amber: "#FFB320", violet: "#7C5CFF", green: "#2FBF71", pink: "#FF6FB5", ink: "#2A3349" };
  var BG = { sky: "#EAF1FF", mint: "#E4FBFC", peach: "#FFF0EC", sun: "#FFF7E6", lilac: "#EFEAFF", night: "#0F1B3A" };
  var FACES = ["happy", "wink", "cool", "surprised", "star"];
  var ACCS = ["none", "cap", "glasses", "headphones", "bow", "crown"];
  var INK = "#0C1322";

  function eyes(lx, ly, rx, ry, pr) {
    return '<circle cx="' + lx + '" cy="' + ly + '" r="18" fill="#fff"/><circle cx="' + rx + '" cy="' + ry + '" r="18" fill="#fff"/>' +
      '<circle cx="' + (lx + 2) + '" cy="' + (ly + 3) + '" r="' + pr + '" fill="' + INK + '"/><circle cx="' + (rx + 2) + '" cy="' + (ry + 3) + '" r="' + pr + '" fill="' + INK + '"/>';
  }
  function face(f) {
    switch (f) {
      case "wink":
        return eyes(100, 118, 140, 118, 8).replace(/<circle cx="142"[^>]*fill="#0C1322"\/>/, '') +
          '<path d="M132 118 h16" stroke="' + INK + '" stroke-width="6" stroke-linecap="round"/>' +
          '<path d="M101 150 q20 22 40 0" stroke="' + INK + '" stroke-width="6" fill="none" stroke-linecap="round"/>';
      case "cool":
        return '<rect x="84" y="112" width="32" height="12" rx="6" fill="#fff"/><rect x="124" y="112" width="32" height="12" rx="6" fill="#fff"/>' +
          '<path d="M104 150 h32" stroke="' + INK + '" stroke-width="6" stroke-linecap="round"/>';
      case "surprised":
        return eyes(100, 116, 140, 116, 9) + '<circle cx="120" cy="154" r="11" fill="' + INK + '"/>';
      case "star":
        return '<g fill="' + INK + '">' + star(100, 118, 17) + star(140, 118, 17) + '</g>' +
          '<path d="M98 148 q22 26 44 0 q-22 10 -44 0z" fill="' + INK + '"/>';
      default: // happy
        return eyes(100, 118, 140, 118, 8) + '<path d="M100 150 q20 24 40 0" stroke="' + INK + '" stroke-width="6" fill="none" stroke-linecap="round"/>';
    }
  }
  function star(cx, cy, r) {
    var p = "";
    for (var i = 0; i < 10; i++) { var a = Math.PI / 5 * i - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; p += (i ? "L" : "M") + (cx + rr * Math.cos(a)).toFixed(1) + " " + (cy + rr * Math.sin(a)).toFixed(1); }
    return '<path d="' + p + 'Z"/>';
  }
  function acc(a, c) {
    switch (a) {
      case "cap":
        return '<path d="M60 86 q60 -58 120 0z" fill="' + c + '"/><path d="M52 86 h80 a8 8 0 0 1 0 16 h-80z" fill="' + c + '"/><circle cx="120" cy="40" r="7" fill="#fff"/>';
      case "glasses":
        return '<g fill="none" stroke="' + INK + '" stroke-width="6"><circle cx="100" cy="118" r="22"/><circle cx="140" cy="118" r="22"/><path d="M122 118 h-4 M122 116 h-2"/></g><path d="M78 116 h-14 M162 116 h14" stroke="' + INK + '" stroke-width="6" stroke-linecap="round"/>';
      case "headphones":
        return '<path d="M58 120 a62 62 0 0 1 124 0" fill="none" stroke="' + c + '" stroke-width="11" stroke-linecap="round"/><rect x="48" y="112" width="22" height="40" rx="10" fill="' + c + '"/><rect x="170" y="112" width="22" height="40" rx="10" fill="' + c + '"/>';
      case "bow":
        return '<g fill="' + c + '"><path d="M120 52 l-30 -16 v32z"/><path d="M120 52 l30 -16 v32z"/><circle cx="120" cy="52" r="10"/></g>';
      case "crown":
        return '<path d="M78 60 l10 -30 18 22 14 -28 14 28 18 -22 10 30z" fill="' + c + '"/><circle cx="120" cy="34" r="5" fill="#fff"/>';
      default: return "";
    }
  }

  function render(cfg) {
    cfg = cfg || {};
    var bg = BG[cfg.bg] || BG.sky;
    var col = COLORS[cfg.color] || COLORS.blue;
    var accCol = COLORS[cfg.acc === "headphones" || cfg.acc === "cap" ? (cfg.color === "amber" ? "blue" : "amber") : "amber"] || "#FFB320";
    return '<svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" class="ctf-avatar-svg" role="img" aria-label="avatar">' +
      '<rect width="240" height="240" rx="44" fill="' + bg + '"/>' +
      '<ellipse cx="120" cy="214" rx="64" ry="12" fill="rgba(12,19,34,.10)"/>' +
      '<circle cx="120" cy="126" r="84" fill="' + col + '"/>' +
      '<ellipse cx="120" cy="150" rx="56" ry="48" fill="rgba(255,255,255,.16)"/>' +
      face(cfg.face) + acc(cfg.acc, accCol) +
      '</svg>';
  }

  function random() {
    var pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };
    return { bg: pick(Object.keys(BG)), color: pick(Object.keys(COLORS)), face: pick(FACES), acc: pick(ACCS) };
  }

  window.CTFAvatar = {
    render: render, random: random,
    COLORS: Object.keys(COLORS), BG: Object.keys(BG), FACES: FACES, ACCS: ACCS,
    colorHex: function (k) { return COLORS[k]; }, bgHex: function (k) { return BG[k]; },
    DEFAULT: { bg: "sky", color: "blue", face: "happy", acc: "none" }
  };
})();
