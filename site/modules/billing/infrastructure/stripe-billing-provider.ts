import type { BillingProvider } from "../application/ports.ts";
import { DomainValidationError, ServiceUnavailableError } from "../../shared/domain/errors.ts";

type StripeObject = Record<string, unknown>;
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class StripeBillingProvider implements BillingProvider {
  readonly code = "stripe";

  constructor(private readonly secretKey: string, private readonly fetcher: FetchLike = fetch) {
    if (!/^sk_(test|live)_[A-Za-z0-9_]+$/.test(secretKey)) throw new DomainValidationError("INVALID_STRIPE_SECRET_KEY", "Stripe secret key configuration is invalid.");
  }

  async createCustomer(input: { customerId: string; email: string | null; name: string | null; currency: string; idempotencyKey: string }) {
    const value = await this.request("POST", "/customers", compact({
      email: input.email, name: input.name, "metadata[zuno_customer_id]": input.customerId,
      "metadata[currency]": input.currency.toUpperCase(),
    }), input.idempotencyKey);
    return { providerCustomerId: requiredStripeId(value, "cus_") };
  }

  async createPrice(input: { subscriptionPriceId: string; planId: string; label: string; amountMinor: number; currency: string; interval: "MONTHLY" | "ANNUAL"; idempotencyKey: string }) {
    const product = await this.request("POST", "/products", {
      name: input.label, "metadata[zuno_plan_id]": input.planId,
    }, `${input.idempotencyKey}:product`);
    const providerProductId = requiredStripeId(product, "prod_");
    const price = await this.request("POST", "/prices", {
      product: providerProductId, unit_amount: String(input.amountMinor), currency: input.currency.toLowerCase(),
      "recurring[interval]": input.interval === "ANNUAL" ? "year" : "month",
      "metadata[zuno_subscription_price_id]": input.subscriptionPriceId,
    }, `${input.idempotencyKey}:price`);
    return { providerProductId, providerPriceId: requiredStripeId(price, "price_") };
  }

  async createCheckoutSession(input: { subscriptionId: string; providerCustomerId: string; providerPriceId: string; successUrl: string; cancelUrl: string; idempotencyKey: string }) {
    for (const url of [input.successUrl, input.cancelUrl]) if (!/^https?:\/\//.test(url)) throw new DomainValidationError("INVALID_CHECKOUT_RETURN_URL", "Checkout return URLs must be absolute HTTP URLs.");
    const value = await this.request("POST", "/checkout/sessions", {
      mode: "subscription", customer: input.providerCustomerId, success_url: input.successUrl, cancel_url: input.cancelUrl,
      "line_items[0][price]": input.providerPriceId, "line_items[0][quantity]": "1",
      client_reference_id: input.subscriptionId,
      "metadata[zuno_subscription_id]": input.subscriptionId,
      "subscription_data[metadata][zuno_subscription_id]": input.subscriptionId,
    }, input.idempotencyKey);
    const checkoutUrl = typeof value.url === "string" && value.url.startsWith("https://") ? value.url : null;
    const expires = typeof value.expires_at === "number" ? value.expires_at : null;
    if (!checkoutUrl || !Number.isSafeInteger(expires)) throw providerResponseError();
    return { providerSessionId: requiredStripeId(value, "cs_"), checkoutUrl, expiresAt: new Date(expires! * 1_000) };
  }

  async updateSubscription(input: { providerSubscriptionId: string; providerPriceId: string; idempotencyKey: string }) {
    const current = await this.request("GET", `/subscriptions/${encodeURIComponent(input.providerSubscriptionId)}`);
    const items = object(current.items)?.data;
    const first = Array.isArray(items) ? object(items[0]) : null;
    const itemId = first ? requiredStripeId(first, "si_") : null;
    if (!itemId) throw providerResponseError();
    await this.request("POST", `/subscriptions/${encodeURIComponent(input.providerSubscriptionId)}`, {
      "items[0][id]": itemId, "items[0][price]": input.providerPriceId,
      proration_behavior: "create_prorations",
    }, input.idempotencyKey);
  }

  async suspendSubscription(input: { providerSubscriptionId: string; idempotencyKey: string }) {
    await this.request("POST", `/subscriptions/${encodeURIComponent(input.providerSubscriptionId)}`, { "pause_collection[behavior]": "void" }, input.idempotencyKey);
  }

  async resumeSubscription(input: { providerSubscriptionId: string; idempotencyKey: string }) {
    await this.request("POST", `/subscriptions/${encodeURIComponent(input.providerSubscriptionId)}`, { pause_collection: "" }, input.idempotencyKey);
  }

  async cancelSubscription(input: { providerSubscriptionId: string; idempotencyKey: string }) {
    await this.request("DELETE", `/subscriptions/${encodeURIComponent(input.providerSubscriptionId)}`, {}, input.idempotencyKey);
  }

  private async request(method: "GET" | "POST" | "DELETE", path: string, params: Record<string, string> = {}, idempotencyKey?: string): Promise<StripeObject> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const headers = new Headers({ authorization: `Bearer ${this.secretKey}`, accept: "application/json" });
      if (idempotencyKey) headers.set("idempotency-key", boundedKey(idempotencyKey));
      const init: RequestInit = { method, headers, signal: controller.signal };
      if (method !== "GET") { headers.set("content-type", "application/x-www-form-urlencoded"); init.body = new URLSearchParams(params); }
      const response = await this.fetcher(`https://api.stripe.com/v1${path}`, init);
      const text = await response.text();
      if (text.length > 262_144) throw providerResponseError();
      let value: unknown;
      try { value = JSON.parse(text); } catch { throw providerResponseError(); }
      if (!response.ok) throw new ServiceUnavailableError(response.status === 429 ? "BILLING_PROVIDER_RATE_LIMITED" : "BILLING_PROVIDER_REQUEST_FAILED", "Billing provider request failed safely.");
      const result = object(value);
      if (!result) throw providerResponseError();
      return result;
    } catch (error) {
      if (error instanceof DomainValidationError || error instanceof ServiceUnavailableError) throw error;
      throw new ServiceUnavailableError("BILLING_PROVIDER_UNAVAILABLE", "Billing provider is temporarily unavailable.");
    } finally { clearTimeout(timeout); }
  }
}

function requiredStripeId(value: StripeObject, prefix: string): string {
  const id = typeof value.id === "string" ? value.id : "";
  if (!id.startsWith(prefix) || id.length > 255) throw providerResponseError();
  return id;
}
function object(value: unknown): StripeObject | null { return value && typeof value === "object" && !Array.isArray(value) ? value as StripeObject : null; }
function compact(value: Record<string, string | null>) { return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => entry[1] != null)); }
function boundedKey(value: string) { const key = value.trim(); if (!key || key.length > 255) throw new DomainValidationError("INVALID_IDEMPOTENCY_KEY", "Provider idempotency key is invalid."); return key; }
function providerResponseError() { return new ServiceUnavailableError("INVALID_BILLING_PROVIDER_RESPONSE", "Billing provider returned an invalid response."); }
