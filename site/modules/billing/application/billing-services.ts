import type { PricingReferenceRepository } from "../../pricing/application/ports.ts";
import { Money } from "../../pricing/domain/money.ts";
import type { Clock, IdGenerator } from "../../shared/application/ports.ts";
import type { AuditRecorder } from "../../audit/application/ports.ts";
import { AUDIT_ACTIONS } from "../../audit/domain/audit-event.ts";
import { DomainConflictError, DomainValidationError } from "../../shared/domain/errors.ts";
import { EntityId } from "../../shared/domain/value-objects.ts";
import type { SubscriptionRepository } from "../../subscription/application/ports.ts";
import { BillingAccount, Invoice, InvoiceLine, PaymentReminder, type InvoiceStatus, type PaymentReminderStage } from "../domain/billing.ts";
import type { BillingRepository } from "./ports.ts";

export class LinkBillingAccountService {
  constructor(private readonly repository: BillingRepository, private readonly references: PricingReferenceRepository, private readonly ids: IdGenerator, private readonly clock: Clock, private readonly audit: AuditRecorder) {}
  async execute(input: { customerId: string; provider: string; providerCustomerId: string; currency: string }): Promise<BillingAccount> {
    if (!await this.references.customerExists(input.customerId)) throw new DomainConflictError("CUSTOMER_NOT_FOUND", "Customer does not exist.");
    if (await this.repository.findAccount(input.customerId, input.provider.toLowerCase())) throw new DomainConflictError("BILLING_ACCOUNT_EXISTS", "Customer already has an account for this billing provider.");
    const now = this.clock.now();
    const account = new BillingAccount({
      id: new EntityId(this.ids.next()), customerId: new EntityId(input.customerId), provider: input.provider,
      providerCustomerId: input.providerCustomerId, status: "ACTIVE", currency: input.currency,
      createdAt: now, updatedAt: now,
    });
    await this.repository.saveAccount(account);
    await this.audit.record({ action: AUDIT_ACTIONS.billingAccountLinked, entityType: "BILLING_ACCOUNT", entityId: account.props.id.value, after: account.props });
    return account;
  }
}

export class CreateInvoiceService {
  constructor(
    private readonly repository: BillingRepository, private readonly subscriptions: SubscriptionRepository,
    private readonly references: PricingReferenceRepository, private readonly ids: IdGenerator, private readonly clock: Clock,
    private readonly audit: AuditRecorder,
  ) {}
  async execute(input: {
    customerId: string; subscriptionId?: string | null; billingAccountId?: string | null;
    invoiceNumber: string; providerInvoiceId?: string | null; currency: string;
    lines: readonly { description: string; quantity: number; unitAmountMinor: number; taxMinor: number }[];
  }): Promise<Invoice> {
    if (!await this.references.customerExists(input.customerId)) throw new DomainConflictError("CUSTOMER_NOT_FOUND", "Customer does not exist.");
    if (input.lines.length === 0) throw new DomainValidationError("INVOICE_LINES_REQUIRED", "An invoice requires at least one line.");
    if (input.subscriptionId) {
      const subscription = await this.subscriptions.findById(input.subscriptionId);
      if (!subscription || subscription.props.customerId.value !== input.customerId) throw new DomainConflictError("SUBSCRIPTION_CUSTOMER_MISMATCH", "Subscription does not belong to this customer.");
    }
    const now = this.clock.now();
    const invoiceId = new EntityId(this.ids.next());
    const lines = input.lines.map((line) => {
      const unit = new Money(line.unitAmountMinor, input.currency);
      const subtotal = new Money(line.unitAmountMinor * line.quantity, input.currency);
      const tax = new Money(line.taxMinor, input.currency);
      return new InvoiceLine({
        id: new EntityId(this.ids.next()), invoiceId, description: line.description, quantity: line.quantity,
        unitAmount: unit, subtotal, tax, total: subtotal.add(tax), createdAt: now,
      });
    });
    const subtotal = sum(lines.map((line) => line.props.subtotal), input.currency);
    const tax = sum(lines.map((line) => line.props.tax), input.currency);
    const total = subtotal.add(tax);
    const invoice = new Invoice({
      id: invoiceId, customerId: new EntityId(input.customerId),
      subscriptionId: input.subscriptionId ? new EntityId(input.subscriptionId) : null,
      billingAccountId: input.billingAccountId ? new EntityId(input.billingAccountId) : null,
      invoiceNumber: input.invoiceNumber, providerInvoiceId: input.providerInvoiceId ?? null,
      status: "DRAFT", currency: input.currency, subtotal, tax, total, amountDue: total,
      issuedAt: null, dueAt: null, paidAt: null, lines, createdAt: now, updatedAt: now,
    });
    await this.repository.saveInvoice(invoice);
    await this.audit.record({ action: AUDIT_ACTIONS.invoiceCreated, entityType: "INVOICE", entityId: invoice.props.id.value, after: invoice.props });
    return invoice;
  }
}

