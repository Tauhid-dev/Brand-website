import assert from "node:assert/strict";
import test from "node:test";
import { D1CatalogueRepository } from "../modules/catalogue/infrastructure/d1-catalogue-repository.ts";
import { ApplyCustomerDiscountService, CreateDiscountService, DiscountPricingAdapter } from "../modules/discount/application/discount-services.ts";
import { D1DiscountRepository } from "../modules/discount/infrastructure/d1-discount-repository.ts";
import { PricingService } from "../modules/pricing/application/pricing-services.ts";
import { EffectiveRange } from "../modules/pricing/domain/effective-range.ts";
import { Money } from "../modules/pricing/domain/money.ts";
import { PlanPrice } from "../modules/pricing/domain/pricing.ts";
import { D1PricingRepository } from "../modules/pricing/infrastructure/d1-pricing-repository.ts";
import { EntityId } from "../modules/shared/domain/value-objects.ts";
import { CreateSubscriptionService, EntitlementService, ScheduleSubscriptionPriceService, SubscriptionLifecycleService } from "../modules/subscription/application/subscription-services.ts";
import { D1SubscriptionRepository } from "../modules/subscription/infrastructure/d1-subscription-repository.ts";
import { repositoryDatabase } from "./support/sqlite-d1.ts";

const NOW = new Date("2026-08-23T00:00:00.000Z");
const CUSTOMER_ID = "00000000-0000-4000-8000-000000000001";
const PLAN_ID = "00000000-0000-4000-8000-000000000010";
const PRICE_ID = "00000000-0000-4000-8000-000000000020";

class SequenceIds {
  private value = 100;
  next(): string { return `90000000-0000-4000-8000-${(++this.value).toString().padStart(12, "0")}`; }
}

async function setup() {
  const context = repositoryDatabase();
  context.client.database.exec("insert into customers (id,external_reference,business_name,contact_name,email,status,creation_source,created_at,updated_at) values ('00000000-0000-4000-8000-000000000001','customer-1','Example Plumbing Pty Ltd','Casey Example','casey@example.invalid','ACTIVE','ADMIN',1,1)");
  context.client.database.exec("insert into offerings (id,code,name,category,active,display_order,created_at,updated_at) values ('00000000-0000-4000-8000-000000000030','ai_receptionist','AI Receptionist','AI',1,1,1,1),('00000000-0000-4000-8000-000000000031','whatsapp_agent','WhatsApp Agent','AI',1,2,1,1)");
  context.client.database.exec("insert into plans (id,code,name,active,featured,custom,display_order,created_at,updated_at) values ('00000000-0000-4000-8000-000000000010','growth_engine','Growth Engine',1,1,0,1,1,1)");
  context.client.database.exec("insert into plan_features (id,plan_id,offering_id,included,limit_value,limit_unit,created_at,updated_at) values ('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000030',1,500,'conversations_per_month',1,1),('00000000-0000-4000-8000-000000000041','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000031',0,null,null,1,1)");
  const prices = new D1PricingRepository(context.database);
  await prices.publishPlanPrice(new PlanPrice({
    id: new EntityId(PRICE_ID), planId: new EntityId(PLAN_ID), billingInterval: "MONTHLY",
    amount: new Money(64_900, "AUD"), setupFee: new Money(299_000, "AUD"), taxBehaviour: "EXCLUSIVE",
    effectiveRange: new EffectiveRange(NOW, null), active: true, createdBy: "admin-1", createdAt: NOW,
  }), null);
  const ids = new SequenceIds();
  const clock = { now: () => NOW };
  const subscriptions = new D1SubscriptionRepository(context.database);
  const create = new CreateSubscriptionService(
    subscriptions, prices, new D1CatalogueRepository(context.database), new PricingService(prices), ids, clock,
  );
  return { ...context, prices, subscriptions, create, ids, clock };
}

test("subscription creation atomically snapshots price and plan entitlements", async () => {
  const context = await setup();
  const subscription = await context.create.execute({
    customerId: CUSTOMER_ID, planId: PLAN_ID, billingInterval: "MONTHLY", initialStatus: "ACTIVE",
    currentPeriodStart: NOW, currentPeriodEnd: new Date("2026-09-23T00:00:00.000Z"),
  });
  const price = await context.subscriptions.findPriceAt(subscription.props.id.value, NOW);
  assert.deepEqual([price?.props.baseAmount.amountMinor, price?.props.effectiveAmount.amountMinor, price?.props.setupFee.amountMinor], [64_900, 64_900, 299_000]);
  const entitlements = await new EntitlementService(context.subscriptions, context.clock).getEntitlements(CUSTOMER_ID);
  assert.equal(entitlements?.valid, true);
  assert.deepEqual(entitlements?.entitlements.ai_receptionist, {
    enabled: true, limitValue: 500, limitUnit: "conversations_per_month",
  });
  assert.equal(entitlements?.entitlements.whatsapp_agent?.enabled, false);
  await assert.rejects(context.create.execute({ customerId: CUSTOMER_ID, planId: PLAN_ID, billingInterval: "MONTHLY" }), {
    code: "CURRENT_SUBSCRIPTION_EXISTS",
  });
  context.client.close();
});

