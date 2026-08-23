import assert from "node:assert/strict";
import test from "node:test";
import { seedDevelopmentCatalogue } from "../db/seeds/development.ts";
import { seedDevelopmentPrices } from "../db/seeds/development-pricing.ts";
import { D1CatalogueRepository } from "../modules/catalogue/infrastructure/d1-catalogue-repository.ts";
import { EffectiveRange } from "../modules/pricing/domain/effective-range.ts";
import { Money } from "../modules/pricing/domain/money.ts";
import { CustomerPriceOverride, PlanPrice } from "../modules/pricing/domain/pricing.ts";
import { D1PricingRepository } from "../modules/pricing/infrastructure/d1-pricing-repository.ts";
import { EntityId } from "../modules/shared/domain/value-objects.ts";
import { repositoryDatabase } from "./support/sqlite-d1.ts";

const NOW = new Date("2026-08-23T00:00:00.000Z");
const CUSTOMER_ID = "00000000-0000-4000-8000-000000000001";
const PLAN_ID = "00000000-0000-4000-8000-000000000010";

function insertReferences(database: ReturnType<typeof repositoryDatabase>["client"]["database"]): void {
  database.exec("insert into customers (id,external_reference,business_name,contact_name,email,status,creation_source,created_at,updated_at) values ('00000000-0000-4000-8000-000000000001','customer-1','Example Plumbing Pty Ltd','Casey Example','casey@example.invalid','ACTIVE','ADMIN',1,1)");
  database.exec("insert into plans (id,code,name,active,featured,custom,display_order,created_at,updated_at) values ('00000000-0000-4000-8000-000000000010','growth_engine','Growth Engine',1,1,0,1,1,1)");
}

function planPrice(id: string, from: Date, amountMinor = 64_900): PlanPrice {
  return new PlanPrice({
    id: new EntityId(id),
    planId: new EntityId(PLAN_ID),
    billingInterval: "MONTHLY",
    amount: new Money(amountMinor, "AUD"),
    setupFee: new Money(299_000, "AUD"),
    taxBehaviour: "EXCLUSIVE",
    effectiveRange: new EffectiveRange(from, null),
    active: true,
    createdBy: "admin-1",
    createdAt: NOW,
  });
}

test("D1 pricing repository publishes, closes, and resolves price versions", async () => {
  const { client, database } = repositoryDatabase();
  insertReferences(client.database);
  const repository = new D1PricingRepository(database);
  await repository.publishPlanPrice(
    planPrice("00000000-0000-4000-8000-000000000020", NOW),
    null,
  );
  const nextFrom = new Date("2026-09-01T00:00:00.000Z");
  await repository.publishPlanPrice(
    planPrice("00000000-0000-4000-8000-000000000021", nextFrom, 69_900),
    "00000000-0000-4000-8000-000000000020",
  );
  assert.equal((await repository.findPlanPriceAt(PLAN_ID, "MONTHLY", NOW))?.props.amount.amountMinor, 64_900);
  assert.equal((await repository.findPlanPriceAt(PLAN_ID, "MONTHLY", nextFrom))?.props.amount.amountMinor, 69_900);
  assert.equal(await repository.planExists(PLAN_ID), true);
  assert.equal(await repository.customerExists(CUSTOMER_ID), true);
  assert.equal((await repository.findActivePlanByCode("growth_engine"))?.id, PLAN_ID);
  client.close();
});

test("D1 pricing repository maps database override conflicts to a stable code", async () => {
  const { client, database } = repositoryDatabase();
  insertReferences(client.database);
  const repository = new D1PricingRepository(database);
  const first = new CustomerPriceOverride({
    id: new EntityId("00000000-0000-4000-8000-000000000030"),
    customerId: new EntityId(CUSTOMER_ID),
    planId: new EntityId(PLAN_ID),
    billingInterval: "MONTHLY",
    amount: new Money(54_900, "AUD"),
    setupFee: new Money(0, "AUD"),
    effectiveRange: new EffectiveRange(NOW, null),
    reason: "Negotiated agreement",
    status: "ACTIVE",
    createdBy: "admin-1",
    createdAt: NOW,
    updatedAt: NOW,
  });
  await repository.saveCustomerOverride(first);
  const conflicting = new CustomerPriceOverride({
    ...first.props,
    id: new EntityId("00000000-0000-4000-8000-000000000031"),
    amount: new Money(49_900, "AUD"),
  });
  await assert.rejects(repository.saveCustomerOverride(conflicting), {
    code: "PRICE_OVERRIDE_CONFLICT",
  });
  assert.equal((await repository.findCustomerOverrideAt(
    CUSTOMER_ID,
    PLAN_ID,
    "MONTHLY",
    NOW,
  ))?.props.amount.amountMinor, 54_900);
  client.close();
});

test("development pricing fixtures are separate and idempotent", async () => {
  const { client, database } = repositoryDatabase();
  const catalogue = new D1CatalogueRepository(database);
  const pricing = new D1PricingRepository(database);
  await seedDevelopmentCatalogue(catalogue);
  await seedDevelopmentPrices(catalogue, pricing);
  await seedDevelopmentPrices(catalogue, pricing);
  assert.equal(client.database.prepare("select count(*) as count from plan_prices").get()?.count, 4);
  assert.equal(client.database.prepare("select amount_minor from plan_prices where plan_id = (select id from plans where code = 'growth_engine')").get()?.amount_minor, 64_900);
  client.close();
});
