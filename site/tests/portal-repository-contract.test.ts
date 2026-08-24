import assert from "node:assert/strict";
import test from "node:test";
import { D1PortalReadRepository } from "../modules/portal/infrastructure/d1-portal-read-repository.ts";
import { CustomerPortalQueryService } from "../modules/portal/application/portal-access.ts";
import { repositoryDatabase } from "./support/sqlite-d1.ts";

const CUSTOMER_ID = "80000000-0000-4000-8000-000000000001";

function seedCustomer() {
  const context = repositoryDatabase();
  context.client.database.exec(`
    insert into customers (id, external_reference, business_name, contact_name, email, phone, industry, status, creation_source, created_at, updated_at)
    values ('${CUSTOMER_ID}', 'ZP-8001', 'Portal Test Pty Ltd', 'Taylor Test', 'taylor@example.invalid', '0400000000', 'Trades', 'ACTIVE', 'ADMIN', 1787529600000, 1787529600000);
    insert into customer_notes (id, customer_id, body, author_type, author_id, created_at)
    values ('80000000-0000-4000-8000-000000000002', '${CUSTOMER_ID}', 'Internal commercial note', 'ADMIN', 'admin-1', 1787529600000);
  `);
  return context;
}

test("customer portal read model is customer-scoped and never exposes internal notes", async () => {
  const context = seedCustomer();
  const read = new D1PortalReadRepository(context.database);
  const account = await new CustomerPortalQueryService(read).execute({ type: "CUSTOMER", customerId: CUSTOMER_ID, identityId: "identity-1", email: "taylor@example.invalid" });
  assert.equal(account?.customer.businessName, "Portal Test Pty Ltd");
  assert.equal(JSON.stringify(account).includes("Internal commercial note"), false);
  assert.equal(Object.hasOwn(account ?? {}, "notes"), false);
  context.client.close();
});

test("admin customer read model includes internal notes and supports commercial search fields", async () => {
  const context = seedCustomer();
  const read = new D1PortalReadRepository(context.database);
  const customer = await read.getAdminCustomer(CUSTOMER_ID);
  assert.equal(customer?.notes[0]?.body, "Internal commercial note");
  assert.equal((await read.searchCustomers({ query: "0400000000" }))[0]?.id, CUSTOMER_ID);
  assert.equal((await read.searchCustomers({ query: "ZP-8001" }))[0]?.businessName, "Portal Test Pty Ltd");
  context.client.close();
});

test("admin dashboard reports durable customer records", async () => {
  const context = seedCustomer();
  const dashboard = await new D1PortalReadRepository(context.database).getAdminDashboard();
  assert.equal(dashboard.metrics.customers, 1);
  assert.equal(dashboard.recentCustomers[0]?.id, CUSTOMER_ID);
  context.client.close();
});
