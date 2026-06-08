// ==========================================================================
// Code the Future — original concept art generator
// Writes 12 brand-styled SVG illustrations (one per Module 1 concept) to
// ../assets/art/. Original vector art — license-clean, on-brand, scalable.
//   node lessons/make-art.mjs
// ==========================================================================
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "art");
mkdirSync(OUT, { recursive: true });

const C = { blue: "#2A5FF0", blue5: "#3D74FF", teal: "#12B2BC", teal4: "#26C7D1", coral: "#FF5A38", amber: "#FFB320", ink: "#0C1322", grey: "#8A93A8", line: "#DDE2EC", soft: "#C2F5F8", white: "#FFFFFF" };

const wrap = (inner) =>
  `<svg viewBox="0 0 800 460" xmlns="http://www.w3.org/2000/svg" role="img">
  <defs>
    <linearGradient id="g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${C.blue5}"/><stop offset="1" stop-color="${C.teal4}"/></linearGradient>
    <linearGradient id="sun" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${C.coral}"/><stop offset="1" stop-color="${C.amber}"/></linearGradient>
    <radialGradient id="glow"><stop offset="0" stop-color="${C.teal4}" stop-opacity=".55"/><stop offset="1" stop-color="${C.teal4}" stop-opacity="0"/></radialGradient>
  </defs>
  ${inner}
</svg>`;

