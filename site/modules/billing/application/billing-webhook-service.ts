import type { AuditRecorder } from "../../audit/application/ports.ts";
import { AUDIT_ACTIONS } from "../../audit/domain/audit-event.ts";
import type { Clock, IdGenerator } from "../../shared/application/ports.ts";
import { DomainConflictError, RateLimitExceededError } from "../../shared/domain/errors.ts";
import { EntityId } from "../../shared/domain/value-objects.ts";
import { BillingWebhookEvent } from "../domain/billing-webhook.ts";
import type { BillingEventReconciler, BillingWebhookRepository, BillingWebhookVerifier } from "./webhook-ports.ts";

export class ProcessBillingWebhookService {
  constructor(
    private readonly verifier: BillingWebhookVerifier,
    private readonly repository: BillingWebhookRepository,
    private readonly reconciler: BillingEventReconciler,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditRecorder,
  ) {}

  async execute(rawBody: string, headers: Headers, requestId: string) {
    const now = this.clock.now();
    const verified = await this.verifier.verify(rawBody, headers, now);
    const candidate = new BillingWebhookEvent({ id: new EntityId(this.ids.next()), event: verified.event, payloadHash: verified.payloadHash, status: "PROCESSING", attemptCount: 1, maxAttempts: 5, receivedAt: now, processingStartedAt: now, processedAt: null, nextAttemptAt: null, failureCode: null, requestId, createdAt: now, updatedAt: now });
    const claim = await this.repository.claim(candidate, now);
    if (claim.kind === "DUPLICATE") return { duplicate: true, status: claim.event.props.status } as const;
    if (claim.kind === "RETRY_LATER") throw new RateLimitExceededError("Billing webhook retry is not ready yet.");
    await this.audit.record({ action: AUDIT_ACTIONS.billingWebhookReceived, entityType: "BILLING_WEBHOOK_EVENT", entityId: claim.event.props.id.value, after: safeSnapshot(claim.event) });
    try {
      const status = await this.reconciler.reconcile(claim.event.props.event);
      const completedAt = this.clock.now();
      await this.repository.complete(claim.event.props.id.value, status, completedAt);
      await this.audit.record({ action: status === "PROCESSED" ? AUDIT_ACTIONS.billingWebhookProcessed : AUDIT_ACTIONS.billingWebhookIgnored, entityType: "BILLING_WEBHOOK_EVENT", entityId: claim.event.props.id.value, after: { provider: claim.event.props.event.provider, providerEventId: claim.event.props.event.providerEventId, kind: claim.event.props.event.kind, status } });
      return { duplicate: false, status } as const;
    } catch (error) {
      const failedAt = this.clock.now();
      const failureCode = billingWebhookFailureCode(error);
      const nextAttemptAt = claim.event.props.attemptCount < claim.event.props.maxAttempts ? new Date(failedAt.getTime() + 60_000 * 2 ** (claim.event.props.attemptCount - 1)) : null;
      await this.repository.fail(claim.event.props.id.value, failureCode, nextAttemptAt, failedAt);
      await this.audit.record({ action: AUDIT_ACTIONS.billingWebhookFailed, entityType: "BILLING_WEBHOOK_EVENT", entityId: claim.event.props.id.value, after: { provider: claim.event.props.event.provider, providerEventId: claim.event.props.event.providerEventId, kind: claim.event.props.event.kind, failureCode, nextAttemptAt } });
      throw error;
    }
  }
}

export function billingWebhookFailureCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^[A-Z][A-Z0-9_]{0,119}$/.test(error.code)) return error.code;
  return "BILLING_WEBHOOK_PROCESSING_FAILED";
}

function safeSnapshot(value: BillingWebhookEvent) {
  const props = value.props;
  return { provider: props.event.provider, providerEventId: props.event.providerEventId, providerEventType: props.event.providerEventType, kind: props.event.kind, status: props.status, attemptCount: props.attemptCount, occurredAt: props.event.occurredAt };
}

export function requireWebhookReference(value: string | null, field: string): string {
  if (!value) throw new DomainConflictError("BILLING_WEBHOOK_REFERENCE_NOT_FOUND", `${field} is missing from the verified billing event.`);
  return value;
}
