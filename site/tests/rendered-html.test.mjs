import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the branded homepage", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Get found\./);
  assert.match(html, /Book more work\./);
  assert.match(html, /Free Growth Audit/);
  assert.match(html, /AI receptionist/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("renders critical routes and a useful not-found page", async () => {
  for (const [path, text] of [["/pricing", "Growth Engine"], ["/industries/electricians", "electricians"], ["/growth-audit", "Find the gaps"]]) {
    const response = await render(path);
    assert.equal(response.status, 200);
    assert.match(await response.text(), new RegExp(text, "i"));
  }
  const missing = await render("/this-route-does-not-exist");
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /growth path/i);
});

test("keeps brand, pricing and analytics policy centralised", async () => {
  const [config, analytics] = await Promise.all([
    readFile(new URL("../lib/config.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/analytics.ts", import.meta.url), "utf8"),
  ]);
  assert.match(config, /name: "AI-Magnet"/);
  assert.match(config, /setup: 2990/);
  assert.match(config, /monthly: 649/);
  assert.match(config, /Most Popular|popular: true/);
  assert.match(analytics, /blockedKeys/);
  assert.match(analytics, /name\|email\|phone/);
});
