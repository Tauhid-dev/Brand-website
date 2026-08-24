import assert from "node:assert/strict";
import test from "node:test";
import { AddBillingNoteService, CustomerBillingOverviewService, UpdateCustomerBillingProfileService } from "../modules/billing/application/billing-operations-services.ts";
import { CreateInvoiceService, InvoiceLifecycleService } from "../modules/billing/application/billing-services.ts";
import { D1BillingRepository } from "../modules/billing/infrastructure/d1-billing-repository.ts";
import { D1PricingRepository } from "../modules/pricing/infrastructure/d1-pricing-repository.ts";
import { D1PortalReadRepository } from "../modules/portal/infrastructure/d1-portal-read-repository.ts";
import { D1SubscriptionRepository } from "../modules/subscription/infrastructure/d1-subscription-repository.ts";
import { repositoryDatabase } from "./support/sqlite-d1.ts";
import { NOOP_AUDIT } from "./support/audit.ts";

const CUSTOMER_ID = "c0000000-0000-4000-8000-000000000001";
const ADMIN_ID = "c0000000-0000-4000-8000-000000000002";
class SequenceIds { private value = 10; next() { return `c0000000-0000-4000-8000-${(++this.value).toString().padStart(12, "0")}`; } }

test("billing operations maintain contacts, internal notes, invoice state, and a provider-neutral overview", async () => {
  const context = repositoryDatabase();
  context.client.database.exec(`insert into customers (id,external_reference,business_name,contact_name,email,status,creation_source,created_at,updated_at) values ('${CUSTOMER_ID}','customer-1','Example Plumbing Pty Ltd','Casey Example','casey@example.invalid','ACTIVE','ADMIN',1,1)`);
  context.client.database.exec(`insert into admin_users (id,identity_provider,external_subject,email,display_name,status,bootstrap,created_at,updated_at) values ('${ADMIN_ID}','test','admin-1','admin@example.invalid','Admin','ACTIVE',0,1,1)`);
  const ids = new SequenceIds();
  let now = new Date("2026-08-23T00:00:00.000Z");
  const clock = { now: () => now };
  const billing = new D1BillingRepository(context.database);
  const subscriptions = new D1SubscriptionRepository(context.database);
  const references = new D1PricingRepository(context.database);

  const profileService = new UpdateCustomerBillingProfileService(billing, references, ids, clock, NOOP_AUDIT);
  const profile = await profileService.execute({ customerId: CUSTOMER_ID, contactName: "Accounts Team", contactEmail: "ACCOUNTS@EXAMPLE.INVALID", contactPhone: "02 5550 0100" });
  assert.equal(profile.props.contactEmail.value, "accounts@example.invalid");
  now = new Date("2026-08-23T01:00:00.000Z");
  const updated = await profileService.execute({ customerId: CUSTOMER_ID, contactName: "Finance Team", contactEmail: "finance@example.invalid" });
  assert.equal(updated.props.id.value, profile.props.id.value);

  const invoice = await new CreateInvoiceService(billing, subscriptions, references, ids, clock, NOOP_AUDIT).execute({ customerId: CUSTOMER_ID, invoiceNumber: "ZP-OPS-1", currency: "AUD", lines: [{ description: "Service", quantity: 1, unitAmountMinor: 10_000, taxMinor: 1_000 }] });
  const dueAt = new Date("2026-08-23T02:00:00.000Z");
  await new InvoiceLifecycleService(billing, clock, NOOP_AUDIT).issue(invoice.props.id.value, dueAt);
  await new AddBillingNoteService(billing, subscriptions, references, ids, clock, NOOP_AUDIT).execute({ customerId: CUSTOMER_ID, invoiceId: invoice.props.id.value, body: "Customer requested payment follow-up next week.", authorAdminUserId: ADMIN_ID });
  now = new Date("2026-08-25T00:00:00.000Z");
  const overview = await new CustomerBillingOverviewService(billing, subscriptions, clock).execute(CUSTOMER_ID);
  assert.equal(overview.paymentState, "PAYMENT_OVERDUE");
  assert.equal(overview.profile?.contactName, "Finance Team");
  assert.equal(overview.notes.length, 1);
  assert.equal(overview.invoices[0]?.paymentState, "PAYMENT_OVERDUE");
  const dashboard = await new D1PortalReadRepository(context.database).getBilling(now);
  assert.equal(dashboard.invoices[0]?.lineCount, 1);
  assert.equal(dashboard.invoices[0]?.paymentState, "PAYMENT_OVERDUE");
  context.client.close();
});
