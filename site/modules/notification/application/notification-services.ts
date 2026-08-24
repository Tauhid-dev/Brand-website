import type { AuditRecorder } from "../../audit/application/ports.ts";
import { AUDIT_ACTIONS } from "../../audit/domain/audit-event.ts";
import type { Clock, IdGenerator } from "../../shared/application/ports.ts";
import { DomainConflictError, DomainValidationError } from "../../shared/domain/errors.ts";
import { EntityId, StableCode } from "../../shared/domain/value-objects.ts";
import type {
  CommercialNotificationSource, NotificationProvider, NotificationRepository, NotificationService,
} from "./ports.ts";
import {
  NotificationDelivery, NotificationDeliveryAttempt, NotificationTemplate,
  type NotificationChannel, type NotificationPreferenceStatus,
} from "../domain/notification.ts";

const DELIVERY_LEASE_MS = 5 * 60_000;

export class QueueNotificationService implements NotificationService {
  constructor(private readonly repository: NotificationRepository, private readonly ids: IdGenerator, private readonly clock: Clock, private readonly audit: AuditRecorder) {}
  async request(input: { code: string; channel: NotificationChannel; customerId?: string | null; recipientType: "CUSTOMER" | "ADMIN" | "SYSTEM"; recipientId: string; variables: Readonly<Record<string, unknown>>; idempotencyKey: string; scheduledFor?: Date }) {
    const existing = await this.repository.findDeliveryByIdempotencyKey(input.idempotencyKey);
    if (existing) return existing;
    const code = new StableCode(input.code);
    const template = await this.repository.findActiveTemplate(code.value, input.channel);
    if (!template) throw new DomainConflictError("NOTIFICATION_TEMPLATE_NOT_FOUND", "Active notification template does not exist.");
    if (input.customerId && !template.props.requiredServiceNotice && await this.repository.findPreference(input.customerId, code.value, input.channel) === "OPTED_OUT") return null;
    const now = this.clock.now();
    const delivery = new NotificationDelivery({
      id: new EntityId(this.ids.next()), templateId: template.props.id,
      customerId: input.customerId ? new EntityId(input.customerId) : null,
      recipientType: input.recipientType, recipientId: input.recipientId, channel: input.channel,
      status: "PENDING", templateVariables: input.variables, idempotencyKey: input.idempotencyKey,
      scheduledFor: input.scheduledFor ?? now, attemptCount: 0, maxAttempts: 5,
      nextAttemptAt: input.scheduledFor ?? now, processingStartedAt: null, leaseExpiresAt: null,
      providerReference: null, errorCategory: null, sentAt: null, cancelledAt: null, readAt: null,
      version: 1, createdAt: now, updatedAt: now,
    });
    await this.repository.enqueue(delivery);
    await this.audit.record({ action: AUDIT_ACTIONS.notificationQueued, entityType: "NOTIFICATION_DELIVERY", entityId: delivery.props.id.value, after: delivery.props });
    return delivery;
  }
}

export class DispatchNotificationService {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly provider: NotificationProvider,
    private readonly clock: Clock,
    private readonly audit: AuditRecorder,
    private readonly ids?: IdGenerator,
  ) {}

  async execute() {
    const pending = await this.repository.findReadyDelivery(this.clock.now());
    if (!pending) return null;
    const template = await this.repository.findTemplate(pending.props.templateId.value);
    if (!template) throw new DomainConflictError("NOTIFICATION_TEMPLATE_NOT_FOUND", "Notification template does not exist.");
    const startedAt = this.clock.now();
    const started = pending.start(startedAt, new Date(startedAt.getTime() + DELIVERY_LEASE_MS));
    const attempt = new NotificationDeliveryAttempt({
      id: new EntityId(this.ids?.next() ?? crypto.randomUUID()), deliveryId: started.props.id,
      attemptNumber: started.props.attemptCount, provider: this.provider.code ?? "configured_provider",
      status: "PROCESSING", providerReference: null, errorCategory: null,
      startedAt, completedAt: null, createdAt: startedAt,
    });
    await this.repository.startAttempt(started, pending.props.version, attempt);
    try {
      const outcome = await this.provider.send({
        channel: started.props.channel, recipientId: started.props.recipientId,
        subject: render(template.props.subjectTemplate, started.props.templateVariables),
        body: render(template.props.bodyTemplate, started.props.templateVariables) ?? "",
        idempotencyKey: started.props.idempotencyKey,
      });
      const sent = started.sent(outcome.providerReference, this.clock.now());
      await this.repository.saveAttemptOutcome(sent, started.props.version, attempt.sent(outcome.providerReference, sent.props.updatedAt));
      await this.audit.record({ action: AUDIT_ACTIONS.notificationSent, entityType: "NOTIFICATION_DELIVERY", entityId: sent.props.id.value, before: pending.props, after: sent.props });
      return sent;
    } catch (error) {
      const now = this.clock.now();
      const retryAt = started.props.attemptCount < started.props.maxAttempts ? new Date(now.getTime() + 60_000 * 2 ** (started.props.attemptCount - 1)) : null;
      const failed = started.failed("PROVIDER_ERROR", retryAt, now);
      await this.repository.saveAttemptOutcome(failed, started.props.version, attempt.failed("PROVIDER_ERROR", now));
      await this.audit.record({ action: retryAt ? AUDIT_ACTIONS.notificationRetryScheduled : AUDIT_ACTIONS.notificationFailed, entityType: "NOTIFICATION_DELIVERY", entityId: failed.props.id.value, before: started.props, after: failed.props });
      throw error;
    }
  }
}