test("suspension, resumption, and cancellation revoke service without deleting history", async () => {
  const context = await setup();
  const subscription = await context.create.execute({
    customerId: CUSTOMER_ID, planId: PLAN_ID, billingInterval: "MONTHLY", initialStatus: "ACTIVE",
    currentPeriodStart: NOW, currentPeriodEnd: new Date("2026-09-23T00:00:00.000Z"),
  });
  let now = NOW;
  const lifecycle = new SubscriptionLifecycleService(context.subscriptions, context.ids, { now: () => now });
  now = new Date("2026-08-24T00:00:00.000Z");
  await lifecycle.suspend(subscription.props.id.value);
  assert.equal(await new EntitlementService(context.subscriptions, { now: () => now }).hasEntitlement(CUSTOMER_ID, "ai_receptionist"), false);
  now = new Date("2026-08-25T00:00:00.000Z");
  await lifecycle.resume(subscription.props.id.value);
  assert.equal(await new EntitlementService(context.subscriptions, { now: () => now }).hasEntitlement(CUSTOMER_ID, "ai_receptionist"), true);
  now = new Date("2026-08-26T00:00:00.000Z");
  await lifecycle.cancel(subscription.props.id.value);
  const cancelled = await new EntitlementService(context.subscriptions, { now: () => now }).getEntitlements(CUSTOMER_ID);
  assert.equal(cancelled?.subscriptionStatus, "CANCELLED");
  assert.equal(cancelled?.valid, false);
  assert.equal(context.client.database.prepare("select count(*) as count from subscription_entitlements").get()?.count, 4);
  assert.equal(context.client.database.prepare("select count(*) as count from subscriptions").get()?.count, 1);
  await assert.rejects(lifecycle.resume(subscription.props.id.value), { code: "INVALID_SUBSCRIPTION_TRANSITION" });
  context.client.close();
});

test("database rejects stale concurrent subscription transitions", async () => {
  const context = await setup();
  const created = await context.create.execute({ customerId: CUSTOMER_ID, planId: PLAN_ID, billingInterval: "MONTHLY", initialStatus: "ACTIVE" });
  const firstRead = await context.subscriptions.findById(created.props.id.value);
  const secondRead = await context.subscriptions.findById(created.props.id.value);
  assert.ok(firstRead && secondRead);
  const first = firstRead.transition("SUSPENDED", new Date("2026-08-24T00:00:00.000Z"));
  const stale = secondRead.transition("PAST_DUE", new Date("2026-08-24T00:00:01.000Z"));
  await context.subscriptions.saveTransition(first, new Date("2026-08-24T00:00:00.000Z"), []);
  await assert.rejects(context.subscriptions.saveTransition(stale, null, []), { code: "SUBSCRIPTION_VERSION_CONFLICT" });
  context.client.close();
});

test("future contracted pricing versions close history without rewriting it", async () => {
  const context = await setup();
  const created = await context.create.execute({ customerId: CUSTOMER_ID, planId: PLAN_ID, billingInterval: "MONTHLY", initialStatus: "ACTIVE" });
  const future = new Date("2026-09-01T00:00:00.000Z");
  const schedule = new ScheduleSubscriptionPriceService(context.subscriptions, new PricingService(context.prices), context.ids, context.clock);
  const next = await schedule.execute({ subscriptionId: created.props.id.value, effectiveFrom: future });
  assert.equal(next.props.pricingSource, "RENEWAL");
  assert.equal((await context.subscriptions.findPriceAt(created.props.id.value, NOW))?.props.effectiveRange.effectiveTo?.toISOString(), future.toISOString());
  await assert.rejects(schedule.execute({ subscriptionId: created.props.id.value, effectiveFrom: future }), {
    code: "SUBSCRIPTION_PRICE_CONFLICT",
  });
  context.client.close();
});

test("subscription-scoped discounts cannot leak into unrelated price resolution", async () => {
  const context = await setup();
  const created = await context.create.execute({ customerId: CUSTOMER_ID, planId: PLAN_ID, billingInterval: "MONTHLY", initialStatus: "ACTIVE" });
  const discounts = new D1DiscountRepository(context.database);
  const discount = await new CreateDiscountService(discounts, context.ids, context.clock).execute({
    code: "contract_10", name: "Contract 10%", discountType: "PERCENTAGE", percentOffBasisPoints: 1_000,
    durationType: "FOREVER", startsAt: NOW, stackable: true, createdBy: "admin-1",
  });
  await new ApplyCustomerDiscountService(discounts, context.prices, context.ids, context.clock).execute({
    customerId: CUSTOMER_ID, discountId: discount.props.id.value, subscriptionId: created.props.id.value,
    effectiveFrom: NOW, source: "ADMIN", appliedBy: "admin-1", reason: "Contracted concession",
  });
  const pricing = new PricingService(context.prices, undefined, new DiscountPricingAdapter(discounts));
  assert.equal((await pricing.resolvePrice({ customerId: CUSTOMER_ID, planId: PLAN_ID, subscriptionId: created.props.id.value, billingInterval: "MONTHLY", effectiveAt: NOW })).discountTotalMinor, 6_490);
  assert.equal((await pricing.resolvePrice({ customerId: CUSTOMER_ID, planId: PLAN_ID, billingInterval: "MONTHLY", effectiveAt: NOW })).discountTotalMinor, 0);
  context.client.close();
});
