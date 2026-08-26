import assert from "node:assert/strict";
import test from "node:test";
import { apiRoute, jsonObject } from "../app/api/v1/api-http.ts";
import { RequestRateLimitService } from "../modules/api/application/api-security-services.ts";
import { D1ApiSecurityRepository } from "../modules/api/infrastructure/d1-api-security-repository.ts";
import { PayloadTooLargeError, RateLimitExceededError, ServiceUnavailableError } from "../modules/shared/domain/errors.ts";
import { mapApplicationError } from "../modules/shared/presentation/api-primitives.ts";
import { sha256Hex } from "../modules/shared/application/web-crypto.ts";
import { repositoryDatabase } from "./support/sqlite-d1.ts";

const NOW = new Date("2026-08-24T12:00:00.000Z");

test("write routes reject cross-origin requests before executing handlers", async () => {
  let executed = false;
  const response = await apiRoute(new Request("https://zunopixel.com.au/api/v1/customer/account", { method: "POST", headers: { origin: "https://attacker.invalid" } }), async () => { executed = true; return Response.json({ ok: true }); });
  assert.equal(response.status, 403);
  assert.equal(executed, false);
  assert.equal(((await response.json()) as { error: { code: string } }).error.code, "CROSS_ORIGIN_WRITE_DENIED");
});

test("JSON request bodies are bounded by actual bytes and map to 413", async () => {
  const request = new Request("https://zunopixel.com.au/api/v1/public/promotion-codes/validate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ value: "x".repeat(33_000) }) });
  const response = await apiRoute(request, async () => { await jsonObject(request); return Response.json({ ok: true }); });
  assert.equal(response.status, 413);
  assert.equal(((await response.json()) as { error: { code: string } }).error.code, "PAYLOAD_TOO_LARGE");
  assert.equal(mapApplicationError(new PayloadTooLargeError(), "request-1").status, 413);
  assert.equal(mapApplicationError(new ServiceUnavailableError(), "request-1").status, 503);
});

test("public request rate limits are durable and store only a subject hash", async () => {
  const context = repositoryDatabase();
  const service = new RequestRateLimitService(new D1ApiSecurityRepository(context.database), { now: () => NOW });
  const hash = await sha256Hex("203.0.113.10");
  await service.consume("public:plans", hash, 2);
  await service.consume("public:plans", hash, 2);
  await assert.rejects(() => service.consume("public:plans", hash, 2), RateLimitExceededError);
  const row = context.client.database.prepare("select subject_hash,request_count from api_rate_limits").get();
  assert.equal(row?.subject_hash, hash);
  assert.equal(row?.request_count, 3);
  assert.equal(JSON.stringify(row).includes("203.0.113.10"), false);
  context.client.close();
});
