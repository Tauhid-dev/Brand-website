import type { AuditRecorder } from "../../audit/application/ports.ts";
import type { Clock, IdGenerator } from "../../shared/application/ports.ts";
import { DomainConflictError } from "../../shared/domain/errors.ts";
import { ProviderSubscriptionReconciliationService } from "../../subscription/application/subscription-services.ts";
import type { SubscriptionRepository } from "../../subscription/application/ports.ts";
import type { SubscriptionStatus } from "../../subscription/domain/subscription.ts";
import type { NormalizedBillingEvent } from "../domain/billing-webhook.ts";
import type { BillingRepository } from "./ports.ts";
import type { BillingEventReconciler } from "./webhook-ports.ts";
import { InvoiceLifecycleService } from "./billing-services.ts";
import { requireWebhookReference } from "./billing-webhook-service.ts";

export class ReconcileBillingEventService implements BillingEventReconciler {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly billing: BillingRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditRecorder,
  ) {}

  async reconcile(event: NormalizedBillingEvent): Promise<"PROCESSED" | "IGNORED"> {
    if (event.kind === "UNSUPPORTED") return "IGNORED";
    const externalSubscriptionId = event.externalSubscriptionId;
    const externalInvoiceId = event.externalInvoiceId;
    const requiresSubscription = event.kind !== "PAYMENT_SUCCEEDED";
    const subscription = externalSubscriptionId ? await this.subscriptions.findByProviderReference(event.provider, externalSubscriptionId) : null;
    const invoice = externalInvoiceId ? await this.billing.findInvoiceByProviderReference(externalInvoiceId) : null;
    if (requiresSubscription && !externalSubscriptionId) requireWebhookReference(null, "provider subscription ID");
    if (externalSubscriptionId && !subscription) throw new DomainConflictError("SUBSCRIPTION_NOT_FOUND", "Provider subscription is not linked to an internal subscription.");
    if (externalInvoiceId && !invoice) throw new DomainConflictError("INVOICE_NOT_FOUND", "Provider invoice is not linked to an internal invoice.");

    if (event.kind === "PAYMENT_SUCCEEDED" && invoice && invoice.props.status !== "PAID") {
      await new InvoiceLifecycleService(this.billing, this.clock, this.audit).markPaid(invoice.props.id.value);
    }

    const target = targetStatus(event.kind);
    if (target && externalSubscriptionId) {
      await new ProviderSubscriptionReconciliationService(this.subscriptions, this.ids, this.clock, this.audit).execute({ provider: event.provider, externalSubscriptionId, status: target, periodStart: event.periodStart, periodEnd: event.periodEnd });
    }
    return "PROCESSED";
  }
}

function targetStatus(kind: NormalizedBillingEvent["kind"]): SubscriptionStatus | null {
  if (["SUBSCRIPTION_ACTIVATED", "SUBSCRIPTION_RENEWED", "PAYMENT_SUCCEEDED"].includes(kind)) return "ACTIVE";
  if (["SUBSCRIPTION_PAST_DUE", "PAYMENT_FAILED"].includes(kind)) return "PAST_DUE";
  if (kind === "SUBSCRIPTION_CANCELLED") return "CANCELLED";
  return null;
}
