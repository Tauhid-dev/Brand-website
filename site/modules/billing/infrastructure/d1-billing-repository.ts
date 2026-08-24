import { and, desc, eq } from "drizzle-orm";
import type { AppDatabase } from "../../../db/index.ts";
import { billingAccounts, billingNotes, customerBillingProfiles, invoiceLines, invoices, paymentReminders } from "../../../db/schema.ts";
import { Money } from "../../pricing/domain/money.ts";
import { DomainConflictError } from "../../shared/domain/errors.ts";
import { EmailAddress, EntityId } from "../../shared/domain/value-objects.ts";
import type { BillingRepository } from "../application/ports.ts";
import {
  BillingAccount,
  BillingNote,
  CustomerBillingProfile,
  Invoice,
  InvoiceLine,
  PaymentReminder,
  type BillingAccountStatus,
  type InvoiceStatus,
  type PaymentReminderStage,
  type PaymentReminderStatus,
} from "../domain/billing.ts";

export class D1BillingRepository implements BillingRepository {
  constructor(private readonly db: AppDatabase) {}

  async findAccount(customerId: string, provider: string): Promise<BillingAccount | null> {
    const [row] = await this.db.select().from(billingAccounts).where(and(
      eq(billingAccounts.customerId, customerId), eq(billingAccounts.provider, provider),
    )).limit(1);
    return row ? mapAccount(row) : null;
  }
  async saveAccount(account: BillingAccount): Promise<void> {
    const value = account.props;
    try { await this.db.insert(billingAccounts).values({
      id: value.id.value, customerId: value.customerId.value, provider: value.provider,
      providerCustomerId: value.providerCustomerId, status: value.status, currency: value.currency,
      createdAt: value.createdAt, updatedAt: value.updatedAt,
    }); } catch (error) { throw mapBillingConflict(error); }
  }

  async findCustomerProfile(customerId: string): Promise<CustomerBillingProfile | null> {
    const [row] = await this.db.select().from(customerBillingProfiles).where(eq(customerBillingProfiles.customerId, customerId)).limit(1);
    return row ? mapCustomerProfile(row) : null;
  }
  async saveCustomerProfile(profile: CustomerBillingProfile): Promise<void> {
    const value = profile.props;
    try {
      await this.db.insert(customerBillingProfiles).values({
        id: value.id.value, customerId: value.customerId.value, contactName: value.contactName,
        contactEmail: value.contactEmail.value, contactPhone: value.contactPhone,
        createdAt: value.createdAt, updatedAt: value.updatedAt,
      }).onConflictDoUpdate({
        target: customerBillingProfiles.customerId,
        set: { contactName: value.contactName, contactEmail: value.contactEmail.value, contactPhone: value.contactPhone, updatedAt: value.updatedAt },
      });
    } catch (error) { throw mapBillingConflict(error); }
  }
  async saveBillingNote(note: BillingNote): Promise<void> {
    const value = note.props;
    try { await this.db.insert(billingNotes).values({
      id: value.id.value, customerId: value.customerId.value,
      subscriptionId: value.subscriptionId?.value ?? null, invoiceId: value.invoiceId?.value ?? null,
      body: value.body, authorAdminUserId: value.authorAdminUserId.value, createdAt: value.createdAt,
    }); } catch (error) { throw mapBillingConflict(error); }
  }
  async listBillingNotes(customerId: string, limit: number): Promise<BillingNote[]> {
    const rows = await this.db.select().from(billingNotes).where(eq(billingNotes.customerId, customerId))
      .orderBy(desc(billingNotes.createdAt)).limit(Math.min(Math.max(limit, 1), 200));
    return rows.map(mapBillingNote);
  }

