import type { AuditRecorder } from "../../audit/application/ports.ts";
import { AUDIT_ACTIONS } from "../../audit/domain/audit-event.ts";
import type { Clock } from "../../shared/application/ports.ts";
import type { BillingEventReconciler, BillingWebhookRepository } from "./webhook-ports.ts";
import { billingWebhookFailureCode } from "./billing-webhook-service.ts";

export type BillingWebhookRecoveryResult = "EMPTY" | "PROCESSED" | "IGNORED" | "FAILED";

export interface PendingBillingWebhookRecovery {
  execute(): Promise<BillingWebhookRecoveryResult>;
}

export class RecoverPendingBillingWebhookService implements PendingBillingWebhookRecovery {
  constructor(private readonly repository: BillingWebhookRepository, private readonly reconciler: BillingEventReconciler, private readonly clock: Clock, private readonly audit: AuditRecorder) {}

  async execute(): Promise<BillingWebhookRecoveryResult> {
    const event = await this.repository.claimNextReady(this.clock.now());
    if (!event) return "EMPTY";
    try {
      const status = await this.reconciler.reconcile(event.props.event);
      await this.repository.complete(event.props.id.value, status, this.clock.now());
      await this.audit.record({ action: AUDIT_ACTIONS.billingWebhookRecovered, entityType: "BILLING_WEBHOOK_EVENT", entityId: event.props.id.value, after: { provider: event.props.event.provider, providerEventId: event.props.event.providerEventId, status, attemptCount: event.props.attemptCount } });
      return status;
    } catch (error) {
      const failedAt = this.clock.now();
      const failureCode = billingWebhookFailureCode(error);
      const nextAttemptAt = event.props.attemptCount < event.props.maxAttempts ? new Date(failedAt.getTime() + 60_000 * 2 ** (event.props.attemptCount - 1)) : null;
      await this.repository.fail(event.props.id.value, failureCode, nextAttemptAt, failedAt);
      await this.audit.record({ action: AUDIT_ACTIONS.billingWebhookFailed, entityType: "BILLING_WEBHOOK_EVENT", entityId: event.props.id.value, after: { provider: event.props.event.provider, providerEventId: event.props.event.providerEventId, failureCode, nextAttemptAt, recoveryAttempt: event.props.attemptCount } });
      return "FAILED";
    }
  }
}
