import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = resolve(root, 'public');

async function readProjectFile(path: string) {
  return readFile(resolve(root, path), 'utf8');
}

function canonicalUrl(html: string) {
  const match = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
  assert.ok(match?.[1], 'page must declare an absolute canonical URL');
  return new URL(match[1]);
}

function jsonLd(html: string) {
  const match = html.match(/<script\s+type=["']application\/ld\+json["']\s*>([\s\S]*?)<\/script>/i);
  assert.ok(match?.[1], 'page must contain JSON-LD structured data');
  return JSON.parse(match[1]) as Record<string, unknown>;
}

test('homepage exposes canonical metadata and valid discovery structured data', async () => {
  const html = await readProjectFile('index.html');
  const canonical = canonicalUrl(html);
  assert.equal(canonical.protocol, 'https:');
  assert.equal(canonical.pathname, '/');
  assert.match(html, /<title>VYRA\s+—/i);
  assert.match(html, /<meta\s+name=["']description["']\s+content=["'][^"']{50,300}["']/i);
  assert.match(html, /<meta\s+name=["']robots["']\s+content=["']index,follow/i);
  assert.match(html, /property=["']og:title["']/i);
  assert.match(html, /name=["']twitter:card["']/i);

  const structured = jsonLd(html);
  assert.equal(structured['@context'], 'https://schema.org');
  const graph = structured['@graph'];
  assert.ok(Array.isArray(graph));
  const types = graph.map((entry) => (entry as Record<string, unknown>)['@type']);
  assert.ok(types.includes('Organization'));
  assert.ok(types.includes('WebSite'));
  assert.ok(types.includes('SoftwareApplication'));
  for (const entry of graph as Record<string, unknown>[]) {
    const url = entry.url;
    if (typeof url === 'string') assert.equal(new URL(url).origin, canonical.origin);
  }
});

test('robots and sitemap agree on the canonical public origin and list real pages', async () => {
  const homepage = await readProjectFile('index.html');
  const origin = canonicalUrl(homepage).origin;
  const robots = await readProjectFile('public/robots.txt');
  const sitemap = await readProjectFile('public/sitemap.xml');

  assert.match(robots, /^User-agent:\s*\*/m);
  assert.match(robots, /^Allow:\s*\/$/m);
  assert.match(robots, /^Disallow:\s*\/api\//m);
  const sitemapDirective = robots.match(/^Sitemap:\s*(\S+)\s*$/m)?.[1];
  assert.ok(sitemapDirective, 'robots.txt must point crawlers to the sitemap');
  assert.equal(new URL(sitemapDirective).origin, origin);
  assert.equal(sitemapDirective, `${origin}/sitemap.xml`);

  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]));
  assert.ok(urls.length >= 2, 'sitemap should include the homepage and discovery page');
  assert.equal(new Set(urls.map((url) => url.href)).size, urls.length, 'sitemap URLs must be unique');
  for (const url of urls) {
    assert.equal(url.origin, origin, 'sitemap must not expose preview or unrelated hosts');
    assert.equal(url.search, '');
    assert.equal(url.hash, '');
    const relativePath = decodeURIComponent(url.pathname).replace(/^\//, '');
    const filePath = url.pathname === '/' ? resolve(root, 'index.html') : resolve(publicDir, relativePath);
    await access(filePath);
  }
  assert.ok(urls.some((url) => url.pathname === '/'));
  assert.ok(urls.some((url) => url.pathname === '/discover-vyra.html'));
  assert.ok(urls.some((url) => url.pathname === '/vyral-dna.html'));
});

test('VYRAL DNA technical page declares accurate capabilities and matching structured data', async () => {
  const html = await readProjectFile('public/vyral-dna.html');
  const homepage = await readProjectFile('index.html');
  const origin = canonicalUrl(homepage).origin;
  const canonical = canonicalUrl(html);
  assert.equal(canonical.origin, origin);
  assert.equal(canonical.pathname, '/vyral-dna.html');
  assert.match(html, /<title>VYRAL DNA/);
  assert.match(html, /<meta\s+name=["']description["']/i);
  assert.match(html, /<meta\s+name=["']robots["']\s+content=["']index,follow["']/i);
  const structured = jsonLd(html);
  assert.equal(structured['@type'], 'TechArticle');
  assert.equal(structured.mainEntityOfPage, canonical.href);
  assert.match(html, /does not recover the original PNG or JPEG file bytes/i);
  assert.match(html, /original binary bytes can be reconstructed exactly/i);
  assert.doesNotMatch(html, /workers\.dev|localhost|127\.0\.0\.1/i);
});

test('discovery landing page has matching canonical metadata and WebPage JSON-LD', async () => {
  const html = await readProjectFile('public/discover-vyra.html');
  const homepage = await readProjectFile('index.html');
  const homepageOrigin = canonicalUrl(homepage).origin;
  const canonical = canonicalUrl(html);

  assert.equal(canonical.origin, homepageOrigin);
  assert.equal(canonical.pathname, '/discover-vyra.html');
  assert.match(html, /<title>VYRA\s+—/i);
  assert.match(html, /<meta\s+name=["']description["']/i);
  assert.match(html, /<meta\s+name=["']robots["']\s+content=["']index,follow["']/i);

  const structured = jsonLd(html);
  assert.equal(structured['@context'], 'https://schema.org');
  assert.equal(structured['@type'], 'WebPage');
  assert.equal(structured.url, canonical.href);
  assert.equal((structured.isPartOf as Record<string, unknown>).url, `${homepageOrigin}/`);
  assert.doesNotMatch(html, /workers\.dev|localhost|127\.0\.0\.1/i);
});
