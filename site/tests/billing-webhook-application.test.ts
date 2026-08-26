import assert from "node:assert/strict";
import test from "node:test";
import { ProcessBillingWebhookService } from "../modules/billing/application/billing-webhook-service.ts";
import { RecoverPendingBillingWebhookService } from "../modules/billing/application/billing-webhook-recovery-service.ts";
import { ReconcileBillingEventService } from "../modules/billing/application/billing-event-reconciliation-service.ts";
import { D1BillingRepository } from "../modules/billing/infrastructure/d1-billing-repository.ts";
import { D1BillingWebhookRepository } from "../modules/billing/infrastructure/d1-billing-webhook-repository.ts";
import { D1BillingProviderReferenceRepository } from "../modules/billing/infrastructure/d1-billing-provider-reference-repository.ts";
import { StripeWebhookVerifier } from "../modules/billing/infrastructure/stripe-webhook-verifier.ts";
import { BillingWebhookEvent } from "../modules/billing/domain/billing-webhook.ts";
import { D1SubscriptionRepository } from "../modules/subscription/infrastructure/d1-subscription-repository.ts";
import { hmacSha256Hex } from "../modules/shared/application/web-crypto.ts";
import { EntityId } from "../modules/shared/domain/value-objects.ts";
import { repositoryDatabase } from "./support/sqlite-d1.ts";
import { RecordingAudit } from "./support/audit.ts";

const NOW = new Date("2026-08-24T12:00:00.000Z");
const SECRET = "test-webhook-secret";
const TIMESTAMP = Math.floor(NOW.getTime() / 1_000);

function setup() {
  const context = repositoryDatabase();
  context.client.database.exec("insert into customers (id,external_reference,business_name,contact_name,email,status,creation_source,created_at,updated_at) values ('b0000000-0000-4000-8000-000000000001','customer-webhook','Example Plumbing Pty Ltd','Casey','casey@example.invalid','ACTIVE','ADMIN',1,1)");
  context.client.database.exec("insert into plans (id,code,name,active,featured,custom,display_order,created_at,updated_at) values ('b0000000-0000-4000-8000-000000000002','webhook-plan','Webhook plan',1,0,0,1,1,1)");
  context.client.database.exec("insert into subscriptions (id,customer_id,plan_id,status,billing_interval,currency,started_at,current_period_start,current_period_end,external_billing_provider,external_customer_id,external_subscription_id,version,created_at,updated_at) values ('b0000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000002','ACTIVE','MONTHLY','AUD',1,1787500000000,1787586400000,'stripe','cus_test','sub_test',1,1,1)");
  context.client.database.exec("insert into invoices (id,customer_id,subscription_id,invoice_number,provider_invoice_id,status,currency,subtotal_minor,tax_minor,total_minor,amount_due_minor,issued_at,due_at,created_at,updated_at) values ('b0000000-0000-4000-8000-000000000004','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000003','ZP-WEBHOOK-1','in_test','OPEN','AUD',1000,100,1100,1100,1,1788000000000,1,1)");
  let sequence = 100;
  return { ...context, ids: { next: () => `b0000000-0000-4000-8000-${(++sequence).toString().padStart(12, "0")}` }, clock: { now: () => NOW }, audit: new RecordingAudit() };
}

async function signed(rawBody: string, timestamp = TIMESTAMP) {
  const signature = await hmacSha256Hex(SECRET, `${timestamp}.${rawBody}`);
  return new Headers({ "stripe-signature": `t=${timestamp},v1=${signature}` });
}

function stripeEvent(id: string, type: string, object: Record<string, unknown>) { return JSON.stringify({ id, type, created: TIMESTAMP, data: { object } }); }

test("Stripe verification authenticates the raw body before parsing and minimises the normalized event", async () => {
  const verifier = new StripeWebhookVerifier(SECRET);
  await assert.rejects(() => verifier.verify("not-json", new Headers({ "stripe-signature": `t=${TIMESTAMP},v1=${"0".repeat(64)}` }), NOW), /signature is invalid/);
  const raw = stripeEvent("evt_verify", "customer.subscription.updated", { id: "sub_test", status: "active", current_period_start: TIMESTAMP, current_period_end: TIMESTAMP + 2_592_000, customer_email: "must-not-persist@example.invalid" });
  const verified = await verifier.verify(raw, await signed(raw), NOW);
  assert.equal(verified.event.kind, "SUBSCRIPTION_RENEWED");
  assert.equal(verified.event.externalSubscriptionId, "sub_test");
  assert.equal(JSON.stringify(verified.event).includes("customer_email"), false);
  const staleHeaders = await signed(raw, TIMESTAMP - 1_000);
  await assert.rejects(() => verifier.verify(raw, staleHeaders, NOW), /signature is invalid/);
});

