import type { AgentProviderSnapshot, AgentProvisioner } from "../application/ports.ts";
import { AgentProviderError } from "../application/provider-failure.ts";
import type { AgentOperation } from "../domain/agent-provisioning.ts";
import { DomainValidationError, ServiceUnavailableError } from "../../shared/domain/errors.ts";
import { runtimeEnv } from "../../../db/runtime-env.ts";

type Fetch = typeof fetch;
type ProviderConfig = { baseUrl: string; accessToken: string; timeoutMs?: number };

export class HttpAgentPlatformProvisioner implements AgentProvisioner {
  private readonly baseUrl: URL; private readonly timeoutMs: number;
  constructor(private readonly config: ProviderConfig, private readonly fetcher: Fetch = fetch) {
    try { this.baseUrl = new URL(config.baseUrl); } catch { throw new DomainValidationError("INVALID_AGENT_PROVIDER_URL", "Agent provider URL is invalid."); }
    if (this.baseUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(this.baseUrl.hostname)) throw new DomainValidationError("INSECURE_AGENT_PROVIDER_URL", "Agent provider URL must use HTTPS.");
    if (this.baseUrl.username || this.baseUrl.password) throw new DomainValidationError("INVALID_AGENT_PROVIDER_URL", "Agent provider URL cannot contain credentials.");
    if (!config.accessToken.trim()) throw new DomainValidationError("AGENT_PROVIDER_TOKEN_REQUIRED", "Agent provider token is required.");
    this.timeoutMs = config.timeoutMs ?? 10_000;
  }

  async execute(input: { operation: AgentOperation; platform: string; customerId: string; externalAgentId: string | null; idempotencyKey: string }) {
    if (input.operation !== "PROVISION" && !input.externalAgentId) throw new AgentProviderError("EXTERNAL_AGENT_ID_REQUIRED", false);
    const path = input.operation === "PROVISION" ? "v1/agents" : input.operation === "UPDATE" ? `v1/agents/${encodeURIComponent(input.externalAgentId!)}` : `v1/agents/${encodeURIComponent(input.externalAgentId!)}/${input.operation.toLowerCase()}`;
    const method = input.operation === "PROVISION" ? "POST" : input.operation === "UPDATE" ? "PATCH" : "POST";
    const response = await this.call(path, { method, headers: { "content-type": "application/json", "idempotency-key": input.idempotencyKey }, body: JSON.stringify({ customerId: input.customerId, platform: input.platform }) });
    const body = await providerJson(response);
    const externalAgentId = typeof body.agentId === "string" && body.agentId.trim() ? body.agentId.trim().slice(0, 255) : input.externalAgentId;
    if (!externalAgentId) throw new AgentProviderError("INVALID_PROVIDER_RESPONSE", false);
    return { externalAgentId, providerReference: providerReference(response, body) };
  }

  async inspect(input: { platform: string; customerId: string; externalAgentId: string }): Promise<AgentProviderSnapshot> {
    const response = await this.call(`v1/agents/${encodeURIComponent(input.externalAgentId)}?customerId=${encodeURIComponent(input.customerId)}&platform=${encodeURIComponent(input.platform)}`, { method: "GET" }, true);
    if (response.status === 404) return { status: "MISSING", externalAgentId: null, providerReference: providerReference(response, {}) };
    const body = await providerJson(response); const status = typeof body.status === "string" ? body.status.toUpperCase() : "";
    if (status !== "ACTIVE" && status !== "SUSPENDED") throw new AgentProviderError("INVALID_PROVIDER_RESPONSE", false);
    return { status, externalAgentId: typeof body.agentId === "string" && body.agentId.trim() ? body.agentId.trim().slice(0, 255) : input.externalAgentId, providerReference: providerReference(response, body) };
  }

  private async call(path: string, init: RequestInit, allowNotFound = false) {
    const url = new URL(path, trailingSlash(this.baseUrl));
    const headers = new Headers(init.headers); headers.set("authorization", `Bearer ${this.config.accessToken}`); headers.set("accept", "application/json");
    let response: Response;
    try { response = await this.fetcher(url, { ...init, headers, signal: AbortSignal.timeout(this.timeoutMs) }); }
    catch { throw new AgentProviderError("NETWORK_ERROR", true); }
    if (response.ok || (allowNotFound && response.status === 404)) return response;
    const retryable = [408, 425, 429].includes(response.status) || response.status >= 500;
    throw new AgentProviderError(`HTTP_${response.status}`, retryable);
  }
}

export async function configuredAgentProvisioner() {
  const env = await runtimeEnv();
  const baseUrl = env.AGENT_PLATFORM_BASE_URL?.trim(); const accessToken = env.AGENT_PLATFORM_ACCESS_TOKEN?.trim();
  if (!baseUrl || !accessToken) throw new ServiceUnavailableError("AGENT_PLATFORM_NOT_CONFIGURED", "Agent platform integration is not configured.");
  return new HttpAgentPlatformProvisioner({ baseUrl, accessToken });
}

async function providerJson(response: Response): Promise<Record<string, unknown>> {
  const declared = response.headers.get("content-length"); if (declared && Number(declared) > 16_384) throw new AgentProviderError("PROVIDER_RESPONSE_TOO_LARGE", false);
  const bytes = await response.arrayBuffer(); if (bytes.byteLength > 16_384) throw new AgentProviderError("PROVIDER_RESPONSE_TOO_LARGE", false);
  try { const value: unknown = JSON.parse(new TextDecoder().decode(bytes)); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); return value as Record<string, unknown>; }
  catch { throw new AgentProviderError("INVALID_PROVIDER_RESPONSE", false); }
}
function providerReference(response: Response, body: Record<string, unknown>) { const value = response.headers.get("x-request-id") ?? (typeof body.requestId === "string" ? body.requestId : null); return value?.trim().slice(0, 255) || null; }
function trailingSlash(url: URL) { const copy = new URL(url); if (!copy.pathname.endsWith("/")) copy.pathname += "/"; return copy; }
