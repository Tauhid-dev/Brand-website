import assert from "node:assert/strict";
import test from "node:test";
import { InitiateSubscriptionCheckoutService, SynchronizeProviderSubscriptionService } from "../modules/billing/application/billing-provider-services.ts";
import { D1BillingProviderReferenceRepository } from "../modules/billing/infrastructure/d1-billing-provider-reference-repository.ts";
import { D1BillingRepository } from "../modules/billing/infrastructure/d1-billing-repository.ts";
import { StripeBillingProvider } from "../modules/billing/infrastructure/stripe-billing-provider.ts";
import { D1SubscriptionRepository } from "../modules/subscription/infrastructure/d1-subscription-repository.ts";
import { repositoryDatabase } from "./support/sqlite-d1.ts";
import { RecordingAudit } from "./support/audit.ts";

test("Stripe adapter sends bounded form requests with provider idempotency and no secret in URLs", async () => {
  const calls: Array<{ url: string; init?: RequestInit; body: string }> = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); const body = init?.body instanceof URLSearchParams ? init.body.toString() : "";
    calls.push({ url, init, body });
    if (url.endsWith("/customers")) return Response.json({ id: "cus_fixture" });
    if (url.endsWith("/products")) return Response.json({ id: "prod_fixture" });
    if (url.endsWith("/prices")) return Response.json({ id: "price_fixture" });
    if (url.endsWith("/checkout/sessions")) return Response.json({ id: "cs_fixture", url: "https://checkout.stripe.test/session", expires_at: 1_800_000_000 });
    if (url.endsWith("/subscriptions/sub_fixture") && init?.method === "GET") return Response.json({ id: "sub_fixture", items: { data: [{ id: "si_fixture" }] } });
    return Response.json({ id: "sub_fixture" });
  };
  const provider = new StripeBillingProvider("sk_test_fixture", fetcher);
  await provider.createCustomer({ customerId: "customer-1", email: "billing@example.invalid", name: "Example", currency: "AUD", idempotencyKey: "checkout-key:customer" });
  const price = await provider.createPrice({ subscriptionPriceId: "price-1", planId: "plan-1", label: "Zuno Pixel subscription", amountMinor: 8000, currency: "AUD", interval: "MONTHLY", idempotencyKey: "checkout-key:catalogue" });
  await provider.createCheckoutSession({ subscriptionId: "subscription-1", providerCustomerId: "cus_fixture", providerPriceId: price.providerPriceId, successUrl: "https://example.test/account?checkout=success", cancelUrl: "https://example.test/account?checkout=cancelled", idempotencyKey: "checkout-key:checkout" });
  await provider.updateSubscription({ providerSubscriptionId: "sub_fixture", providerPriceId: "price_fixture", idempotencyKey: "update-key" });
  await provider.suspendSubscription({ providerSubscriptionId: "sub_fixture", idempotencyKey: "suspend-key" });
  await provider.resumeSubscription({ providerSubscriptionId: "sub_fixture", idempotencyKey: "resume-key" });
  await provider.cancelSubscription({ providerSubscriptionId: "sub_fixture", idempotencyKey: "cancel-key" });
  assert.equal(calls.every((call) => !call.url.includes("sk_test_fixture")), true);
  assert.match(calls.find((call) => call.url.endsWith("/prices"))?.body ?? "", /unit_amount=8000/);
  assert.match(calls.find((call) => call.url.endsWith("/checkout/sessions"))?.body ?? "", /zuno_subscription_id/);
  assert.equal(new Headers(calls[0]?.init?.headers).get("idempotency-key"), "checkout-key:customer");
  assert.match(calls.find((call) => call.body.includes("si_fixture"))?.body ?? "", /items%5B0%5D%5Bid%5D=si_fixture/);
  assert.equal(calls.some((call) => call.init?.method === "DELETE" && call.url.endsWith("/subscriptions/sub_fixture")), true);
});

