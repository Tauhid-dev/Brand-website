import type { BillingWebhookVerifier } from "../application/webhook-ports.ts";
import type { BillingEventKind, NormalizedBillingEvent } from "../domain/billing-webhook.ts";
import { AuthenticationRequiredError, DomainValidationError } from "../../shared/domain/errors.ts";
import { constantTimeEqual, hmacSha256Hex, sha256Hex } from "../../shared/application/web-crypto.ts";

export class StripeWebhookVerifier implements BillingWebhookVerifier {
  constructor(private readonly secret: string, private readonly toleranceSeconds = 300) {
    if (!secret.trim()) throw new DomainValidationError("BILLING_WEBHOOK_SECRET_REQUIRED", "Stripe webhook verification is not configured.");
  }

  async verify(rawBody: string, headers: Headers, now: Date) {
    const signature = parseSignature(headers.get("stripe-signature"));
    if (Math.abs(Math.floor(now.getTime() / 1_000) - signature.timestamp) > this.toleranceSeconds) throw invalidSignature();
    const expected = await hmacSha256Hex(this.secret, `${signature.timestamp}.${rawBody}`);
    if (!signature.values.some((value) => constantTimeEqual(value.toLowerCase(), expected))) throw invalidSignature();
    let payload: unknown;
    try { payload = JSON.parse(rawBody); } catch { throw new DomainValidationError("INVALID_WEBHOOK_JSON", "Verified webhook payload must be valid JSON."); }
    return { event: normalizeStripeEvent(payload), payloadHash: await sha256Hex(rawBody) };
  }
}

function parseSignature(value: string | null): { timestamp: number; values: string[] } {
  if (!value) throw invalidSignature();
  let timestamp: number | null = null;
  const values: string[] = [];
  for (const item of value.split(",")) {
    const [key, content] = item.trim().split("=", 2);
    if (key === "t" && /^\d+$/.test(content ?? "")) timestamp = Number(content);
    if (key === "v1" && /^[a-fA-F0-9]{64}$/.test(content ?? "")) values.push(content);
  }
  if (!Number.isSafeInteger(timestamp) || !values.length) throw invalidSignature();
  return { timestamp: timestamp!, values };
}

function normalizeStripeEvent(value: unknown): NormalizedBillingEvent {
  const root = object(value, "Stripe event");
  const id = text(root.id, "event id", 255);
  const type = text(root.type, "event type", 160);
  const created = integer(root.created, "event created timestamp");
  const data = object(root.data, "event data");
  const item = object(data.object, "event object");
  const kind = eventKind(type, item);
  const externalInvoiceId = type.startsWith("invoice.") ? optionalText(item.id, 255) : null;
  const externalSubscriptionId = type.startsWith("customer.subscription.")
    ? optionalText(item.id, 255)
    : subscriptionReference(item);
  const periodStartSeconds = optionalInteger(item.current_period_start);
  const periodEndSeconds = optionalInteger(item.current_period_end);
  const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata as Record<string, unknown> : {};
  return {
    provider: "stripe",
    providerEventId: id,
    providerEventType: type,
    kind,
    externalSubscriptionId,
    externalInvoiceId,
    externalCustomerId: optionalReference(item.customer),
    internalSubscriptionId: optionalText(metadata.zuno_subscription_id, 255) ?? (type === "checkout.session.completed" ? optionalText(item.client_reference_id, 255) : null),
    providerCheckoutSessionId: type === "checkout.session.completed" ? optionalText(item.id, 255) : null,
    invoice: type.startsWith("invoice.") ? invoiceSnapshot(item, type, new Date(created * 1_000)) : null,
    periodStart: periodStartSeconds == null ? null : new Date(periodStartSeconds * 1_000),
    periodEnd: periodEndSeconds == null ? null : new Date(periodEndSeconds * 1_000),
    occurredAt: new Date(created * 1_000),
  };
}