const node = (x, y, r, fill = "url(#g)") => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
const card = (x, y, w, h, fill = C.white, stroke = C.line) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="${fill}" stroke="${stroke}" stroke-width="3"/>`;

const ART = {
  // M1 — Welcome: the forward branch (brand mark) reaching a star
  welcome: `
    <circle cx="600" cy="150" r="120" fill="url(#glow)"/>
    <path d="M200 360 L430 175" stroke="url(#g)" stroke-width="30" stroke-linecap="round"/>
    ${node(200, 360, 22, C.blue)}
    <path d="M312 270 L312 172" stroke="${C.teal}" stroke-width="22" stroke-linecap="round"/>
    ${node(312, 162, 24)}
    <path d="M430 175 l-48 6 M430 175 l-6 48" stroke="${C.coral}" stroke-width="28" stroke-linecap="round"/>
    <path d="M600 90 l18 44 47 5 -35 33 9 47 -39 -24 -39 24 9 -47 -35 -33 47 -5z" fill="${C.amber}"/>`,

  // M2 — Rules vs learns: a rigid gear box vs a glowing node-brain
  learns: `
    ${card(120, 150, 200, 170, "#EEF1F6")}
    <circle cx="220" cy="235" r="46" fill="none" stroke="${C.grey}" stroke-width="14"/>
    <g stroke="${C.grey}" stroke-width="14" stroke-linecap="round">
      <path d="M220 175 v-22 M220 295 v22 M160 235 h-22 M280 235 h22"/>
    </g>
    <text x="220" y="135" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="22" fill="${C.grey}">RULES</text>
    <path d="M360 235 h80" stroke="${C.ink}" stroke-width="10" stroke-linecap="round"/>
    <path d="M440 235 l-22 -16 v32 z" fill="${C.ink}"/>
    <circle cx="610" cy="235" r="150" fill="url(#glow)"/>
    <path d="M560 175 q60 -36 100 8 q44 16 22 70 q14 56 -52 56 q-50 30 -86 -16 q-46 -8 -28 -64 q-16 -42 44 -54z" fill="url(#g)"/>
    ${node(595, 215, 9, C.white)}${node(640, 232, 9, C.white)}${node(610, 268, 9, C.white)}
    <text x="610" y="120" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="22" fill="${C.teal}">LEARNS</text>`,

  // M3 — Patterns: a repeating sequence with the "next" highlighted
  patterns: `
    ${[0, 1, 2, 3, 4].map((i) => {
      const x = 130 + i * 120; const is3 = (i + 1) % 2 === 0;
      return is3
        ? `<path d="M${x} 190 l34 60 -68 0z" fill="${C.coral}"/>`
        : `<circle cx="${x}" cy="230" r="34" fill="url(#g)"/>`;
    }).join("")}
    <rect x="600" y="190" width="78" height="78" rx="16" fill="none" stroke="${C.amber}" stroke-width="5" stroke-dasharray="10 8"/>
    <text x="639" y="245" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-weight="700" font-size="46" fill="${C.amber}">?</text>`,

  // M4 — Training: example cards feed a model node
  training: `
    ${[0, 1, 2].map((i) => card(110, 120 + i * 80, 120, 60)).join("")}
    ${[0, 1, 2].map((i) => `<circle cx="140" cy="${150 + i * 80}" r="14" fill="${C.soft}"/><rect x="165" y="${142 + i * 80}" width="50" height="10" rx="5" fill="${C.line}"/>`).join("")}
    ${[0, 1, 2].map((i) => `<path d="M250 ${150 + i * 80} C 360 ${150 + i * 80}, 380 230, 470 230" stroke="${C.teal4}" stroke-width="5" fill="none" opacity=".8"/>`).join("")}
    <circle cx="560" cy="230" r="150" fill="url(#glow)"/>
    ${node(560, 230, 64)}
    <text x="560" y="238" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="20" fill="${C.white}">AI</text>`,

  // M5 — Seeing: pixels resolving into a clean cat face
  seeing: `
    ${(() => { let s = ""; const cells = [[1, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [0, 2], [2, 2], [4, 2], [0, 3], [1, 3], [2, 3], [3, 3], [4, 3]];
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) { const on = cells.some(p => p[0] === c && p[1] === r); s += `<rect x="${110 + c * 42}" y="${158 + r * 42}" width="38" height="38" rx="6" fill="${on ? "url(#g)" : "#EEF1F6"}"/>`; } return s; })()}
    <path d="M380 250 h70" stroke="${C.ink}" stroke-width="8" stroke-linecap="round" opacity=".3"/>
    <path d="M458 250 l-20 -12 v24 z" fill="${C.ink}" opacity=".3"/>
    <g transform="translate(600 252)">
      <path d="M-48 -28 l-12 -56 54 30z" fill="${C.ink}"/>
      <path d="M48 -28 l12 -56 -54 30z" fill="${C.ink}"/>
      <circle cx="0" cy="0" r="66" fill="${C.ink}"/>
      <circle cx="-24" cy="-8" r="9" fill="${C.amber}"/><circle cx="24" cy="-8" r="9" fill="${C.amber}"/>
      <path d="M0 8 l-10 13 h20z" fill="${C.coral}"/>
      <g stroke="${C.white}" stroke-width="3" stroke-linecap="round" opacity=".55"><path d="M12 20 h40 M12 30 h34 M-12 20 h-40 M-12 30 h-34"/></g>
    </g>`,

  // M6 — Words: chat bubble predicting the next word
  words: `
    <path d="M150 130 h500 a36 36 0 0 1 36 36 v140 a36 36 0 0 1 -36 36 h-360 l-70 64 v-64 h-70 a36 36 0 0 1 -36 -36 v-140 a36 36 0 0 1 36 -36z" fill="${C.white}" stroke="${C.line}" stroke-width="3"/>
    <rect x="190" y="190" width="150" height="22" rx="11" fill="${C.line}"/>
    <rect x="190" y="232" width="240" height="22" rx="11" fill="${C.line}"/>
    <rect x="360" y="190" width="120" height="22" rx="11" fill="url(#g)"/>
    <rect x="450" y="232" width="150" height="26" rx="13" fill="none" stroke="${C.amber}" stroke-width="4" stroke-dasharray="9 7"/>
    <path d="M450 270 h150" stroke="${C.amber}" stroke-width="5" stroke-linecap="round"/>`,

  // M7 — Attention: an arc links the word that matters
  attention: `
    ${["The", "ball", "is", "it", "bouncy"].map((w, i) => {
      const x = 90 + i * 130; const hot = i === 1 || i === 3;
      return `<rect x="${x}" y="250" width="115" height="56" rx="28" fill="${hot ? "url(#g)" : "#EEF1F6"}"/><text x="${x + 57}" y="287" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="24" fill="${hot ? C.white : C.grey}">${w}</text>`;
    }).join("")}
    <path d="M530 250 C 500 150, 230 150, 200 250" fill="none" stroke="${C.coral}" stroke-width="6" stroke-linecap="round"/>
    <circle cx="200" cy="250" r="9" fill="${C.coral}"/><circle cx="530" cy="250" r="9" fill="${C.coral}"/>`,

  // M8 — Neural network
  "brain-net": `
    ${(() => { const layers = [[150, [140, 230, 320]], [400, [110, 200, 290, 380]], [650, [185, 275]]]; let s = "";
      for (let l = 0; l < layers.length - 1; l++) for (const y1 of layers[l][1]) for (const y2 of layers[l + 1][1]) s += `<line x1="${layers[l][0]}" y1="${y1}" x2="${layers[l + 1][0]}" y2="${y2}" stroke="${C.line}" stroke-width="2.5"/>`;
      for (const [x, ys] of layers) for (const y of ys) s += node(x, y, 22);
      return s; })()}`,

  // M9 — Timeline
  timeline: `
    <line x1="110" y1="240" x2="690" y2="240" stroke="url(#g)" stroke-width="8" stroke-linecap="round"/>
    ${["1950", "2012", "2017", "now"].map((t, i) => { const x = 150 + i * 165; return `${node(x, 240, 18, i === 3 ? C.coral : "url(#g)")}<text x="${x}" y="300" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="22" fill="${C.ink}">${t}</text>`; }).join("")}`,

  // M10 — Trust: great at vs check it
  trust: `
    <path d="M250 120 l90 28 v90 q0 80 -90 110 q-90 -30 -90 -110 v-90z" fill="url(#g)"/>
    <path d="M210 240 l28 28 54 -62" fill="none" stroke="${C.white}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M540 130 l96 170 a14 14 0 0 1 -12 21 h-168 a14 14 0 0 1 -12 -21z" fill="${C.amber}"/>
    <rect x="551" y="210" width="18" height="60" rx="9" fill="${C.white}"/><circle cx="560" cy="292" r="11" fill="${C.white}"/>`,

  // M11 — Future: a path to a bright horizon
  future: `
    <circle cx="400" cy="250" r="120" fill="url(#sun)"/>
    <path d="M250 410 L370 250 h60 L550 410z" fill="url(#g)" opacity=".9"/>
    <line x1="120" y1="410" x2="680" y2="410" stroke="${C.ink}" stroke-width="6" stroke-linecap="round" opacity=".3"/>
    ${[[180, 120], [620, 150], [540, 90], [250, 90]].map(([x, y]) => `<path d="M${x} ${y} l6 14 15 2 -11 11 3 15 -13 -8 -13 8 3 -15 -11 -11 15 -2z" fill="${C.amber}"/>`).join("")}`,

  // M12 — Trophy
  trophy: `
    <circle cx="400" cy="210" r="150" fill="url(#glow)"/>
    <path d="M330 130 h140 v40 a70 70 0 0 1 -140 0z" fill="url(#g)"/>
    <path d="M330 140 h-44 a30 30 0 0 0 30 44 M470 140 h44 a30 30 0 0 1 -30 44" fill="none" stroke="${C.teal}" stroke-width="12"/>
    <rect x="384" y="225" width="32" height="44" fill="url(#g)"/>
    <rect x="344" y="270" width="112" height="26" rx="10" fill="${C.blue}"/>
    <path d="M400 150 l10 22 24 3 -18 17 5 24 -21 -12 -21 12 5 -24 -18 -17 24 -3z" fill="${C.amber}"/>
    <text x="400" y="350" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-weight="700" font-size="34" fill="${C.ink}">12 / 12</text>`
};

let n = 0;
for (const [name, inner] of Object.entries(ART)) { writeFileSync(join(OUT, name + ".svg"), wrap(inner)); n++; }
console.log("wrote " + n + " SVGs to assets/art/");
