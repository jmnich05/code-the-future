// ==========================================================================
// Publish a kid's Build Studio creation to the live site (Module 4 flow).
//
//   node scripts/publish-kid-build.mjs <creation.html> <slug> "Title" "By Name"
//
// Writes the creation under  showcase/<slug>/  and refreshes the gallery, so
// after `git add showcase && git commit && git push` it's live at
//   https://codethefuture.net/showcase/<slug>/
//
// SAFETY: the kid's (AI-generated) HTML is served INSIDE a sandboxed iframe
// (sandbox="allow-scripts", no allow-same-origin → null origin), so even though
// it's on the main domain it can't touch cookies, localStorage, or the parent.
// The raw file lives at showcase/<slug>/creation.html; index.html is the wrapper.
// ==========================================================================
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = normalize(join(fileURLToPath(import.meta.url), "..", ".."));
const [file, slugRaw, titleRaw, byRaw] = process.argv.slice(2);
if (!file || !slugRaw) {
  console.error('Usage: node scripts/publish-kid-build.mjs <creation.html> <slug> "Title" "By Name"');
  process.exit(1);
}
if (!existsSync(file)) { console.error("File not found: " + file); process.exit(1); }

const slug = String(slugRaw).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
if (!slug) { console.error("Slug is empty after cleaning."); process.exit(1); }
const title = (titleRaw || slug).slice(0, 60);
const by = (byRaw || "a young builder").slice(0, 40);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const creation = readFileSync(file, "utf8");
const dir = join(ROOT, "showcase", slug);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "creation.html"), creation);

const wrapper = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" type="image/svg+xml" href="/platform/assets/logo-icon-tile.svg">
<title>${esc(title)} — Code the Future</title>
<style>
  *{box-sizing:border-box;margin:0}html,body{height:100%}
  body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:linear-gradient(165deg,#101a3c,#0A1024 55%,#070C1A);color:#EAF1FF;display:flex;flex-direction:column}
  .bar{flex:0 0 auto;display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid rgba(255,255,255,.1)}
  .bar .logo{display:flex;align-items:center;gap:9px;color:#fff;text-decoration:none;font-family:'Space Grotesk',sans-serif;font-weight:700}
  .bar .logo img{width:30px;height:30px}
  .bar .meta{font-size:.95rem} .bar .meta b{font-family:'Space Grotesk',sans-serif} .bar .meta span{color:#9fb6e6;font-size:.82rem}
  .bar a.home{margin-left:auto;color:#cfe3ff;text-decoration:none;font-weight:600;font-size:.9rem;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:8px 14px}
  .frame{flex:1 1 auto;min-height:0;background:#fff}
  iframe{width:100%;height:100%;border:0;display:block}
</style></head><body>
<div class="bar">
  <a class="logo" href="/"><img src="/platform/assets/logo-icon-tile.svg" alt="">Code the <span style="color:#26C7D1">Future</span></a>
  <div class="meta"><b>${esc(title)}</b> <span>· built by ${esc(by)} with AI</span></div>
  <a class="home" href="/showcase/">More creations →</a>
</div>
<div class="frame"><iframe src="creation.html" sandbox="allow-scripts allow-pointer-lock" referrerpolicy="no-referrer" title="${esc(title)}"></iframe></div>
</body></html>`;
writeFileSync(join(dir, "index.html"), wrapper);

// update the gallery manifest
const manifestPath = join(ROOT, "showcase", "creations.json");
let list = [];
try { list = JSON.parse(readFileSync(manifestPath, "utf8")); } catch {}
list = list.filter((c) => c.slug !== slug);
list.unshift({ slug, title, by, when: new Date().toISOString().slice(0, 10) });
writeFileSync(manifestPath, JSON.stringify(list, null, 2));

console.log(`✓ Published "${title}" by ${by}`);
console.log(`  → showcase/${slug}/  (raw: creation.html, wrapped + sandboxed: index.html)`);
console.log(`  Live after commit+push at: https://codethefuture.net/showcase/${slug}/`);
console.log(`  Run: git add showcase && git commit -m "Showcase: ${slug}" && git push`);