  async findInvoiceById(id: string): Promise<Invoice | null> {
    const [row] = await this.db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    return row ? this.mapInvoice(row) : null;
  }
  async findInvoiceByProviderReference(providerInvoiceId: string): Promise<Invoice | null> {
    const [row] = await this.db.select().from(invoices).where(eq(invoices.providerInvoiceId, providerInvoiceId)).limit(1);
    return row ? this.mapInvoice(row) : null;
  }
  async listInvoiceHistory(customerId: string, limit: number): Promise<Invoice[]> {
    const rows = await this.db.select().from(invoices).where(eq(invoices.customerId, customerId))
      .orderBy(desc(invoices.createdAt)).limit(limit);
    return Promise.all(rows.map((row) => this.mapInvoice(row)));
  }
  async saveInvoice(invoice: Invoice): Promise<void> {
    const value = invoice.props;
    type BatchItem = Parameters<AppDatabase["batch"]>[0][number];
    const statements: BatchItem[] = [
      this.db.insert(invoices).values(invoiceValues(invoice)),
      ...value.lines.map((line) => this.db.insert(invoiceLines).values(lineValues(line))),
    ];
    try {
      await this.db.batch(statements as [BatchItem, ...BatchItem[]]);
    } catch (error) { throw mapBillingConflict(error); }
  }
  async saveInvoiceTransition(invoice: Invoice): Promise<void> {
    const value = invoice.props;
    try { await this.db.update(invoices).set({
      status: value.status, amountDueMinor: value.amountDue.amountMinor,
      issuedAt: value.issuedAt, dueAt: value.dueAt, paidAt: value.paidAt, updatedAt: value.updatedAt,
    }).where(eq(invoices.id, value.id.value)); } catch (error) { throw mapBillingConflict(error); }
  }

  async findReminderByIdempotencyKey(key: string): Promise<PaymentReminder | null> {
    const [row] = await this.db.select().from(paymentReminders).where(eq(paymentReminders.idempotencyKey, key)).limit(1);
    return row ? mapReminder(row) : null;
  }
  async saveReminder(reminder: PaymentReminder): Promise<void> {
    try { await this.db.insert(paymentReminders).values(reminderValues(reminder)); }
    catch (error) { throw mapBillingConflict(error); }
  }
  async saveReminderOutcome(reminder: PaymentReminder): Promise<void> {
    const value = reminder.props;
    try { await this.db.update(paymentReminders).set({
      status: value.status, sentAt: value.sentAt, failureCode: value.failureCode, updatedAt: value.updatedAt,
    }).where(eq(paymentReminders.id, value.id.value)); } catch (error) { throw mapBillingConflict(error); }
  }

  private async mapInvoice(row: typeof invoices.$inferSelect): Promise<Invoice> {
    const rows = await this.db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, row.id));
    return new Invoice({
      id: new EntityId(row.id), customerId: new EntityId(row.customerId),
      subscriptionId: row.subscriptionId ? new EntityId(row.subscriptionId) : null,
      billingAccountId: row.billingAccountId ? new EntityId(row.billingAccountId) : null,
      invoiceNumber: row.invoiceNumber, providerInvoiceId: row.providerInvoiceId,
      status: row.status as InvoiceStatus, currency: row.currency,
      subtotal: new Money(row.subtotalMinor, row.currency), tax: new Money(row.taxMinor, row.currency),
      total: new Money(row.totalMinor, row.currency), amountDue: new Money(row.amountDueMinor, row.currency),
      issuedAt: row.issuedAt, dueAt: row.dueAt, paidAt: row.paidAt,
      lines: rows.map((line) => mapLine(line, row.currency)), createdAt: row.createdAt, updatedAt: row.updatedAt,
    });
  }
}

function mapCustomerProfile(row: typeof customerBillingProfiles.$inferSelect): CustomerBillingProfile {
  return new CustomerBillingProfile({
    id: new EntityId(row.id), customerId: new EntityId(row.customerId), contactName: row.contactName,
    contactEmail: new EmailAddress(row.contactEmail), contactPhone: row.contactPhone,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  });
}
function mapBillingNote(row: typeof billingNotes.$inferSelect): BillingNote {
  return new BillingNote({
    id: new EntityId(row.id), customerId: new EntityId(row.customerId),
    subscriptionId: row.subscriptionId ? new EntityId(row.subscriptionId) : null,
    invoiceId: row.invoiceId ? new EntityId(row.invoiceId) : null, body: row.body,
    authorAdminUserId: new EntityId(row.authorAdminUserId), createdAt: row.createdAt,
  });
}