export class DispatchNotificationBatchService {
  constructor(private readonly dispatch: DispatchNotificationService) {}
  async execute(limit = 25) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new DomainValidationError("INVALID_NOTIFICATION_BATCH_LIMIT", "Notification batch limit must be from 1 to 100.");
    const summary = { sent: 0, failed: 0, empty: false };
    for (let index = 0; index < limit; index += 1) {
      try {
        const delivery = await this.dispatch.execute();
        if (!delivery) { summary.empty = true; break; }
        summary.sent += 1;
      } catch {
        summary.failed += 1;
      }
    }
    return Object.freeze(summary);
  }
}

export class CommercialNotificationOrchestrationService {
  constructor(private readonly source: CommercialNotificationSource, private readonly notifications: NotificationService, private readonly clock: Clock) {}
  async reconcile(limit = 200) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new DomainValidationError("INVALID_NOTIFICATION_RECONCILIATION_LIMIT", "Notification reconciliation limit must be from 1 to 500.");
    const required = await this.source.listRequired(this.clock.now(), limit);
    let queued = 0;
    let optedOut = 0;
    for (const request of required) {
      const delivery = await this.notifications.request({ ...request, recipientType: "CUSTOMER" });
      if (delivery) queued += 1;
      else optedOut += 1;
    }
    return Object.freeze({ considered: required.length, queued, optedOut });
  }
}

export class NotificationPreferenceService {
  constructor(private readonly repository: NotificationRepository, private readonly ids: IdGenerator, private readonly clock: Clock, private readonly audit: AuditRecorder) {}
  async set(input: { customerId: string; code: string; channel: NotificationChannel; status: NotificationPreferenceStatus; updatedBy: string }) {
    const code = new StableCode(input.code); const at = this.clock.now();
    await this.repository.setPreference({ id: this.ids.next(), customerId: new EntityId(input.customerId).value, code: code.value, channel: input.channel, status: input.status, updatedBy: input.updatedBy, at });
    await this.audit.record({ action: AUDIT_ACTIONS.notificationPreferenceChanged, entityType: "NOTIFICATION_PREFERENCE", entityId: `${input.customerId}:${code.value}:${input.channel}`, after: input });
  }
}

export class MarkInAppNotificationReadService {
  constructor(private readonly repository: NotificationRepository, private readonly clock: Clock, private readonly audit: AuditRecorder) {}
  async execute(deliveryId: string, customerId: string) {
    const current = await this.repository.findDelivery(new EntityId(deliveryId).value);
    if (!current) throw new DomainConflictError("NOTIFICATION_NOT_FOUND", "Notification delivery does not exist.");
    const next = current.markRead(new EntityId(customerId), this.clock.now());
    if (next === current) return current;
    await this.repository.saveDelivery(next, current.props.version);
    await this.audit.record({ action: AUDIT_ACTIONS.notificationRead, entityType: "NOTIFICATION_DELIVERY", entityId: deliveryId, before: current.props, after: next.props });
    return next;
  }
}

export class CancelNotificationDeliveryService {
  constructor(private readonly repository: NotificationRepository, private readonly clock: Clock, private readonly audit: AuditRecorder) {}
  async execute(deliveryId: string) {
    const current = await this.repository.findDelivery(new EntityId(deliveryId).value);
    if (!current) throw new DomainConflictError("NOTIFICATION_NOT_FOUND", "Notification delivery does not exist.");
    const next = current.cancel(this.clock.now());
    await this.repository.saveDelivery(next, current.props.version);
    await this.audit.record({ action: AUDIT_ACTIONS.notificationCancelled, entityType: "NOTIFICATION_DELIVERY", entityId: deliveryId, before: current.props, after: next.props });
    return next;
  }
}

export class PublishNotificationTemplateService {
  constructor(private readonly repository: NotificationRepository, private readonly ids: IdGenerator, private readonly clock: Clock, private readonly audit: AuditRecorder) {}
  async execute(input: { code: string; channel: NotificationChannel; version: number; subjectTemplate?: string | null; bodyTemplate: string; requiredServiceNotice?: boolean }) {
    if (!Number.isSafeInteger(input.version) || input.version < 1) throw new DomainValidationError("INVALID_TEMPLATE_VERSION", "Template version must be positive.");
    const now = this.clock.now();
    const template = new NotificationTemplate({ id: new EntityId(this.ids.next()), code: new StableCode(input.code), channel: input.channel, version: input.version, subjectTemplate: input.subjectTemplate ?? null, bodyTemplate: input.bodyTemplate, requiredServiceNotice: input.requiredServiceNotice ?? false, active: true, createdAt: now, updatedAt: now });
    await this.repository.publishTemplate(template);
    await this.audit.record({ action: AUDIT_ACTIONS.notificationTemplatePublished, entityType: "NOTIFICATION_TEMPLATE", entityId: template.props.id.value, after: template.props });
    return template;
  }
}

function render(template: string | null, variables: Readonly<Record<string, unknown>>) {
  if (template == null) return null;
  return template.replace(/\{\{([a-z][a-z0-9_]*)\}\}/g, (_match, key: string) => {
    const value = variables[key];
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") throw new DomainValidationError("INVALID_NOTIFICATION_VARIABLE", `Template variable ${key} must be a scalar.`);
    return String(value);
  });
}