export class InvoiceLifecycleService {
  constructor(private readonly repository: BillingRepository, private readonly clock: Clock, private readonly audit: AuditRecorder) {}
  async transition(invoiceId: string, to: InvoiceStatus, dueAt?: Date): Promise<Invoice> {
    const current = await this.repository.findInvoiceById(invoiceId);
    if (!current) throw new DomainConflictError("INVOICE_NOT_FOUND", "Invoice does not exist.");
    if (to === "OPEN" && (!dueAt || dueAt < this.clock.now())) throw new DomainValidationError("INVALID_INVOICE_DUE_DATE", "Open invoices require a due date that is not in the past.");
    const next = current.transition(to, this.clock.now(), dueAt);
    await this.repository.saveInvoiceTransition(next);
    await this.audit.record({ action: AUDIT_ACTIONS.invoiceChanged, entityType: "INVOICE", entityId: invoiceId, before: current.props, after: next.props });
    return next;
  }
  issue(id: string, dueAt: Date) { return this.transition(id, "OPEN", dueAt); }
  markPaid(id: string) { return this.transition(id, "PAID"); }
  void(id: string) { return this.transition(id, "VOID"); }
  markUncollectible(id: string) { return this.transition(id, "UNCOLLECTIBLE"); }
}

export class SchedulePaymentReminderService {
  constructor(private readonly repository: BillingRepository, private readonly ids: IdGenerator, private readonly clock: Clock, private readonly audit: AuditRecorder) {}
  async execute(input: { invoiceId: string; stage: PaymentReminderStage; scheduledFor: Date; idempotencyKey: string }): Promise<PaymentReminder> {
    const invoice = await this.repository.findInvoiceById(input.invoiceId);
    if (!invoice) throw new DomainConflictError("INVOICE_NOT_FOUND", "Invoice does not exist.");
    if (invoice.props.status !== "OPEN" || invoice.props.amountDue.amountMinor === 0) throw new DomainConflictError("INVOICE_NOT_PAYABLE", "Payment reminders require an open invoice with an amount due.");
    if (await this.repository.findReminderByIdempotencyKey(input.idempotencyKey)) throw new DomainConflictError("DUPLICATE_PAYMENT_REMINDER", "This payment reminder was already scheduled.");
    const now = this.clock.now();
    const reminder = new PaymentReminder({
      id: new EntityId(this.ids.next()), invoiceId: invoice.props.id, stage: input.stage,
      status: "SCHEDULED", idempotencyKey: input.idempotencyKey, scheduledFor: input.scheduledFor,
      sentAt: null, failureCode: null, createdAt: now, updatedAt: now,
    });
    await this.repository.saveReminder(reminder);
    await this.audit.record({ action: AUDIT_ACTIONS.paymentReminderScheduled, entityType: "PAYMENT_REMINDER", entityId: reminder.props.id.value, after: reminder.props });
    return reminder;
  }
}

export class RecordPaymentReminderOutcomeService {
  constructor(private readonly repository: BillingRepository, private readonly clock: Clock, private readonly audit: AuditRecorder) {}
  async execute(current: PaymentReminder, outcome: { sent: true } | { sent: false; failureCode: string }): Promise<PaymentReminder> {
    if (current.props.status !== "SCHEDULED") throw new DomainConflictError("REMINDER_ALREADY_FINAL", "Payment reminder already has a final outcome.");
    const now = this.clock.now();
    const reminder = new PaymentReminder({
      ...current.props, status: outcome.sent ? "SENT" : "FAILED",
      sentAt: outcome.sent ? now : null, failureCode: outcome.sent ? null : outcome.failureCode,
      updatedAt: now,
    });
    await this.repository.saveReminderOutcome(reminder);
    await this.audit.record({ action: AUDIT_ACTIONS.paymentReminderUpdated, entityType: "PAYMENT_REMINDER", entityId: reminder.props.id.value, before: current.props, after: reminder.props });
    return reminder;
  }
}

function sum(values: readonly Money[], currency: string): Money {
  return values.reduce((total, value) => total.add(value), new Money(0, currency));
}