test("webhook claims reject concurrent processing and reclaim an interrupted stale attempt", async () => {
  const context = setup();
  const repository = new D1BillingWebhookRepository(context.database);
  const raw = stripeEvent("evt_interrupted", "customer.subscription.updated", { id: "sub_test", status: "active", current_period_start: TIMESTAMP, current_period_end: TIMESTAMP + 2_592_000 });
  const verified = await new StripeWebhookVerifier(SECRET).verify(raw, await signed(raw), NOW);
  const candidate = (id: string, requestId: string) => new BillingWebhookEvent({ id: new EntityId(id), event: verified.event, payloadHash: verified.payloadHash, status: "PROCESSING", attemptCount: 1, maxAttempts: 5, receivedAt: NOW, processingStartedAt: NOW, processedAt: null, nextAttemptAt: null, failureCode: null, requestId, createdAt: NOW, updatedAt: NOW });
  assert.equal((await repository.claim(candidate("b0000000-0000-4000-8000-000000000201", "request-1"), NOW)).kind, "PROCESS");
  assert.equal((await repository.claim(candidate("b0000000-0000-4000-8000-000000000202", "request-2"), NOW)).kind, "RETRY_LATER");
  const reclaimed = await repository.claim(candidate("b0000000-0000-4000-8000-000000000203", "request-3"), new Date(NOW.getTime() + 6 * 60_000));
  assert.equal(reclaimed.kind, "PROCESS");
  assert.equal(reclaimed.event.props.attemptCount, 2);
  context.client.close();
});

test("scheduled recovery reclaims a failed durable webhook without provider redelivery", async () => {
  const context = setup();
  const repository = new D1BillingWebhookRepository(context.database);
  const event = new BillingWebhookEvent({ id: new EntityId("b0000000-0000-4000-8000-000000000250"), event: { provider: "stripe", providerEventId: "evt_recovery", providerEventType: "unsupported.test", kind: "UNSUPPORTED", externalSubscriptionId: null, externalInvoiceId: null, periodStart: null, periodEnd: null, occurredAt: NOW }, payloadHash: "d".repeat(64), status: "PROCESSING", attemptCount: 1, maxAttempts: 5, receivedAt: NOW, processingStartedAt: NOW, processedAt: null, nextAttemptAt: null, failureCode: null, requestId: "request-recovery", createdAt: NOW, updatedAt: NOW });
  assert.equal((await repository.claim(event, NOW)).kind, "PROCESS");
  await repository.fail(event.props.id.value, "PROVIDER_OUTAGE", NOW, NOW);
  const result = await new RecoverPendingBillingWebhookService(repository, { reconcile: async () => "IGNORED" }, context.clock, context.audit).execute();
  assert.equal(result, "IGNORED");
  const row = context.client.database.prepare("select status,attempt_count from billing_webhook_events where id=?").get(event.props.id.value);
  assert.equal(row?.status, "IGNORED");
  assert.equal(row?.attempt_count, 2);
  assert.equal(context.audit.records.some((record) => record.action === "BILLING_WEBHOOK_RECOVERED"), true);
  context.client.close();
});

test("verified webhook processing reconciles once and rejects provider event ID payload reuse", async () => {
  const context = setup();
  const subscriptions = new D1SubscriptionRepository(context.database);
  const billing = new D1BillingRepository(context.database);
  const service = new ProcessBillingWebhookService(new StripeWebhookVerifier(SECRET), new D1BillingWebhookRepository(context.database), new ReconcileBillingEventService(subscriptions, billing, context.ids, context.clock, context.audit), context.ids, context.clock, context.audit);
  const periodStart = TIMESTAMP + 86_400;
  const periodEnd = periodStart + 2_592_000;
  const raw = stripeEvent("evt_renew", "customer.subscription.updated", { id: "sub_test", status: "active", current_period_start: periodStart, current_period_end: periodEnd });
  const first = await service.execute(raw, await signed(raw), "request-1");
  const duplicate = await service.execute(raw, await signed(raw), "request-2");
  assert.deepEqual(first, { duplicate: false, status: "PROCESSED" });
  assert.deepEqual(duplicate, { duplicate: true, status: "PROCESSED" });
  const subscription = await subscriptions.findByProviderReference("stripe", "sub_test");
  assert.equal(subscription?.props.version, 2);
  assert.equal(subscription?.props.currentPeriodEnd?.getTime(), periodEnd * 1_000);
  assert.equal(context.client.database.prepare("select count(*) as count from billing_webhook_events").get()?.count, 1);
  const changed = stripeEvent("evt_renew", "customer.subscription.updated", { id: "sub_test", status: "active", current_period_start: periodStart, current_period_end: periodEnd + 1 });
  const changedHeaders = await signed(changed);
  await assert.rejects(() => service.execute(changed, changedHeaders, "request-3"), /different payload/);
  assert.equal(context.audit.records.some((record) => record.action === "BILLING_WEBHOOK_PROCESSED"), true);
  context.client.close();
});

