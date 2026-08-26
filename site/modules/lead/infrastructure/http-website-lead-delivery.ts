import type { DeliverableWebsiteLead, WebsiteLeadDelivery } from "../application/website-lead-delivery.ts";
import { ServiceUnavailableError } from "../../shared/domain/errors.ts";

type Fetch = typeof fetch;

export class HttpWebsiteLeadDelivery implements WebsiteLeadDelivery {
  private readonly endpoint: URL;

  constructor(endpoint: string, private readonly token: string, private readonly fetcher: Fetch = fetch, private readonly timeoutMs = 10_000) {
    try { this.endpoint = new URL(endpoint); }
    catch { throw unavailable("LEAD_DELIVERY_CONFIGURATION_INVALID"); }
    if (this.endpoint.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(this.endpoint.hostname)) throw unavailable("LEAD_DELIVERY_CONFIGURATION_INVALID");
    if (this.endpoint.username || this.endpoint.password || !token.trim()) throw unavailable("LEAD_DELIVERY_CONFIGURATION_INVALID");
  }

  async deliver(input: DeliverableWebsiteLead, idempotencyKey: string): Promise<void> {
    let response: Response;
    try {
      response = await this.fetcher(this.endpoint, {
        method: "POST",
        redirect: "error",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.token}`,
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw unavailable("LEAD_DELIVERY_UNAVAILABLE");
    }
    if (!response.ok) throw unavailable("LEAD_DELIVERY_REJECTED");
  }
}

export async function configuredWebsiteLeadDelivery(): Promise<WebsiteLeadDelivery> {
  const { env } = await import("cloudflare:workers");
  const endpoint = env.LEAD_DELIVERY_URL?.trim();
  const token = env.LEAD_DELIVERY_TOKEN?.trim();
  if (!endpoint || !token) throw unavailable("LEAD_DELIVERY_NOT_CONFIGURED");
  return new HttpWebsiteLeadDelivery(endpoint, token);
}

function unavailable(code: string) {
  return new ServiceUnavailableError(code, "Online enquiry delivery is temporarily unavailable.");
}
