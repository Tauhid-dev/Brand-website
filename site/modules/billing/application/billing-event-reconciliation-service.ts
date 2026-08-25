import type { AuditRecorder } from "../../audit/application/ports.ts";
import { AUDIT_ACTIONS } from "../../audit/domain/audit-event.ts";
import type { Clock, IdGenerator } from "../../shared/application/ports.ts";
import { DomainConflictError } from "../../shared/domain/errors.ts";
import { ProviderSubscriptionReconciliationService } from "../../subscription/application/subscription-services.ts";
import type { SubscriptionRepository } from "../../subscription/application/ports.ts";
import type { SubscriptionStatus } from "../../subscription/domain/subscription.ts";
import type { NormalizedBillingEvent } from "../domain/billing-webhook.ts";
import type { BillingRepository } from "./ports.ts";
import type { BillingProviderReferenceRepository } from "./ports.ts";
import type { BillingEventReconciler } from "./webhook-ports.ts";
import { requireWebhookReference } from "./billing-webhook-service.ts";
import { Invoice } from "../domain/billing.ts";
import { Money } from "../../pricing/domain/money.ts";
import { EntityId } from "../../shared/domain/value-objects.ts";

export class ReconcileBillingEventService implements BillingEventReconciler {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly billing: BillingRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditRecorder,
    private readonly providerReferences?: BillingProviderReferenceRepository,
  ) {}

  async reconcile(event: NormalizedBillingEvent): Promise<"PROCESSED" | "IGNORED"> {
    if (event.kind === "UNSUPPORTED") return "IGNORED";
    const externalSubscriptionId = event.externalSubscriptionId;
    const externalInvoiceId = event.externalInvoiceId;
    let subscription = externalSubscriptionId ? await this.subscriptions.findByProviderReference(event.provider, externalSubscriptionId) : null;
    if (!subscription && event.internalSubscriptionId && externalSubscriptionId && event.externalCustomerId) {
      await this.subscriptions.linkProviderReferences({ subscriptionId: event.internalSubscriptionId, provider: event.provider, externalCustomerId: event.externalCustomerId, externalSubscriptionId, at: this.clock.now() });
      subscription = await this.subscriptions.findById(event.internalSubscriptionId);
      await this.audit.record({ action: AUDIT_ACTIONS.billingProviderSubscriptionSynchronized, entityType: "SUBSCRIPTION", entityId: event.internalSubscriptionId, after: { provider: event.provider, externalCustomerId: event.externalCustomerId, externalSubscriptionId, source: "WEBHOOK" } });
    }
    if (event.kind === "CHECKOUT_COMPLETED") {
      if (!subscription) throw new DomainConflictError("SUBSCRIPTION_NOT_FOUND", "Checkout subscription is not linked to an internal subscription.");
      if (event.providerCheckoutSessionId && this.providerReferences) await this.providerReferences.completeCheckout(event.provider, event.providerCheckoutSessionId, this.clock.now());
      await this.audit.record({ action: AUDIT_ACTIONS.billingCheckoutCompleted, entityType: "SUBSCRIPTION", entityId: subscription.props.id.value, after: { provider: event.provider, providerCheckoutSessionId: event.providerCheckoutSessionId ?? null } });
      return "PROCESSED";
    }
    const invoiceKinds = ["PAYMENT_SUCCEEDED", "PAYMENT_FAILED", "INVOICE_OPENED", "INVOICE_UNCOLLECTIBLE", "INVOICE_VOIDED"];
    if (!invoiceKinds.includes(event.kind) && !externalSubscriptionId) requireWebhookReference(null, "provider subscription ID");
    if (externalSubscriptionId && !subscription) throw new DomainConflictError("SUBSCRIPTION_NOT_FOUND", "Provider subscription is not linked to an internal subscription.");
    let invoice = externalInvoiceId ? await this.billing.findInvoiceByProviderReference(externalInvoiceId) : null;
    if (externalInvoiceId && !invoice && event.invoice) invoice = await this.importInvoice(event, subscription?.props.id.value ?? null);
    if (externalInvoiceId && !invoice) throw new DomainConflictError("INVOICE_NOT_FOUND", "Provider invoice could not be reconciled.");

    if (invoice) await this.reconcileInvoice(invoice, event);

    const target = targetStatus(event.kind);
    if (target && externalSubscriptionId) {
      await new ProviderSubscriptionReconciliationService(this.subscriptions, this.ids, this.clock, this.audit).execute({ provider: event.provider, externalSubscriptionId, status: target, periodStart: event.periodStart, periodEnd: event.periodEnd });
    }
    return "PROCESSED";
  }

  private async importInvoice(event: NormalizedBillingEvent, subscriptionId: string | null) {
    const snapshot = event.invoice!;
    const externalCustomerId = requireWebhookReference(event.externalCustomerId ?? null, "provider customer ID");
    const account = await this.billing.findAccountByProviderReference(event.provider, externalCustomerId);
    if (!account) throw new DomainConflictError("BILLING_ACCOUNT_NOT_FOUND", "Provider billing account is not linked to a customer.");
    if (subscriptionId) {
      const subscription = await this.subscriptions.findById(subscriptionId);
      if (!subscription || subscription.props.customerId.value !== account.props.customerId.value) throw new DomainConflictError("INVOICE_CUSTOMER_MISMATCH", "Provider invoice references another customer.");
    }
    const now = this.clock.now();
    const invoice = new Invoice({
      id: new EntityId(this.ids.next()), customerId: account.props.customerId,
      subscriptionId: subscriptionId ? new EntityId(subscriptionId) : null, billingAccountId: account.props.id,
      invoiceNumber: snapshot.invoiceNumber, providerInvoiceId: event.externalInvoiceId,
      status: snapshot.status, currency: snapshot.currency,
      subtotal: new Money(snapshot.subtotalMinor, snapshot.currency), tax: new Money(snapshot.taxMinor, snapshot.currency),
      total: new Money(snapshot.totalMinor, snapshot.currency), amountDue: new Money(snapshot.amountDueMinor, snapshot.currency),
      issuedAt: snapshot.issuedAt, dueAt: snapshot.dueAt, paidAt: snapshot.paidAt,
      lines: [], createdAt: now, updatedAt: now,
    });
    await this.billing.saveInvoice(invoice);
    await this.audit.record({ action: AUDIT_ACTIONS.invoiceCreated, entityType: "INVOICE", entityId: invoice.props.id.value, after: invoice.props });
    return invoice;
  }

  private async reconcileInvoice(invoice: Invoice, event: NormalizedBillingEvent) {
    const target = event.invoice?.status ?? (event.kind === "PAYMENT_SUCCEEDED" ? "PAID" : null);
    if (!target || target === invoice.props.status || target === "DRAFT") return;
    const allowed = (invoice.props.status === "DRAFT" && ["OPEN", "VOID"].includes(target)) ||
      (invoice.props.status === "OPEN" && ["PAID", "VOID", "UNCOLLECTIBLE"].includes(target));
    if (!allowed) return;
    const next = invoice.transition(target, this.clock.now(), event.invoice?.dueAt ?? undefined);
    await this.billing.saveInvoiceTransition(next);
    await this.audit.record({ action: AUDIT_ACTIONS.invoiceChanged, entityType: "INVOICE", entityId: invoice.props.id.value, before: invoice.props, after: next.props });
  }
}

function targetStatus(kind: NormalizedBillingEvent["kind"]): SubscriptionStatus | null {
  if (["SUBSCRIPTION_ACTIVATED", "SUBSCRIPTION_RENEWED", "PAYMENT_SUCCEEDED"].includes(kind)) return "ACTIVE";
  if (["SUBSCRIPTION_PAST_DUE", "PAYMENT_FAILED"].includes(kind)) return "PAST_DUE";
  if (kind === "SUBSCRIPTION_CANCELLED") return "CANCELLED";
  return null;
}