function mapAccount(row: typeof billingAccounts.$inferSelect): BillingAccount {
  return new BillingAccount({
    id: new EntityId(row.id), customerId: new EntityId(row.customerId), provider: row.provider,
    providerCustomerId: row.providerCustomerId, status: row.status as BillingAccountStatus,
    currency: row.currency, createdAt: row.createdAt, updatedAt: row.updatedAt,
  });
}
function mapLine(row: typeof invoiceLines.$inferSelect, currency: string): InvoiceLine {
  return new InvoiceLine({
    id: new EntityId(row.id), invoiceId: new EntityId(row.invoiceId), description: row.description,
    quantity: row.quantity, unitAmount: new Money(row.unitAmountMinor, currency),
    subtotal: new Money(row.subtotalMinor, currency), tax: new Money(row.taxMinor, currency),
    total: new Money(row.totalMinor, currency), createdAt: row.createdAt,
  });
}
function mapReminder(row: typeof paymentReminders.$inferSelect): PaymentReminder {
  return new PaymentReminder({
    id: new EntityId(row.id), invoiceId: new EntityId(row.invoiceId), stage: row.stage as PaymentReminderStage,
    status: row.status as PaymentReminderStatus, idempotencyKey: row.idempotencyKey,
    scheduledFor: row.scheduledFor, sentAt: row.sentAt, failureCode: row.failureCode,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  });
}
function invoiceValues(invoice: Invoice) {
  const value = invoice.props;
  return {
    id: value.id.value, customerId: value.customerId.value, subscriptionId: value.subscriptionId?.value ?? null,
    billingAccountId: value.billingAccountId?.value ?? null, invoiceNumber: value.invoiceNumber,
    providerInvoiceId: value.providerInvoiceId, status: value.status, currency: value.currency,
    subtotalMinor: value.subtotal.amountMinor, taxMinor: value.tax.amountMinor,
    totalMinor: value.total.amountMinor, amountDueMinor: value.amountDue.amountMinor,
    issuedAt: value.issuedAt, dueAt: value.dueAt, paidAt: value.paidAt,
    createdAt: value.createdAt, updatedAt: value.updatedAt,
  };
}
function lineValues(line: InvoiceLine) {
  const value = line.props;
  return {
    id: value.id.value, invoiceId: value.invoiceId.value, description: value.description,
    quantity: value.quantity, unitAmountMinor: value.unitAmount.amountMinor,
    subtotalMinor: value.subtotal.amountMinor, taxMinor: value.tax.amountMinor,
    totalMinor: value.total.amountMinor, createdAt: value.createdAt,
  };
}
function reminderValues(reminder: PaymentReminder) {
  const value = reminder.props;
  return {
    id: value.id.value, invoiceId: value.invoiceId.value, stage: value.stage, status: value.status,
    idempotencyKey: value.idempotencyKey, scheduledFor: value.scheduledFor,
    sentAt: value.sentAt, failureCode: value.failureCode, createdAt: value.createdAt, updatedAt: value.updatedAt,
  };
}
function mapBillingConflict(error: unknown): DomainConflictError {
  if (errorChainIncludes(error, "INVOICE_CUSTOMER_MISMATCH")) return new DomainConflictError("INVOICE_CUSTOMER_MISMATCH", "Invoice references must belong to the same customer.");
  if (errorChainIncludes(error, "INVOICE_TERMS_IMMUTABLE") || errorChainIncludes(error, "INVALID_INVOICE_TRANSITION")) return new DomainConflictError("INVALID_INVOICE_TRANSITION", "Invoice operation conflicts with current state.");
  if (errorChainIncludes(error, "payment_reminders") && errorChainIncludes(error, "UNIQUE")) return new DomainConflictError("DUPLICATE_PAYMENT_REMINDER", "Payment reminder already exists.");
  if (errorChainIncludes(error, "billing_accounts") && errorChainIncludes(error, "UNIQUE")) return new DomainConflictError("BILLING_ACCOUNT_EXISTS", "Billing account already exists.");
  throw error;
}
function errorChainIncludes(error: unknown, value: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    if (current.message.includes(value)) return true;
    current = current.cause;
  }
  return false;
}