test("checkout orchestration uses the internal effective contracted price and persists only provider references", async () => {
  const context = repositoryDatabase();
  const ids = { value: 100, next() { return `97000000-0000-4000-8000-${(++this.value).toString().padStart(12, "0")}`; } };
  const now = new Date("2026-08-25T00:00:00.000Z"); const millis = now.getTime();
  context.client.database.exec("insert into customers (id,external_reference,business_name,contact_name,email,status,creation_source,created_at,updated_at) values ('97000000-0000-4000-8000-000000000001','checkout-customer','Example','Casey','casey@example.invalid','ACTIVE','ADMIN',1,1)");
  context.client.database.exec("insert into plans (id,code,name,active,featured,custom,display_order,created_at,updated_at) values ('97000000-0000-4000-8000-000000000002','growth','Growth',1,0,0,1,1,1)");
  context.client.database.exec(`insert into subscriptions (id,customer_id,plan_id,status,billing_interval,currency,version,created_at,updated_at) values ('97000000-0000-4000-8000-000000000003','97000000-0000-4000-8000-000000000001','97000000-0000-4000-8000-000000000002','PENDING','MONTHLY','AUD',1,1,1)`);
  const snapshot = JSON.stringify({ planId: "97000000-0000-4000-8000-000000000002", customerId: "97000000-0000-4000-8000-000000000001", billingInterval: "MONTHLY", basePriceMinor: 10000, baseSetupFeeMinor: 0, overridePriceMinor: null, overrideSetupFeeMinor: null, includesSetupFee: false, discounts: [{ customerDiscountId: "discount-1", discountCode: "SAVE20", amountMinor: 2000 }], discountTotalMinor: 2000, subtotalMinor: 8000, taxMinor: 0, totalMinor: 8000, currency: "AUD", taxBehaviour: "EXEMPT", basePriceVersionId: "plan-price-1", customerOverrideId: null, effectiveAt: now.toISOString() });
  context.client.database.prepare("insert into subscription_prices (id,subscription_id,base_amount_minor,effective_amount_minor,setup_fee_minor,discount_total_minor,currency,tax_behaviour,effective_from,pricing_source,pricing_snapshot_json,created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)").run("97000000-0000-4000-8000-000000000004", "97000000-0000-4000-8000-000000000003", 10000, 8000, 0, 2000, "AUD", "EXEMPT", 1, "RESOLVED", snapshot, 1);
  let priceAmount = 0; let updatedPrice = "";
  const provider = {
    code: "stripe",
    async createCustomer() { return { providerCustomerId: "cus_checkout" }; },
    async createPrice(input: { amountMinor: number }) { priceAmount = input.amountMinor; return { providerProductId: "prod_checkout", providerPriceId: "price_checkout" }; },
    async createCheckoutSession() { return { providerSessionId: "cs_checkout", checkoutUrl: "https://checkout.stripe.test/session", expiresAt: new Date(millis + 3_600_000) }; },
    async updateSubscription(input: { providerPriceId: string }) { updatedPrice = input.providerPriceId; }, async suspendSubscription() {}, async resumeSubscription() {}, async cancelSubscription() {},
  };
  const audit = new RecordingAudit();
  const result = await new InitiateSubscriptionCheckoutService(provider, new D1BillingRepository(context.database), new D1BillingProviderReferenceRepository(context.database), new D1SubscriptionRepository(context.database), ids, { now: () => now }, audit).execute({ customerId: "97000000-0000-4000-8000-000000000001", successUrl: "https://example.test/account?checkout=success", cancelUrl: "https://example.test/account?checkout=cancelled", idempotencyKey: "checkout-idempotency-key" });
  assert.equal(result.checkoutUrl, "https://checkout.stripe.test/session"); assert.equal(priceAmount, 8000);
  assert.equal(context.client.database.prepare("select count(*) as count from billing_accounts").get()?.count, 1);
  assert.equal(context.client.database.prepare("select count(*) as count from billing_provider_price_references").get()?.count, 1);
  assert.equal(context.client.database.prepare("select count(*) as count from billing_checkout_sessions").get()?.count, 1);
  assert.equal(JSON.stringify(context.client.database.prepare("select * from billing_checkout_sessions").get()).includes("checkout.stripe.test"), false);
  assert.equal(audit.records.some((record) => record.action === "BILLING_CHECKOUT_CREATED"), true);
  const subscriptions = new D1SubscriptionRepository(context.database);
  await subscriptions.linkProviderReferences({ subscriptionId: "97000000-0000-4000-8000-000000000003", provider: "stripe", externalCustomerId: "cus_checkout", externalSubscriptionId: "sub_checkout", at: new Date(millis + 1) });
  await new SynchronizeProviderSubscriptionService(provider, new D1BillingProviderReferenceRepository(context.database), subscriptions, ids, { now: () => new Date(millis + 1) }, audit).execute({ subscriptionId: "97000000-0000-4000-8000-000000000003", operation: "UPDATE", idempotencyKey: "update-idempotency-key" });
  assert.equal(updatedPrice, "price_checkout");
  context.client.close();
});
