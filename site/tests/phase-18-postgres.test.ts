import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import pg from "pg";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema.ts";
import { closePostgresPoolForTests, createPostgresD1Binding } from "../db/postgres-d1-adapter.ts";
import { D1CustomerRepository } from "../modules/customer/infrastructure/d1-customer-repositories.ts";
import { Customer, CustomerBusinessProfile } from "../modules/customer/domain/customer.ts";
import { EmailAddress, EntityId } from "../modules/shared/domain/value-objects.ts";
import { EffectiveRange } from "../modules/pricing/domain/effective-range.ts";
import { Money } from "../modules/pricing/domain/money.ts";
import { CustomerPriceOverride, PlanPrice } from "../modules/pricing/domain/pricing.ts";
import { D1PricingRepository } from "../modules/pricing/infrastructure/d1-pricing-repository.ts";
import { BootstrapFirstAdminService } from "../modules/identity/application/access-control-services.ts";
import { createExternalIdentity } from "../modules/identity/domain/access-control.ts";
import { D1AdminAccessRepository } from "../modules/identity/infrastructure/d1-admin-access-repository.ts";
import { RecordingAudit } from "./support/audit.ts";

const url = process.env.TEST_POSTGRES_URL;
const NOW = new Date("2026-08-26T00:00:00.000Z");

test("PostgreSQL clean migration and shared repositories preserve core invariants", { skip: !url }, async () => {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  await pool.query("drop schema if exists public cascade; create schema public");
  await pool.end();
  await command("node", ["scripts/postgres-migrate.mjs"], { DATABASE_RUNTIME: "postgres", DATABASE_URL: url! });
  const binding = await createPostgresD1Binding(url!);
  const db = drizzle(binding, { schema });
  const customerId = new EntityId("18000000-0000-4000-8000-000000000001");
  const customer = Customer.create({ id: customerId, externalReference: "phase-18-customer", businessName: "Portable Pty Ltd", contactName: "OCI Customer", email: new EmailAddress("oci@example.invalid"), phone: null, industry: "Technology", websiteUrl: null, status: "ACTIVE", creationSource: "ADMIN", createdAt: NOW, updatedAt: NOW });
  const profile = new CustomerBusinessProfile({ id: new EntityId("18000000-0000-4000-8000-000000000002"), customerId, businessName: "Portable Pty Ltd", tradingName: null, abn: null, websiteUrl: null, primaryEmail: customer.snapshot.email, primaryPhone: null, industry: "Technology", timezone: "Australia/Sydney", country: "AU", state: "NSW", suburb: null, postcode: null, createdAt: NOW, updatedAt: NOW });
  const customers = new D1CustomerRepository(db);
  await customers.save(customer, profile);
  assert.equal((await customers.findByEmail("oci@example.invalid"))?.snapshot.id.value, customerId.value);
  await db.insert(schema.plans).values({ id: "18000000-0000-4000-8000-000000000010", code: "portable", name: "Portable", active: true, featured: false, custom: false, displayOrder: 1, createdAt: NOW, updatedAt: NOW });
  const pricing = new D1PricingRepository(db);
  await pricing.publishPlanPrice(new PlanPrice({ id: new EntityId("18000000-0000-4000-8000-000000000020"), planId: new EntityId("18000000-0000-4000-8000-000000000010"), billingInterval: "MONTHLY", amount: new Money(10_000, "AUD"), setupFee: new Money(0, "AUD"), taxBehaviour: "EXCLUSIVE", effectiveRange: new EffectiveRange(NOW, null), active: true, createdBy: "bootstrap", createdAt: NOW }), null);
  const override = new CustomerPriceOverride({ id: new EntityId("18000000-0000-4000-8000-000000000030"), customerId, planId: new EntityId("18000000-0000-4000-8000-000000000010"), billingInterval: "MONTHLY", amount: new Money(9_000, "AUD"), setupFee: new Money(0, "AUD"), effectiveRange: new EffectiveRange(NOW, null), reason: "Contract", status: "ACTIVE", createdBy: "bootstrap", createdAt: NOW, updatedAt: NOW });
  await pricing.saveCustomerOverride(override);
  await assert.rejects(() => pricing.saveCustomerOverride(new CustomerPriceOverride({ ...override.props, id: new EntityId("18000000-0000-4000-8000-000000000031") })), { code: "PRICE_OVERRIDE_CONFLICT" });
  const admins = new D1AdminAccessRepository(db);
  const ids = { next: () => "18000000-0000-4000-8000-000000000040" };
  const bootstrap = new BootstrapFirstAdminService(admins, ids, { now: () => NOW }, new RecordingAudit());
  await bootstrap.execute(createExternalIdentity({ provider: "company-oidc", externalSubject: "admin-sub", email: "admin@example.invalid", displayName: "Admin" }));
  await assert.rejects(() => bootstrap.execute(createExternalIdentity({ provider: "company-oidc", externalSubject: "admin-2", email: "admin2@example.invalid", displayName: "Admin 2" })), { code: "ADMIN_BOOTSTRAP_CLOSED" });
  const verification = new pg.Pool({ connectionString: url, max: 1 });
  assert.equal(Number((await verification.query("select count(*) from information_schema.tables where table_schema='public' and table_name <> '_zuno_postgres_migrations'")).rows[0].count), 50);
  assert.equal(Number((await verification.query("select count(*) from admin_users where bootstrap=1")).rows[0].count), 1);
  await verification.end();
  await closePostgresPoolForTests();
});

function command(executable: string, args: string[], environment: Record<string, string>) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { cwd: process.cwd(), env: { ...process.env, ...environment }, stdio: "inherit" });
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${executable} exited ${code}`)));
    child.on("error", reject);
  });
}
