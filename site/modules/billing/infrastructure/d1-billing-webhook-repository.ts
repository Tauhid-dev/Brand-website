import { and, eq, lte, lt, sql } from "drizzle-orm";
import type { AppDatabase } from "../../../db/index.ts";
import { billingWebhookEvents } from "../../../db/schema.ts";
import { DomainConflictError } from "../../shared/domain/errors.ts";
import { EntityId } from "../../shared/domain/value-objects.ts";
import type { BillingWebhookClaim, BillingWebhookRepository } from "../application/webhook-ports.ts";
import { BillingWebhookEvent, type BillingWebhookStatus, type NormalizedBillingEvent } from "../domain/billing-webhook.ts";

export class D1BillingWebhookRepository implements BillingWebhookRepository {
  constructor(private readonly db: AppDatabase) {}

  async claim(event: BillingWebhookEvent, now: Date): Promise<BillingWebhookClaim> {
    try {
      await this.db.insert(billingWebhookEvents).values(values(event));
      return { kind: "PROCESS", event };
    } catch (error) {
      const existing = await this.find(event.props.event.provider, event.props.event.providerEventId);
      if (!existing) throw error;
      if (existing.props.payloadHash !== event.props.payloadHash) throw new DomainConflictError("BILLING_WEBHOOK_PAYLOAD_CONFLICT", "Provider event ID was reused with a different payload.");
      if (existing.props.status === "PROCESSING") {
        const staleBefore = new Date(now.getTime() - 5 * 60_000);
        if (existing.props.processingStartedAt > staleBefore || existing.props.attemptCount >= existing.props.maxAttempts) return { kind: "RETRY_LATER", event: existing };
        const reclaimed = await this.db.update(billingWebhookEvents).set({ attemptCount: sql`${billingWebhookEvents.attemptCount} + 1`, processingStartedAt: now, updatedAt: now }).where(and(eq(billingWebhookEvents.id, existing.props.id.value), eq(billingWebhookEvents.status, "PROCESSING"), lt(billingWebhookEvents.attemptCount, billingWebhookEvents.maxAttempts), lte(billingWebhookEvents.processingStartedAt, staleBefore)));
        if (Number(reclaimed.meta.changes) !== 1) return { kind: "RETRY_LATER", event: (await this.find(event.props.event.provider, event.props.event.providerEventId)) ?? existing };
        return { kind: "PROCESS", event: (await this.find(event.props.event.provider, event.props.event.providerEventId))! };
      }
      if (existing.props.status !== "FAILED" || existing.props.attemptCount >= existing.props.maxAttempts) return { kind: "DUPLICATE", event: existing };
      if (existing.props.nextAttemptAt && existing.props.nextAttemptAt > now) return { kind: "RETRY_LATER", event: existing };
      const result = await this.db.update(billingWebhookEvents).set({ status: "PROCESSING", attemptCount: sql`${billingWebhookEvents.attemptCount} + 1`, processingStartedAt: now, nextAttemptAt: null, failureCode: null, updatedAt: now }).where(and(eq(billingWebhookEvents.id, existing.props.id.value), eq(billingWebhookEvents.status, "FAILED"), lt(billingWebhookEvents.attemptCount, billingWebhookEvents.maxAttempts), lte(billingWebhookEvents.nextAttemptAt, now)));
      if (Number(result.meta.changes) !== 1) return { kind: "DUPLICATE", event: (await this.find(event.props.event.provider, event.props.event.providerEventId)) ?? existing };
      return { kind: "PROCESS", event: (await this.find(event.props.event.provider, event.props.event.providerEventId))! };
    }
  }

  async complete(id: string, status: "PROCESSED" | "IGNORED", at: Date): Promise<void> {
    const result = await this.db.update(billingWebhookEvents).set({ status, processedAt: at, nextAttemptAt: null, failureCode: null, updatedAt: at }).where(and(eq(billingWebhookEvents.id, id), eq(billingWebhookEvents.status, "PROCESSING")));
    if (Number(result.meta.changes) !== 1) throw new DomainConflictError("BILLING_WEBHOOK_COMPLETION_CONFLICT", "Billing webhook changed concurrently.");
  }

  async fail(id: string, failureCode: string, nextAttemptAt: Date | null, at: Date): Promise<void> {
    const result = await this.db.update(billingWebhookEvents).set({ status: "FAILED", processedAt: null, nextAttemptAt, failureCode, updatedAt: at }).where(and(eq(billingWebhookEvents.id, id), eq(billingWebhookEvents.status, "PROCESSING")));
    if (Number(result.meta.changes) !== 1) throw new DomainConflictError("BILLING_WEBHOOK_FAILURE_CONFLICT", "Billing webhook changed concurrently.");
  }

  private async find(provider: string, providerEventId: string) {
    const [row] = await this.db.select().from(billingWebhookEvents).where(and(eq(billingWebhookEvents.provider, provider), eq(billingWebhookEvents.providerEventId, providerEventId))).limit(1);
    if (!row) return null;
    const payload = row.normalizedPayload as SerializedEvent;
    return new BillingWebhookEvent({
      id: new EntityId(row.id),
      event: { ...payload, periodStart: payload.periodStart ? new Date(payload.periodStart) : null, periodEnd: payload.periodEnd ? new Date(payload.periodEnd) : null, occurredAt: new Date(payload.occurredAt) },
      payloadHash: row.payloadHash,
      status: row.status as BillingWebhookStatus,
      attemptCount: row.attemptCount,
      maxAttempts: row.maxAttempts,
      receivedAt: row.receivedAt,
      processingStartedAt: row.processingStartedAt,
      processedAt: row.processedAt,
      nextAttemptAt: row.nextAttemptAt,
      failureCode: row.failureCode,
      requestId: row.requestId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}

type SerializedEvent = Omit<NormalizedBillingEvent, "periodStart" | "periodEnd" | "occurredAt"> & { periodStart: string | null; periodEnd: string | null; occurredAt: string };

function values(value: BillingWebhookEvent) {
  const props = value.props;
  const event: SerializedEvent = { ...props.event, periodStart: props.event.periodStart?.toISOString() ?? null, periodEnd: props.event.periodEnd?.toISOString() ?? null, occurredAt: props.event.occurredAt.toISOString() };
  return { id: props.id.value, provider: props.event.provider, providerEventId: props.event.providerEventId, eventType: props.event.providerEventType, payloadHash: props.payloadHash, normalizedPayload: event, status: props.status, attemptCount: props.attemptCount, maxAttempts: props.maxAttempts, occurredAt: props.event.occurredAt, receivedAt: props.receivedAt, processingStartedAt: props.processingStartedAt, processedAt: props.processedAt, nextAttemptAt: props.nextAttemptAt, failureCode: props.failureCode, requestId: props.requestId, createdAt: props.createdAt, updatedAt: props.updatedAt };
}