test("payment success reconciles invoice and subscription through existing lifecycle services", async () => {
  const context = setup();
  context.client.database.exec("update subscriptions set status='PAST_DUE',version=2,updated_at=2 where external_subscription_id='sub_test'");
  const subscriptions = new D1SubscriptionRepository(context.database);
  const billing = new D1BillingRepository(context.database);
  const service = new ProcessBillingWebhookService(new StripeWebhookVerifier(SECRET), new D1BillingWebhookRepository(context.database), new ReconcileBillingEventService(subscriptions, billing, context.ids, context.clock, context.audit), context.ids, context.clock, context.audit);
  const raw = stripeEvent("evt_paid", "invoice.paid", { id: "in_test", subscription: "sub_test" });
  assert.equal((await service.execute(raw, await signed(raw), "request-paid")).status, "PROCESSED");
  assert.equal((await billing.findInvoiceByProviderReference("in_test"))?.props.status, "PAID");
  assert.equal((await subscriptions.findByProviderReference("stripe", "sub_test"))?.props.status, "ACTIVE");
  context.client.close();
});

test("checkout and recurring invoice events link external IDs and import provider invoice history", async () => {
  const context = setup();
  context.client.database.exec("insert into customers (id,external_reference,business_name,contact_name,email,status,creation_source,created_at,updated_at) values ('b0000000-0000-4000-8000-000000000012','checkout-customer','Checkout Customer','Jordan','jordan@example.invalid','ACTIVE','ADMIN',1,1)");
  context.client.database.exec("insert into subscriptions (id,customer_id,plan_id,status,billing_interval,currency,version,created_at,updated_at) values ('b0000000-0000-4000-8000-000000000013','b0000000-0000-4000-8000-000000000012','b0000000-0000-4000-8000-000000000002','PENDING','MONTHLY','AUD',1,1,1)");
  context.client.database.exec("insert into billing_accounts (id,customer_id,provider,provider_customer_id,status,currency,created_at,updated_at) values ('b0000000-0000-4000-8000-000000000010','b0000000-0000-4000-8000-000000000012','stripe','cus_checkout','ACTIVE','AUD',1,1)");
  context.client.database.exec("insert into billing_checkout_sessions (id,customer_id,subscription_id,provider,provider_session_id,idempotency_key,status,expires_at,created_at,updated_at) values ('b0000000-0000-4000-8000-000000000011','b0000000-0000-4000-8000-000000000012','b0000000-0000-4000-8000-000000000013','stripe','cs_checkout','checkout-key','OPEN',1900000000000,1,1)");
  const subscriptions = new D1SubscriptionRepository(context.database);
  const billing = new D1BillingRepository(context.database);
  const references = new D1BillingProviderReferenceRepository(context.database);
  const service = new ProcessBillingWebhookService(new StripeWebhookVerifier(SECRET), new D1BillingWebhookRepository(context.database), new ReconcileBillingEventService(subscriptions, billing, context.ids, context.clock, context.audit, references), context.ids, context.clock, context.audit);
  const completed = stripeEvent("evt_checkout", "checkout.session.completed", { id: "cs_checkout", customer: "cus_checkout", subscription: "sub_checkout", client_reference_id: "b0000000-0000-4000-8000-000000000013", metadata: { zuno_subscription_id: "b0000000-0000-4000-8000-000000000013" } });
  assert.equal((await service.execute(completed, await signed(completed), "request-checkout")).status, "PROCESSED");
  assert.equal((await subscriptions.findByProviderReference("stripe", "sub_checkout"))?.props.id.value, "b0000000-0000-4000-8000-000000000013");
  assert.equal(context.client.database.prepare("select status from billing_checkout_sessions where provider_session_id='cs_checkout'").get()?.status, "COMPLETED");
  const invoice = stripeEvent("evt_invoice", "invoice.finalized", { id: "in_recurring", number: "STRIPE-INV-1", customer: "cus_checkout", subscription: "sub_checkout", currency: "aud", total: 8800, total_excluding_tax: 8000, amount_due: 8800, status_transitions: { finalized_at: TIMESTAMP }, due_date: TIMESTAMP + 86_400 });
  assert.equal((await service.execute(invoice, await signed(invoice), "request-invoice")).status, "PROCESSED");
  const imported = await billing.findInvoiceByProviderReference("in_recurring");
  assert.deepEqual([imported?.props.status, imported?.props.subtotal.amountMinor, imported?.props.tax.amountMinor, imported?.props.total.amountMinor], ["OPEN", 8000, 800, 8800]);
  assert.equal(imported?.props.customerId.value, "b0000000-0000-4000-8000-000000000012");
  context.client.close();
});
