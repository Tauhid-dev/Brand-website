import { and, asc, eq, lte, or } from "drizzle-orm";
import type { AppDatabase } from "../../../db/index.ts";
import {
  notificationDeliveries, notificationDeliveryAttempts, notificationPreferences, notificationTemplates,
} from "../../../db/schema.ts";
import { DomainConflictError } from "../../shared/domain/errors.ts";
import { EntityId, StableCode } from "../../shared/domain/value-objects.ts";
import type { NotificationRepository } from "../application/ports.ts";
import {
  NotificationDelivery, NotificationDeliveryAttempt, NotificationTemplate,
  type NotificationAttemptStatus, type NotificationChannel, type NotificationDeliveryStatus,
  type NotificationPreferenceStatus,
} from "../domain/notification.ts";

export class D1NotificationRepository implements NotificationRepository {
  constructor(private readonly db: AppDatabase) {}
  async findTemplate(id: string) { const [row] = await this.db.select().from(notificationTemplates).where(eq(notificationTemplates.id, id)).limit(1); return row ? mapTemplate(row) : null; }
  async findActiveTemplate(code: string, channel: NotificationChannel) { const [row] = await this.db.select().from(notificationTemplates).where(and(eq(notificationTemplates.code, code), eq(notificationTemplates.channel, channel), eq(notificationTemplates.active, true))).limit(1); return row ? mapTemplate(row) : null; }
  async findPreference(customerId: string, code: string, channel: NotificationChannel) { const [row] = await this.db.select({ status: notificationPreferences.status }).from(notificationPreferences).where(and(eq(notificationPreferences.customerId, customerId), eq(notificationPreferences.notificationCode, code), eq(notificationPreferences.channel, channel))).limit(1); return row?.status as NotificationPreferenceStatus | undefined ?? null; }
  async findDelivery(id: string) { const [row] = await this.db.select().from(notificationDeliveries).where(eq(notificationDeliveries.id, id)).limit(1); return row ? mapDelivery(row) : null; }
  async findDeliveryByIdempotencyKey(key: string) { const [row] = await this.db.select().from(notificationDeliveries).where(eq(notificationDeliveries.idempotencyKey, key)).limit(1); return row ? mapDelivery(row) : null; }
  async findReadyDelivery(at: Date) {
    const [row] = await this.db.select().from(notificationDeliveries).where(or(
      and(eq(notificationDeliveries.status, "PENDING"), lte(notificationDeliveries.scheduledFor, at), lte(notificationDeliveries.nextAttemptAt, at)),
      and(eq(notificationDeliveries.status, "PROCESSING"), lte(notificationDeliveries.leaseExpiresAt, at)),
    )).orderBy(asc(notificationDeliveries.nextAttemptAt), asc(notificationDeliveries.leaseExpiresAt), asc(notificationDeliveries.createdAt)).limit(1);
    return row ? mapDelivery(row) : null;
  }
  async enqueue(value: NotificationDelivery) { try { await this.db.insert(notificationDeliveries).values(deliveryValues(value)); } catch (error) { throw mapConflict(error); } }
  async startAttempt(value: NotificationDelivery, expectedVersion: number, attempt: NotificationDeliveryAttempt) {
    type BatchItem = Parameters<AppDatabase["batch"]>[0][number];
    try {
      const results = await this.db.batch([
        deliveryUpdate(this.db, value, expectedVersion),
        this.db.update(notificationDeliveryAttempts).set({ status: "FAILED", errorCategory: "LEASE_EXPIRED", completedAt: value.props.processingStartedAt }).where(and(eq(notificationDeliveryAttempts.deliveryId, value.props.id.value), eq(notificationDeliveryAttempts.status, "PROCESSING"))),
        this.db.insert(notificationDeliveryAttempts).values(attemptValues(attempt)),
      ] as [BatchItem, ...BatchItem[]]);
      if (Number(results[0].meta.changes) !== 1) throw new DomainConflictError("NOTIFICATION_VERSION_CONFLICT", "Notification delivery changed concurrently.");
    } catch (error) { throw mapConflict(error); }
  }
  async saveAttemptOutcome(value: NotificationDelivery, expectedVersion: number, attempt: NotificationDeliveryAttempt) {
    type BatchItem = Parameters<AppDatabase["batch"]>[0][number];
    const p = attempt.props;
    const results = await this.db.batch([
      deliveryUpdate(this.db, value, expectedVersion),
      this.db.update(notificationDeliveryAttempts).set({ status: p.status, providerReference: p.providerReference, errorCategory: p.errorCategory, completedAt: p.completedAt }).where(and(eq(notificationDeliveryAttempts.id, p.id.value), eq(notificationDeliveryAttempts.status, "PROCESSING"))),
    ] as [BatchItem, ...BatchItem[]]);
    if (Number(results[0].meta.changes) !== 1 || Number(results[1].meta.changes) !== 1) throw new DomainConflictError("NOTIFICATION_VERSION_CONFLICT", "Notification delivery attempt changed concurrently.");
  }
  async saveDelivery(value: NotificationDelivery, expectedVersion: number) {
    const result = await deliveryUpdate(this.db, value, expectedVersion);
    if (Number(result.meta.changes) !== 1) throw new DomainConflictError("NOTIFICATION_VERSION_CONFLICT", "Notification delivery changed concurrently.");
  }
  async setPreference(input: { id: string; customerId: string; code: string; channel: NotificationChannel; status: NotificationPreferenceStatus; updatedBy: string; at: Date }) { await this.db.insert(notificationPreferences).values({ id: input.id, customerId: input.customerId, notificationCode: input.code, channel: input.channel, status: input.status, updatedBy: input.updatedBy, createdAt: input.at, updatedAt: input.at }).onConflictDoUpdate({ target: [notificationPreferences.customerId, notificationPreferences.notificationCode, notificationPreferences.channel], set: { status: input.status, updatedBy: input.updatedBy, updatedAt: input.at } }); }
  async publishTemplate(value: NotificationTemplate) { const p = value.props; type BatchItem = Parameters<AppDatabase["batch"]>[0][number]; try { await this.db.batch([this.db.update(notificationTemplates).set({ active: false }).where(and(eq(notificationTemplates.code, p.code.value), eq(notificationTemplates.channel, p.channel), eq(notificationTemplates.active, true))), this.db.insert(notificationTemplates).values({ id: p.id.value, code: p.code.value, channel: p.channel, version: p.version, subjectTemplate: p.subjectTemplate, bodyTemplate: p.bodyTemplate, requiredServiceNotice: p.requiredServiceNotice, active: p.active, createdAt: p.createdAt, updatedAt: p.updatedAt })] as [BatchItem, ...BatchItem[]]); } catch (error) { throw mapConflict(error); } }
}

