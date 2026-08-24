import { DomainConflictError, DomainValidationError } from "../../shared/domain/errors.ts";
import { EmailAddress, EntityId, optionalText, requireText } from "../../shared/domain/value-objects.ts";
import { Money } from "../../pricing/domain/money.ts";

export type BillingAccountStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "CLOSED";
export type InvoiceStatus = "DRAFT" | "OPEN" | "PAID" | "VOID" | "UNCOLLECTIBLE";
export type PaymentReminderStage = "BEFORE_DUE" | "DUE" | "OVERDUE_1" | "OVERDUE_2" | "FINAL";
export type PaymentReminderStatus = "SCHEDULED" | "SENT" | "FAILED" | "CANCELLED";
export type PaymentState = "NO_PAYMENT_DUE" | "PAYMENT_DUE" | "PAYMENT_OVERDUE" | "PAID" | "UNCOLLECTIBLE";

export type CustomerBillingProfileProps = {
  id: EntityId; customerId: EntityId; contactName: string; contactEmail: EmailAddress;
  contactPhone: string | null; createdAt: Date; updatedAt: Date;
};

export class CustomerBillingProfile {
  readonly props: Readonly<CustomerBillingProfileProps>;
  constructor(input: CustomerBillingProfileProps) {
    if (input.updatedAt < input.createdAt) throw new DomainValidationError("INVALID_TIMESTAMPS", "updatedAt cannot precede createdAt.");
    this.props = Object.freeze({ ...input, contactName: requireText(input.contactName, "billing contact name", 200), contactPhone: optionalText(input.contactPhone, "billing contact phone", 50) });
  }
}

export type BillingNoteProps = {
  id: EntityId; customerId: EntityId; subscriptionId: EntityId | null; invoiceId: EntityId | null;
  body: string; authorAdminUserId: EntityId; createdAt: Date;
};

export class BillingNote {
  readonly props: Readonly<BillingNoteProps>;
  constructor(input: BillingNoteProps) {
    if (!Number.isFinite(input.createdAt.getTime())) throw new DomainValidationError("INVALID_DATE", "Billing note creation date is invalid.");
    this.props = Object.freeze({ ...input, body: requireText(input.body, "billing note", 4_000) });
  }
}

export type BillingAccountProps = {
  id: EntityId; customerId: EntityId; provider: string; providerCustomerId: string;
  status: BillingAccountStatus; currency: string; createdAt: Date; updatedAt: Date;
};

export class BillingAccount {
  readonly props: Readonly<BillingAccountProps>;
  constructor(input: BillingAccountProps) {
    if (!["PENDING", "ACTIVE", "SUSPENDED", "CLOSED"].includes(input.status)) throw new DomainValidationError("INVALID_BILLING_ACCOUNT_STATUS", "Billing account status is invalid.");
    if (input.updatedAt < input.createdAt) throw new DomainValidationError("INVALID_TIMESTAMPS", "updatedAt cannot precede createdAt.");
    this.props = {
      ...input, provider: requireText(input.provider, "billing provider", 80).toLowerCase(),
      providerCustomerId: requireText(input.providerCustomerId, "provider customer ID", 200),
      currency: new Money(0, input.currency).currency,
    };
  }
}

export type InvoiceLineProps = {
  id: EntityId; invoiceId: EntityId; description: string; quantity: number;
  unitAmount: Money; subtotal: Money; tax: Money; total: Money; createdAt: Date;
};

export class InvoiceLine {
  readonly props: Readonly<InvoiceLineProps>;
  constructor(input: InvoiceLineProps) {
    if (!Number.isFinite(input.createdAt.getTime())) throw new DomainValidationError("INVALID_DATE", "Invoice line creation date is invalid.");
    if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) throw new DomainValidationError("INVALID_INVOICE_QUANTITY", "Invoice quantity must be positive.");
    const expectedSubtotal = input.unitAmount.amountMinor * input.quantity;
    if (!Number.isSafeInteger(expectedSubtotal) || input.subtotal.amountMinor !== expectedSubtotal ||
      input.total.amountMinor !== input.subtotal.amountMinor + input.tax.amountMinor) {
      throw new DomainValidationError("INVALID_INVOICE_LINE_TOTAL", "Invoice line arithmetic is invalid.");
    }
    const currencies = [input.unitAmount, input.subtotal, input.tax, input.total].map((money) => money.currency);
    if (currencies.some((currency) => currency !== currencies[0])) throw new DomainValidationError("INVOICE_CURRENCY_MISMATCH", "Invoice line currencies must match.");
    this.props = { ...input, description: requireText(input.description, "invoice line description", 500) };
  }
}

export type InvoiceProps = {
  id: EntityId; customerId: EntityId; subscriptionId: EntityId | null; billingAccountId: EntityId | null;
  invoiceNumber: string; providerInvoiceId: string | null; status: InvoiceStatus; currency: string;
  subtotal: Money; tax: Money; total: Money; amountDue: Money; issuedAt: Date | null;
  dueAt: Date | null; paidAt: Date | null; lines: readonly InvoiceLine[]; createdAt: Date; updatedAt: Date;
};

const INVOICE_TRANSITIONS: Readonly<Record<InvoiceStatus, readonly InvoiceStatus[]>> = {
  DRAFT: ["OPEN", "VOID"], OPEN: ["PAID", "VOID", "UNCOLLECTIBLE"],
  PAID: [], VOID: [], UNCOLLECTIBLE: [],
};

