import assert from "node:assert/strict";
import test from "node:test";
import { CreateInvoiceService, InvoiceLifecycleService, LinkBillingAccountService, RecordPaymentReminderOutcomeService, SchedulePaymentReminderService } from "../modules/billing/application/billing-services.ts";
import { D1BillingRepository } from "../modules/billing/infrastructure/d1-billing-repository.ts";
import { D1PricingRepository } from "../modules/pricing/infrastructure/d1-pricing-repository.ts";
import { D1SubscriptionRepository } from "../modules/subscription/infrastructure/d1-subscription-repository.ts";
import { repositoryDatabase } from "./support/sqlite-d1.ts";

const NOW = new Date("2026-08-23T00:00:00.000Z");
const CUSTOMER_ID = "00000000-0000-4000-8000-000000000001";
class SequenceIds {
  private value = 200;
  next(): string { return `a0000000-0000-4000-8000-${(++this.value).toString().padStart(12, "0")}`; }
}

function setup() {
  const context = repositoryDatabase();
  context.client.database.exec("insert into customers (id,external_reference,business_name,contact_name,email,status,creation_source,created_at,updated_at) values ('00000000-0000-4000-8000-000000000001','customer-1','Example Plumbing Pty Ltd','Casey Example','casey@example.invalid','ACTIVE','ADMIN',1,1)");
  const ids = new SequenceIds();
  const clock = { now: () => NOW };
  const repository = new D1BillingRepository(context.database);
  const references = new D1PricingRepository(context.database);
  return { ...context, ids, clock, repository, references };
}

test("billing account, invoice history, lifecycle, and reminders remain provider-neutral", async () => {
  const context = setup();
  const account = await new LinkBillingAccountService(context.repository, context.references, context.ids, context.clock).execute({
    customerId: CUSTOMER_ID, provider: "ExamplePay", providerCustomerId: "provider-customer-1", currency: "AUD",
  });
  assert.equal(account.props.provider, "examplepay");
  const invoice = await new CreateInvoiceService(
    context.repository, new D1SubscriptionRepository(context.database), context.references, context.ids, context.clock,
  ).execute({
    customerId: CUSTOMER_ID, billingAccountId: account.props.id.value, invoiceNumber: "ZP-2026-0001",
    currency: "AUD", lines: [{ description: "Growth Engine", quantity: 1, unitAmountMinor: 64_900, taxMinor: 6_490 }],
  });
  let now = NOW;
  const lifecycle = new InvoiceLifecycleService(context.repository, { now: () => now });
  const dueAt = new Date("2026-09-06T00:00:00.000Z");
  const open = await lifecycle.issue(invoice.props.id.value, dueAt);
  assert.deepEqual([open.props.subtotal.amountMinor, open.props.tax.amountMinor, open.props.total.amountMinor], [64_900, 6_490, 71_390]);
  const schedule = new SchedulePaymentReminderService(context.repository, context.ids, { now: () => now });
  const reminder = await schedule.execute({ invoiceId: invoice.props.id.value, stage: "DUE", scheduledFor: dueAt, idempotencyKey: "invoice-1-due" });
  await assert.rejects(schedule.execute({ invoiceId: invoice.props.id.value, stage: "DUE", scheduledFor: dueAt, idempotencyKey: "invoice-1-due" }), {
    code: "DUPLICATE_PAYMENT_REMINDER",
  });
  now = dueAt;
  const sent = await new RecordPaymentReminderOutcomeService(context.repository, { now: () => now }).execute(reminder, { sent: true });
  assert.equal(sent.props.status, "SENT");
  now = new Date("2026-09-07T00:00:00.000Z");
  const paid = await lifecycle.markPaid(invoice.props.id.value);
  assert.equal(paid.props.amountDue.amountMinor, 0);
  assert.equal((await context.repository.listInvoiceHistory(CUSTOMER_ID, 10))[0]?.props.lines.length, 1);
  assert.throws(() => context.client.database.exec(`update invoice_lines set total_minor = 1 where invoice_id = '${invoice.props.id.value}'`), /INVOICE_LINES_IMMUTABLE/);
  context.client.close();
});
