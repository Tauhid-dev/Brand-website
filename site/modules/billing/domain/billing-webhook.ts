import { DomainValidationError } from "../../shared/domain/errors.ts";
import { EntityId, requireText } from "../../shared/domain/value-objects.ts";

export const BILLING_EVENT_KINDS = [
  "SUBSCRIPTION_ACTIVATED",
  "PAYMENT_SUCCEEDED",
  "PAYMENT_FAILED",
  "SUBSCRIPTION_PAST_DUE",
  "SUBSCRIPTION_CANCELLED",
  "SUBSCRIPTION_RENEWED",
  "CHECKOUT_COMPLETED",
  "INVOICE_OPENED",
  "INVOICE_UNCOLLECTIBLE",
  "INVOICE_VOIDED",
  "UNSUPPORTED",
] as const;

export type BillingEventKind = (typeof BILLING_EVENT_KINDS)[number];
export type BillingWebhookStatus = "PROCESSING" | "PROCESSED" | "IGNORED" | "FAILED";

export type NormalizedBillingEvent = Readonly<{
  provider: string;
  providerEventId: string;
  providerEventType: string;
  kind: BillingEventKind;
  externalSubscriptionId: string | null;
  externalInvoiceId: string | null;
  externalCustomerId?: string | null;
  internalSubscriptionId?: string | null;
  providerCheckoutSessionId?: string | null;
  invoice?: ProviderInvoiceSnapshot | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  occurredAt: Date;
}>;

export type ProviderInvoiceSnapshot = Readonly<{
  invoiceNumber: string; status: "DRAFT" | "OPEN" | "PAID" | "VOID" | "UNCOLLECTIBLE";
  currency: string; subtotalMinor: number; taxMinor: number; totalMinor: number;
  amountDueMinor: number; issuedAt: Date | null; dueAt: Date | null; paidAt: Date | null;
}>;

export type BillingWebhookEventProps = {
  id: EntityId;
  event: NormalizedBillingEvent;
  payloadHash: string;
  status: BillingWebhookStatus;
  attemptCount: number;
  maxAttempts: number;
  receivedAt: Date;
  processingStartedAt: Date;
  processedAt: Date | null;
  nextAttemptAt: Date | null;
  failureCode: string | null;
  requestId: string;
  createdAt: Date;
  updatedAt: Date;
};

export class BillingWebhookEvent {
  readonly props: Readonly<BillingWebhookEventProps>;

  constructor(input: BillingWebhookEventProps) {
    const event = normalizeEvent(input.event);
    if (!/^[a-f0-9]{64}$/.test(input.payloadHash)) throw new DomainValidationError("INVALID_WEBHOOK_HASH", "Webhook payload hash is invalid.");
    if (!Number.isSafeInteger(input.attemptCount) || !Number.isSafeInteger(input.maxAttempts) || input.attemptCount < 1 || input.maxAttempts < input.attemptCount) throw new DomainValidationError("INVALID_WEBHOOK_ATTEMPTS", "Webhook attempt state is invalid.");
    for (const [field, value] of Object.entries({ receivedAt: input.receivedAt, processingStartedAt: input.processingStartedAt, processedAt: input.processedAt, nextAttemptAt: input.nextAttemptAt, createdAt: input.createdAt, updatedAt: input.updatedAt })) if (value && !Number.isFinite(value.getTime())) throw new DomainValidationError("INVALID_DATE", `${field} must be a valid date.`);
    if ((["PROCESSED", "IGNORED"].includes(input.status)) !== (input.processedAt != null)) throw new DomainValidationError("INVALID_WEBHOOK_OUTCOME", "Webhook completion state is contradictory.");
    if ((input.status === "FAILED") !== (input.failureCode != null)) throw new DomainValidationError("INVALID_WEBHOOK_FAILURE", "Webhook failure state is contradictory.");
    this.props = Object.freeze({ ...input, event, requestId: requireText(input.requestId, "requestId", 255) });
  }
}

function normalizeEvent(input: NormalizedBillingEvent): NormalizedBillingEvent {
  const provider = requireText(input.provider, "provider", 80).toLowerCase();
  const providerEventId = requireText(input.providerEventId, "providerEventId", 255);
  const providerEventType = requireText(input.providerEventType, "providerEventType", 160);
  if (!BILLING_EVENT_KINDS.includes(input.kind)) throw new DomainValidationError("INVALID_BILLING_EVENT_KIND", "Billing event kind is invalid.");
  if (!Number.isFinite(input.occurredAt.getTime())) throw new DomainValidationError("INVALID_BILLING_EVENT_DATE", "Billing event date is invalid.");
  if ((input.periodStart == null) !== (input.periodEnd == null) || (input.periodStart && input.periodEnd && input.periodEnd <= input.periodStart)) throw new DomainValidationError("INVALID_BILLING_PERIOD", "Billing period must have a start and a later end.");
  if (input.kind !== "UNSUPPORTED" && !input.externalSubscriptionId && !input.externalInvoiceId && !input.internalSubscriptionId) throw new DomainValidationError("BILLING_REFERENCE_REQUIRED", "Billing event requires a provider or internal subscription reference.");
  return Object.freeze({ ...input, provider, providerEventId, providerEventType, externalSubscriptionId: input.externalSubscriptionId?.trim().slice(0, 255) || null, externalInvoiceId: input.externalInvoiceId?.trim().slice(0, 255) || null });
}
