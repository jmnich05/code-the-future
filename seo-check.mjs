#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pages = ['index.html', 'about.html', 'faq.html', 'privacy.html', 'terms.html', '404.html'];
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
}

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
