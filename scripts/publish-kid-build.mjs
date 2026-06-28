// ==========================================================================
// Publish a kid's Build Studio creation to the live showcase (Module 4 flow).
//
//   node scripts/publish-kid-build.mjs <creation.html> <slug> "Title" "By Name"
//
// Writes the creation under  studentdemos/<slug>/  and refreshes the gallery.
// The studentdemos/ folder deploys as its OWN Netlify site at
//   https://studentdemos.codethefuture.net/<slug>/
// (a separate origin from the platform, behind the cohort password) so kid
// builds live well away from the platform's cookies and auth.
//
// After running this, ship it with:
//   git add studentdemos && git commit -m "Showcase: <slug>" && git push
//
// SAFETY: the kid's (AI-generated) HTML is served INSIDE a sandboxed iframe
// (sandbox="allow-scripts", no allow-same-origin → null origin), AND on its own
// origin, so it can't touch the platform's cookies, localStorage, or the parent.
// The raw file lives at studentdemos/<slug>/creation.html; index.html wraps it.
// ==========================================================================
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = "studentdemos";                          // the showcase site folder + subdomain
const HOST = "https://studentdemos.codethefuture.net";

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
const dir = join(ROOT, SITE, slug);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "creation.html"), creation);

const wrapper = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<link rel="icon" type="image/svg+xml" href="/assets/logo.svg">
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
  <a class="logo" href="/"><img src="/assets/logo.svg" alt="">Code the <span style="color:#26C7D1">Future</span></a>
  <div class="meta"><b>${esc(title)}</b> <span>· built by ${esc(by)} with AI</span></div>
  <a class="home" href="/">More creations →</a>
</div>
<div class="frame"><iframe src="creation.html" sandbox="allow-scripts allow-pointer-lock" referrerpolicy="no-referrer" title="${esc(title)}"></iframe></div>
</body></html>`;
writeFileSync(join(dir, "index.html"), wrapper);

// update the gallery manifest
const manifestPath = join(ROOT, SITE, "creations.json");
let list = [];
try { list = JSON.parse(readFileSync(manifestPath, "utf8")); } catch {}
list = list.filter((c) => c.slug !== slug);
list.unshift({ slug, title, by, when: new Date().toISOString().slice(0, 10) });
writeFileSync(manifestPath, JSON.stringify(list, null, 2));

console.log(`✓ Published "${title}" by ${by}`);
console.log(`  → ${SITE}/${slug}/  (raw: creation.html, wrapped + sandboxed: index.html)`);
console.log(`  Live after commit+push at: ${HOST}/${slug}/`);
console.log(`  Run: git add ${SITE} && git commit -m "Showcase: ${slug}" && git push`);
