import type { AuditRecorder } from "../../audit/application/ports.ts";
import { AUDIT_ACTIONS } from "../../audit/domain/audit-event.ts";
import type { PricingReferenceRepository } from "../../pricing/application/ports.ts";
import type { Clock, IdGenerator } from "../../shared/application/ports.ts";
import { DomainConflictError } from "../../shared/domain/errors.ts";
import { EmailAddress, EntityId } from "../../shared/domain/value-objects.ts";
import type { SubscriptionRepository } from "../../subscription/application/ports.ts";
import { subscriptionAllowsServiceAt } from "../../subscription/domain/subscription.ts";
import { BillingNote, CustomerBillingProfile, invoicePaymentState, type PaymentState } from "../domain/billing.ts";
import type { BillingRepository } from "./ports.ts";

export class UpdateCustomerBillingProfileService {
  constructor(
    private readonly repository: BillingRepository,
    private readonly references: PricingReferenceRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditRecorder,
  ) {}

  async execute(input: { customerId: string; contactName: string; contactEmail: string; contactPhone?: string | null }) {
    if (!await this.references.customerExists(input.customerId)) throw new DomainConflictError("CUSTOMER_NOT_FOUND", "Customer does not exist.");
    const current = await this.repository.findCustomerProfile(input.customerId);
    const now = this.clock.now();
    const profile = new CustomerBillingProfile({
      id: current?.props.id ?? new EntityId(this.ids.next()), customerId: new EntityId(input.customerId),
      contactName: input.contactName, contactEmail: new EmailAddress(input.contactEmail),
      contactPhone: input.contactPhone ?? null, createdAt: current?.props.createdAt ?? now, updatedAt: now,
    });
    await this.repository.saveCustomerProfile(profile);
    await this.audit.record({ action: AUDIT_ACTIONS.billingProfileChanged, entityType: "CUSTOMER_BILLING_PROFILE", entityId: profile.props.id.value, before: current?.props ?? null, after: profile.props });
    return profile;
  }
}

export class AddBillingNoteService {
  constructor(
    private readonly repository: BillingRepository,
    private readonly subscriptions: SubscriptionRepository,
    private readonly references: PricingReferenceRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditRecorder,
  ) {}

  async execute(input: { customerId: string; subscriptionId?: string | null; invoiceId?: string | null; body: string; authorAdminUserId: string }) {
    if (!await this.references.customerExists(input.customerId)) throw new DomainConflictError("CUSTOMER_NOT_FOUND", "Customer does not exist.");
    if (input.subscriptionId) {
      const subscription = await this.subscriptions.findById(input.subscriptionId);
      if (!subscription || subscription.props.customerId.value !== input.customerId) throw new DomainConflictError("SUBSCRIPTION_CUSTOMER_MISMATCH", "Subscription does not belong to this customer.");
    }
    if (input.invoiceId) {
      const invoice = await this.repository.findInvoiceById(input.invoiceId);
      if (!invoice || invoice.props.customerId.value !== input.customerId) throw new DomainConflictError("INVOICE_CUSTOMER_MISMATCH", "Invoice does not belong to this customer.");
    }
    const note = new BillingNote({
      id: new EntityId(this.ids.next()), customerId: new EntityId(input.customerId),
      subscriptionId: input.subscriptionId ? new EntityId(input.subscriptionId) : null,
      invoiceId: input.invoiceId ? new EntityId(input.invoiceId) : null,
      body: input.body, authorAdminUserId: new EntityId(input.authorAdminUserId), createdAt: this.clock.now(),
    });
    await this.repository.saveBillingNote(note);
    await this.audit.record({ action: AUDIT_ACTIONS.billingNoteAdded, entityType: "BILLING_NOTE", entityId: note.props.id.value, after: note.props });
    return note;
  }
}

export class CustomerBillingOverviewService {
  constructor(
    private readonly repository: BillingRepository,
    private readonly subscriptions: SubscriptionRepository,
    private readonly clock: Clock,
  ) {}

  async execute(customerId: string) {
    const now = this.clock.now();
    const subscription = await this.subscriptions.findCurrentForCustomer(customerId) ?? await this.subscriptions.findLatestForCustomer(customerId);
    const [profile, invoices, notes, price] = await Promise.all([
      this.repository.findCustomerProfile(customerId),
      this.repository.listInvoiceHistory(customerId, 100),
      this.repository.listBillingNotes(customerId, 100),
      subscription ? this.subscriptions.findPriceAt(subscription.props.id.value, now) : null,
    ]);
    const states = invoices.map((invoice) => invoicePaymentState(invoice, now));
    const paymentState: PaymentState = states.includes("PAYMENT_OVERDUE") ? "PAYMENT_OVERDUE" : states.includes("PAYMENT_DUE") ? "PAYMENT_DUE" : states.includes("UNCOLLECTIBLE") ? "UNCOLLECTIBLE" : states.includes("PAID") ? "PAID" : "NO_PAYMENT_DUE";
    const entitlementState = !subscription ? "NOT_PROVISIONED" : subscription.props.serviceExtendedUntil && subscription.props.serviceExtendedUntil > now ? "TEMPORARILY_EXTENDED" : subscriptionAllowsServiceAt(subscription, now) ? "OPEN" : "REVOKED";
    const snapshot = price?.props.pricingSnapshot;
    return Object.freeze({
      profile: profile?.props ?? null,
      subscription: subscription?.props ?? null,
      pricing: price ? {
        publicPriceMinor: price.props.baseAmount.amountMinor,
        negotiatedPriceMinor: snapshot?.overridePriceMinor ?? null,
        discountTotalMinor: price.props.discountTotal.amountMinor,
        effectivePriceMinor: price.props.effectiveAmount.amountMinor,
        currency: price.props.effectiveAmount.currency,
      } : null,
      paymentState,
      entitlementState,
      invoices: invoices.map((invoice) => ({ ...invoice.props, paymentState: invoicePaymentState(invoice, now) })),
      notes: notes.map((note) => note.props),
    });
  }
}