function deliveryUpdate(db: AppDatabase, value: NotificationDelivery, expectedVersion: number) {
  const p = value.props;
  return db.update(notificationDeliveries).set({
    status: p.status, attemptCount: p.attemptCount, nextAttemptAt: p.nextAttemptAt,
    processingStartedAt: p.processingStartedAt, leaseExpiresAt: p.leaseExpiresAt,
    providerReference: p.providerReference, errorCategory: p.errorCategory, sentAt: p.sentAt,
    cancelledAt: p.cancelledAt, readAt: p.readAt, version: p.version, updatedAt: p.updatedAt,
  }).where(and(eq(notificationDeliveries.id, p.id.value), eq(notificationDeliveries.version, expectedVersion)));
}

function deliveryValues(value: NotificationDelivery) {
  const p = value.props;
  return {
    id: p.id.value, templateId: p.templateId.value, customerId: p.customerId?.value ?? null,
    recipientType: p.recipientType, recipientId: p.recipientId, channel: p.channel, status: p.status,
    templateVariables: { ...p.templateVariables }, idempotencyKey: p.idempotencyKey,
    scheduledFor: p.scheduledFor, attemptCount: p.attemptCount, maxAttempts: p.maxAttempts,
    nextAttemptAt: p.nextAttemptAt, processingStartedAt: p.processingStartedAt,
    leaseExpiresAt: p.leaseExpiresAt, providerReference: p.providerReference,
    errorCategory: p.errorCategory, sentAt: p.sentAt, cancelledAt: p.cancelledAt,
    readAt: p.readAt, version: p.version, createdAt: p.createdAt, updatedAt: p.updatedAt,
  };
}

function attemptValues(value: NotificationDeliveryAttempt) {
  const p = value.props;
  return {
    id: p.id.value, deliveryId: p.deliveryId.value, attemptNumber: p.attemptNumber,
    provider: p.provider, status: p.status, providerReference: p.providerReference,
    errorCategory: p.errorCategory, startedAt: p.startedAt, completedAt: p.completedAt, createdAt: p.createdAt,
  };
}

function mapTemplate(row: typeof notificationTemplates.$inferSelect) { return new NotificationTemplate({ id: new EntityId(row.id), code: new StableCode(row.code), channel: row.channel as NotificationChannel, version: row.version, subjectTemplate: row.subjectTemplate, bodyTemplate: row.bodyTemplate, requiredServiceNotice: row.requiredServiceNotice, active: row.active, createdAt: row.createdAt, updatedAt: row.updatedAt }); }
function mapDelivery(row: typeof notificationDeliveries.$inferSelect) { return new NotificationDelivery({ id: new EntityId(row.id), templateId: new EntityId(row.templateId), customerId: row.customerId ? new EntityId(row.customerId) : null, recipientType: row.recipientType as "CUSTOMER" | "ADMIN" | "SYSTEM", recipientId: row.recipientId, channel: row.channel as NotificationChannel, status: row.status as NotificationDeliveryStatus, templateVariables: row.templateVariables, idempotencyKey: row.idempotencyKey, scheduledFor: row.scheduledFor, attemptCount: row.attemptCount, maxAttempts: row.maxAttempts, nextAttemptAt: row.nextAttemptAt, processingStartedAt: row.processingStartedAt, leaseExpiresAt: row.leaseExpiresAt, providerReference: row.providerReference, errorCategory: row.errorCategory, sentAt: row.sentAt, cancelledAt: row.cancelledAt, readAt: row.readAt, version: row.version, createdAt: row.createdAt, updatedAt: row.updatedAt }); }
export function mapNotificationAttempt(row: typeof notificationDeliveryAttempts.$inferSelect) { return new NotificationDeliveryAttempt({ id: new EntityId(row.id), deliveryId: new EntityId(row.deliveryId), attemptNumber: row.attemptNumber, provider: row.provider, status: row.status as NotificationAttemptStatus, providerReference: row.providerReference, errorCategory: row.errorCategory, startedAt: row.startedAt, completedAt: row.completedAt, createdAt: row.createdAt }); }
function mapConflict(error: unknown): DomainConflictError { const message = error instanceof Error ? error.message : ""; if (message.includes("idempotency_key")) return new DomainConflictError("NOTIFICATION_IDEMPOTENCY_CONFLICT", "Notification delivery already exists."); if (message.includes("notification_delivery_attempts")) return new DomainConflictError("NOTIFICATION_ATTEMPT_CONFLICT", "Notification delivery attempt already exists."); if (message.includes("notification_templates")) return new DomainConflictError("NOTIFICATION_TEMPLATE_CONFLICT", "Notification template version conflicts with current history."); if (error instanceof DomainConflictError) return error; throw error; }