export class Invoice {
  readonly props: Readonly<InvoiceProps>;
  constructor(input: InvoiceProps) {
    if (!["DRAFT", "OPEN", "PAID", "VOID", "UNCOLLECTIBLE"].includes(input.status)) throw new DomainValidationError("INVALID_INVOICE_STATUS", "Invoice status is invalid.");
    for (const [field, value] of Object.entries({ issuedAt: input.issuedAt, dueAt: input.dueAt, paidAt: input.paidAt, createdAt: input.createdAt, updatedAt: input.updatedAt })) {
      if (value && !Number.isFinite(value.getTime())) throw new DomainValidationError("INVALID_DATE", `${field} must be a valid date.`);
    }
    const currency = new Money(0, input.currency).currency;
    const amounts = [input.subtotal, input.tax, input.total, input.amountDue];
    if (amounts.some((money) => money.currency !== currency) || input.lines.some((line) => line.props.total.currency !== currency)) {
      throw new DomainValidationError("INVOICE_CURRENCY_MISMATCH", "Invoice amounts must use one currency.");
    }
    if (input.total.amountMinor !== input.subtotal.amountMinor + input.tax.amountMinor ||
      input.amountDue.amountMinor > input.total.amountMinor) throw new DomainValidationError("INVALID_INVOICE_TOTAL", "Invoice arithmetic is invalid.");
    if (input.lines.length > 0) {
      const lineSubtotal = input.lines.reduce((total, line) => total + line.props.subtotal.amountMinor, 0);
      const lineTax = input.lines.reduce((total, line) => total + line.props.tax.amountMinor, 0);
      if (lineSubtotal !== input.subtotal.amountMinor || lineTax !== input.tax.amountMinor) throw new DomainValidationError("INVOICE_LINES_MISMATCH", "Invoice lines must equal invoice totals.");
    }
    if (input.dueAt && (!input.issuedAt || input.dueAt < input.issuedAt)) throw new DomainValidationError("INVALID_INVOICE_DATES", "Invoice due date cannot precede issue date.");
    if ((input.status === "PAID") !== (input.paidAt != null)) throw new DomainValidationError("INVALID_INVOICE_PAYMENT_STATE", "Paid invoices require paidAt exclusively.");
    if (input.updatedAt < input.createdAt) throw new DomainValidationError("INVALID_TIMESTAMPS", "updatedAt cannot precede createdAt.");
    this.props = { ...input, invoiceNumber: requireText(input.invoiceNumber, "invoice number", 120), currency, lines: Object.freeze([...input.lines]) };
  }

  transition(to: InvoiceStatus, at: Date, dueAt?: Date): Invoice {
    if (!INVOICE_TRANSITIONS[this.props.status].includes(to)) throw new DomainConflictError("INVALID_INVOICE_TRANSITION", `Cannot transition ${this.props.status} to ${to}.`);
    if (!Number.isFinite(at.getTime()) || at < this.props.updatedAt) throw new DomainValidationError("RETROACTIVE_INVOICE_TRANSITION", "Invoice transitions cannot move backwards in time.");
    return new Invoice({
      ...this.props, status: to, issuedAt: to === "OPEN" ? at : this.props.issuedAt,
      dueAt: to === "OPEN" ? dueAt ?? null : this.props.dueAt,
      paidAt: to === "PAID" ? at : null,
      amountDue: to === "PAID" || to === "VOID" ? new Money(0, this.props.currency) : this.props.amountDue,
      updatedAt: at,
    });
  }
}

export function invoicePaymentState(invoice: Invoice, at: Date): PaymentState {
  if (invoice.props.status === "PAID") return "PAID";
  if (invoice.props.status === "UNCOLLECTIBLE") return "UNCOLLECTIBLE";
  if (invoice.props.status !== "OPEN" || invoice.props.amountDue.amountMinor === 0) return "NO_PAYMENT_DUE";
  return invoice.props.dueAt && invoice.props.dueAt < at ? "PAYMENT_OVERDUE" : "PAYMENT_DUE";
}

export type PaymentReminderProps = {
  id: EntityId; invoiceId: EntityId; stage: PaymentReminderStage; status: PaymentReminderStatus;
  idempotencyKey: string; scheduledFor: Date; sentAt: Date | null; failureCode: string | null;
  createdAt: Date; updatedAt: Date;
};

export class PaymentReminder {
  readonly props: Readonly<PaymentReminderProps>;
  constructor(input: PaymentReminderProps) {
    if (!["BEFORE_DUE", "DUE", "OVERDUE_1", "OVERDUE_2", "FINAL"].includes(input.stage)) throw new DomainValidationError("INVALID_REMINDER_STAGE", "Payment reminder stage is invalid.");
    if (!["SCHEDULED", "SENT", "FAILED", "CANCELLED"].includes(input.status)) throw new DomainValidationError("INVALID_REMINDER_STATUS", "Payment reminder status is invalid.");
    for (const [field, value] of Object.entries({ scheduledFor: input.scheduledFor, sentAt: input.sentAt, createdAt: input.createdAt, updatedAt: input.updatedAt })) {
      if (value && !Number.isFinite(value.getTime())) throw new DomainValidationError("INVALID_DATE", `${field} must be a valid date.`);
    }
    if ((input.status === "SENT" && (!input.sentAt || input.failureCode)) ||
      (input.status === "FAILED" && (input.sentAt != null || !input.failureCode)) ||
      (["SCHEDULED", "CANCELLED"].includes(input.status) && (input.sentAt != null || input.failureCode != null))) {
      throw new DomainValidationError("INVALID_REMINDER_OUTCOME", "Payment reminder outcome is inconsistent.");
    }
    if (input.updatedAt < input.createdAt) throw new DomainValidationError("INVALID_TIMESTAMPS", "updatedAt cannot precede createdAt.");
    this.props = { ...input, idempotencyKey: requireText(input.idempotencyKey, "idempotency key", 200) };
  }
}
