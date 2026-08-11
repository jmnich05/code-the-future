#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pages = ['index.html', 'about.html', 'faq.html', 'privacy.html', 'terms.html', '404.html', 'older-kids.html', 'young-teens.html', 'older-adults.html'];
let failures = 0;

function assert(condition, message) {
  if (!condition) {
    failures += 1;
    console.error(`FAIL ${message}`);
  } else {
    console.log(`OK   ${message}`);
  }
}

for (const page of pages) {
  const file = path.join(root, page);
  const html = fs.readFileSync(file, 'utf8');
  assert(/<title>[^<]{15,}<\/title>/.test(html), `${page} has a meaningful title`);
  assert(/<meta name="description" content="[^"]{50,}"/.test(html), `${page} has a meta description`);
  assert(/<link rel="canonical" href="https:\/\/codethefuture\.net\//.test(html), `${page} has apex canonical`);
  assert(!/content="[^"]*noindex/i.test(html) || page === '404.html', `${page} is indexable when public`);
  const measurementIdMatches = html.match(/G-9CX0PM062K/g) || [];
  assert(measurementIdMatches.length === 2, `${page} includes one configured GA4 tag`);
}

const checkoutSuccess = fs.readFileSync(path.join(root, 'checkout-success.html'), 'utf8');
assert(/G-9CX0PM062K/.test(checkoutSuccess), 'checkout success page includes GA4');
assert(/\/api\/checkout-verify\?session_id=/.test(checkoutSuccess), 'checkout success verifies the Stripe session server-side');
assert(/gtag\("event", "purchase"/.test(checkoutSuccess), 'verified checkout sends the GA4 purchase event');

const homePage = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(/gtag\("event", "begin_checkout"/.test(homePage), 'checkout start sends the GA4 begin_checkout event');
assert(/gtag\("event", "generate_lead"/.test(homePage), 'interest form sends the GA4 generate_lead event');

const platformFiles = [];
function collectHtml(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectHtml(fullPath);
    else if (entry.isFile() && entry.name.endsWith('.html')) platformFiles.push(fullPath);
  }
}
collectHtml(path.join(root, 'platform'));
assert(platformFiles.every((file) => !/G-9CX0PM062K/.test(fs.readFileSync(file, 'utf8'))), 'GA4 tag is excluded from the learner platform');

const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
for (const expected of ['https://codethefuture.net/', 'https://codethefuture.net/about.html', 'https://codethefuture.net/faq.html', 'https://codethefuture.net/privacy.html', 'https://codethefuture.net/terms.html']) {
  assert(urls.includes(expected), `sitemap includes ${expected}`);
}
assert(!urls.some((u) => u.includes('/platform/') || u.includes('/curriculum/') || u.includes('/docs/')), 'sitemap excludes gated/private sections');

const robots = fs.readFileSync(path.join(root, 'robots.txt'), 'utf8');
assert(/Sitemap: https:\/\/codethefuture\.net\/sitemap\.xml/.test(robots), 'robots.txt points to sitemap');
assert(/Disallow: \/platform\//.test(robots), 'robots.txt blocks platform');
assert(/Allow: \/platform\/assets\//.test(robots), 'robots.txt allows public social assets');

if (failures) {
  console.error(`\n${failures} SEO check(s) failed.`);
  process.exit(1);
}
console.log('\nSEO checks passed.');
