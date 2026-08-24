import assert from "node:assert/strict";
import test from "node:test";
import { AgentProviderError } from "../modules/agent/application/provider-failure.ts";
import { HttpAgentPlatformProvisioner } from "../modules/agent/infrastructure/http-agent-platform-provisioner.ts";

test("configured HTTP adapter sends a minimal idempotent provisioning contract", async () => {
  let captured: { url: URL; init: RequestInit } | null = null;
  const fetcher = (async (input: URL | RequestInfo, init?: RequestInit) => { captured = { url: new URL(String(input)), init: init ?? {} }; return Response.json({ agentId: "agent-123", requestId: "provider-request-1" }); }) as typeof fetch;
  const adapter = new HttpAgentPlatformProvisioner({ baseUrl: "https://agent.example/api/", accessToken: "runtime-secret" }, fetcher);
  const result = await adapter.execute({ operation: "PROVISION", platform: "zuno_agent", customerId: "customer-1", externalAgentId: null, idempotencyKey: "provision-customer-1" });
  const sent = captured as unknown as { url: URL; init: RequestInit }; assert.ok(sent);
  assert.equal(sent.url.toString(), "https://agent.example/api/v1/agents");
  assert.equal(sent.init.method, "POST");
  const headers = new Headers(sent.init.headers); assert.equal(headers.get("authorization"), "Bearer runtime-secret"); assert.equal(headers.get("idempotency-key"), "provision-customer-1");
  assert.deepEqual(JSON.parse(String(sent.init.body)), { customerId: "customer-1", platform: "zuno_agent" });
  assert.deepEqual(result, { externalAgentId: "agent-123", providerReference: "provider-request-1" });
  assert.equal(JSON.stringify(result).includes("runtime-secret"), false);
});

test("adapter classifies transient responses without persisting provider bodies", async () => {
  const adapter = new HttpAgentPlatformProvisioner({ baseUrl: "https://agent.example", accessToken: "secret" }, (async () => new Response("private outage details", { status: 503 })) as typeof fetch);
  await assert.rejects(() => adapter.execute({ operation: "PROVISION", platform: "zuno_agent", customerId: "customer-1", externalAgentId: null, idempotencyKey: "provision-customer-1" }), (error: unknown) => error instanceof AgentProviderError && error.category === "HTTP_503" && error.retryable && !error.message.includes("private outage"));
});

test("adapter treats missing inspected agents as a reconciliation state", async () => {
  const adapter = new HttpAgentPlatformProvisioner({ baseUrl: "https://agent.example", accessToken: "secret" }, (async () => new Response(null, { status: 404, headers: { "x-request-id": "inspect-1" } })) as typeof fetch);
  assert.deepEqual(await adapter.inspect({ platform: "zuno_agent", customerId: "customer-1", externalAgentId: "agent-1" }), { status: "MISSING", externalAgentId: null, providerReference: "inspect-1" });
});

test("adapter rejects non-HTTPS provider configuration outside local development", () => {
  assert.throws(() => new HttpAgentPlatformProvisioner({ baseUrl: "http://agent.example", accessToken: "secret" }), { code: "INSECURE_AGENT_PROVIDER_URL" });
  assert.throws(() => new HttpAgentPlatformProvisioner({ baseUrl: "https://user:password@agent.example", accessToken: "secret" }), { code: "INVALID_AGENT_PROVIDER_URL" });
});
