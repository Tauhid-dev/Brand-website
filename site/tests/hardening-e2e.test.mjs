import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import test from "node:test";

async function worker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("hardening", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

const assetRoot = resolve(fileURLToPath(new URL("../dist/client/", import.meta.url)));
const environment = { ASSETS: { fetch: fetchAsset } };
const context = { waitUntil() {}, passThroughOnException() {} };

async function render(path = "/") { return (await worker()).fetch(new Request(`https://zunopixel.com.au${path}`, { headers: { accept: "text/html" } }), environment, context); }

test("production worker serves critical journeys and every homepage navigation target", async () => {
  const homepage = await render();
  assert.equal(homepage.status, 200);
  const html = await homepage.text();
  const paths = [...new Set([...html.matchAll(/href="([^"#]+)"/g)].map((match) => match[1]).filter((href) => href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/api/") && !href.startsWith("/_next/") && !href.startsWith("/assets/")))];
  for (const path of [...paths, "/pricing", "/growth-audit", "/industries/electricians"]) {
    const response = await render(path);
    assert.ok(response.status < 400, `${path} returned ${response.status}`);
  }
  assert.equal((await render("/missing-hardening-route")).status, 404);
});

test("rendered public journeys meet structural accessibility safeguards", async () => {
  for (const path of ["/", "/pricing", "/growth-audit", "/contact"]) {
    const response = await render(path);
    const html = await response.text();
    assert.match(html, /<html[^>]+lang="en-AU"/i);
    assert.match(html, /class="skip-link"[^>]+href="#main-content"/i);
    assert.match(html, /<main[^>]+id="main-content"/i);
    assert.match(html, /<nav[^>]+aria-label=/i);
    assert.equal((html.match(/<h1\b/gi) ?? []).length, 1, `${path} must have exactly one h1`);
    assert.doesNotMatch(html, /<img\b(?![^>]*\balt=)[^>]*>/i);
    assert.doesNotMatch(html, /tabindex="[1-9]/i);
  }
  const form = await (await render("/growth-audit")).text();
  assert.match(form, /<form[^>]+class="audit-form"/i);
  assert.match(form, /<fieldset[^>]*>.*?<legend>/is);
  assert.match(form, /<label[^>]*class="check full"[^>]*><input[^>]+name="privacyConsent"[^>]*>.*?Privacy policy<\/a><\/label>/is);
});

test("production responses apply security headers without permissive CORS", async () => {
  const response = await render();
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("strict-transport-security") ?? "", /max-age=31536000/);
  assert.match(response.headers.get("permissions-policy") ?? "", /payment=\(\)/);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});

test("production HTML and render-critical assets remain within launch budgets", async () => {
  const response = await render();
  const html = await response.text();
  assert.ok(Buffer.byteLength(html) < 100_000, "homepage HTML exceeds 100 KB");
  const assets = await files(new URL("../dist/client/_next/static/", import.meta.url));
  const javascriptBytes = await totalGzipBytes(assets.filter((path) => path.pathname.endsWith(".js")));
  const cssBytes = await totalGzipBytes(assets.filter((path) => path.pathname.endsWith(".css")));
  assert.ok(javascriptBytes < 200_000, `Gzipped JavaScript assets exceed 200 KB (${javascriptBytes})`);
  assert.ok(cssBytes < 15_000, `Gzipped CSS assets exceed 15 KB (${cssBytes})`);
  assert.doesNotMatch(html, /<script[^>]+src="https?:\/\//i);
});

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(entries.map((entry) => entry.isDirectory() ? files(new URL(`${entry.name}/`, directory)) : [new URL(entry.name, directory)]));
  return paths.flat();
}
async function totalGzipBytes(paths) { return (await Promise.all(paths.map(async (path) => gzipSync(await readFile(path)).byteLength))).reduce((total, size) => total + size, 0); }

async function fetchAsset(request) {
  const pathname = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, "");
  const path = resolve(assetRoot, pathname);
  if (!path.startsWith(`${assetRoot}${sep}`)) return new Response("Not found", { status: 404 });
  try {
    return new Response(await readFile(path), { headers: { "content-type": contentType(path) } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

function contentType(path) {
  return ({ ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml" })[extname(path)] ?? "application/octet-stream";
}