function eventKind(type: string, item: Record<string, unknown>): BillingEventKind {
  if (type === "checkout.session.completed") return "CHECKOUT_COMPLETED";
  if (type === "customer.subscription.deleted") return "SUBSCRIPTION_CANCELLED";
  if (type === "invoice.paid") return "PAYMENT_SUCCEEDED";
  if (type === "invoice.payment_failed") return "PAYMENT_FAILED";
  if (["invoice.created", "invoice.finalized"].includes(type)) return "INVOICE_OPENED";
  if (type === "invoice.marked_uncollectible") return "INVOICE_UNCOLLECTIBLE";
  if (type === "invoice.voided") return "INVOICE_VOIDED";
  if (type === "customer.subscription.created") return subscriptionStatusKind(item.status, false);
  if (type === "customer.subscription.updated") return subscriptionStatusKind(item.status, true);
  return "UNSUPPORTED";
}

function invoiceSnapshot(item: Record<string, unknown>, type: string, occurredAt: Date) {
  const currency = optionalText(item.currency, 3);
  if (!currency) return null;
  const total = optionalInteger(item.total) ?? 0;
  const excludingTax = optionalInteger(item.total_excluding_tax);
  const subtotal = excludingTax != null && excludingTax <= total ? excludingTax : total;
  const status = type === "invoice.paid" ? "PAID" : type === "invoice.voided" ? "VOID" : type === "invoice.marked_uncollectible" ? "UNCOLLECTIBLE" : type === "invoice.created" ? "DRAFT" : "OPEN";
  const transitions = item.status_transitions && typeof item.status_transitions === "object" ? item.status_transitions as Record<string, unknown> : {};
  const issued = optionalInteger(transitions.finalized_at);
  const paid = optionalInteger(transitions.paid_at);
  const due = optionalInteger(item.due_date);
  return {
    invoiceNumber: optionalText(item.number, 120) ?? text(item.id, "invoice id", 120), status,
    currency: currency.toUpperCase(),
    subtotalMinor: subtotal, taxMinor: total - subtotal, totalMinor: total,
    amountDueMinor: status === "PAID" || status === "VOID" ? 0 : optionalInteger(item.amount_due) ?? total,
    issuedAt: issued == null ? (status === "DRAFT" ? null : occurredAt) : new Date(issued * 1_000),
    dueAt: due == null ? null : new Date(due * 1_000),
    paidAt: status === "PAID" ? new Date((paid ?? Math.floor(occurredAt.getTime() / 1_000)) * 1_000) : null,
  } as const;
}

function subscriptionStatusKind(value: unknown, updated: boolean): BillingEventKind {
  const status = typeof value === "string" ? value : "";
  if (["active", "trialing"].includes(status)) return updated ? "SUBSCRIPTION_RENEWED" : "SUBSCRIPTION_ACTIVATED";
  if (["past_due", "unpaid"].includes(status)) return "SUBSCRIPTION_PAST_DUE";
  if (status === "canceled") return "SUBSCRIPTION_CANCELLED";
  return "UNSUPPORTED";
}

function subscriptionReference(item: Record<string, unknown>): string | null {
  const direct = optionalReference(item.subscription);
  if (direct) return direct;
  const parent = item.parent && typeof item.parent === "object" ? item.parent as Record<string, unknown> : null;
  const details = parent?.subscription_details && typeof parent.subscription_details === "object" ? parent.subscription_details as Record<string, unknown> : null;
  return optionalReference(details?.subscription);
}

function optionalReference(value: unknown): string | null {
  if (typeof value === "string") return optionalText(value, 255);
  if (value && typeof value === "object") return optionalText((value as Record<string, unknown>).id, 255);
  return null;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DomainValidationError("INVALID_WEBHOOK_PAYLOAD", `${label} must be an object.`);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max: number): string { const result = optionalText(value, max); if (!result) throw new DomainValidationError("INVALID_WEBHOOK_PAYLOAD", `${label} is required.`); return result; }
function optionalText(value: unknown, max: number): string | null { return typeof value === "string" && value.trim() && value.length <= max ? value.trim() : null; }
function integer(value: unknown, label: string): number { if (!Number.isSafeInteger(value) || Number(value) < 0) throw new DomainValidationError("INVALID_WEBHOOK_PAYLOAD", `${label} must be a positive integer.`); return Number(value); }
function optionalInteger(value: unknown): number | null { return value == null ? null : integer(value, "billing period timestamp"); }
function invalidSignature() { return new AuthenticationRequiredError("Billing webhook signature is invalid."); }
