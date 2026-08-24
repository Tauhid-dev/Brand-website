import type { AuditRecorder } from "../../audit/application/ports.ts";
import { AUDIT_ACTIONS } from "../../audit/domain/audit-event.ts";
import type { Clock, IdGenerator } from "../../shared/application/ports.ts";
import { DomainConflictError, DomainValidationError } from "../../shared/domain/errors.ts";
import { EntityId, StableCode } from "../../shared/domain/value-objects.ts";
import type { NotificationProvider, NotificationRepository, NotificationService } from "./ports.ts";
import { NotificationDelivery, NotificationTemplate, type NotificationChannel, type NotificationPreferenceStatus } from "../domain/notification.ts";

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
    const delivery = new NotificationDelivery({ id: new EntityId(this.ids.next()), templateId: template.props.id, customerId: input.customerId ? new EntityId(input.customerId) : null, recipientType: input.recipientType, recipientId: input.recipientId, channel: input.channel, status: "PENDING", templateVariables: input.variables, idempotencyKey: input.idempotencyKey, scheduledFor: input.scheduledFor ?? now, attemptCount: 0, maxAttempts: 5, nextAttemptAt: input.scheduledFor ?? now, providerReference: null, errorCategory: null, sentAt: null, version: 1, createdAt: now, updatedAt: now });
    await this.repository.enqueue(delivery);
    await this.audit.record({ action: AUDIT_ACTIONS.notificationQueued, entityType: "NOTIFICATION_DELIVERY", entityId: delivery.props.id.value, after: delivery.props });
    return delivery;
  }
}

export class DispatchNotificationService {
  constructor(private readonly repository: NotificationRepository, private readonly provider: NotificationProvider, private readonly clock: Clock, private readonly audit: AuditRecorder) {}
  async execute() {
    const pending = await this.repository.findReadyDelivery(this.clock.now());
    if (!pending) return null;
    const template = await this.repository.findTemplate(pending.props.templateId.value);
    if (!template) throw new DomainConflictError("NOTIFICATION_TEMPLATE_NOT_FOUND", "Notification template does not exist.");
    const started = pending.start(this.clock.now());
    await this.repository.saveDelivery(started, pending.props.version);
    try {
      const outcome = await this.provider.send({ channel: started.props.channel, recipientId: started.props.recipientId, subject: render(template.props.subjectTemplate, started.props.templateVariables), body: render(template.props.bodyTemplate, started.props.templateVariables) ?? "", idempotencyKey: started.props.idempotencyKey });
      const sent = started.sent(outcome.providerReference, this.clock.now());
      await this.repository.saveDelivery(sent, started.props.version);
      await this.audit.record({ action: AUDIT_ACTIONS.notificationSent, entityType: "NOTIFICATION_DELIVERY", entityId: sent.props.id.value, before: pending.props, after: sent.props });
      return sent;
    } catch (error) {
      const now = this.clock.now();
      const retryAt = started.props.attemptCount < started.props.maxAttempts ? new Date(now.getTime() + 60_000 * 2 ** (started.props.attemptCount - 1)) : null;
      const failed = started.failed("PROVIDER_ERROR", retryAt, now);
      await this.repository.saveDelivery(failed, started.props.version);
      await this.audit.record({ action: retryAt ? AUDIT_ACTIONS.notificationRetryScheduled : AUDIT_ACTIONS.notificationFailed, entityType: "NOTIFICATION_DELIVERY", entityId: failed.props.id.value, before: started.props, after: failed.props });
      throw error;
    }
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

export class PublishNotificationTemplateService {
  constructor(private readonly repository: NotificationRepository, private readonly ids: IdGenerator, private readonly clock: Clock, private readonly audit: AuditRecorder) {}
  async execute(input: { code: string; channel: NotificationChannel; version: number; subjectTemplate?: string | null; bodyTemplate: string; requiredServiceNotice?: boolean }) {
    if (!Number.isSafeInteger(input.version) || input.version < 1) throw new DomainValidationError("INVALID_TEMPLATE_VERSION", "Template version must be positive.");
    const now = this.clock.now(); const template = new NotificationTemplate({ id: new EntityId(this.ids.next()), code: new StableCode(input.code), channel: input.channel, version: input.version, subjectTemplate: input.subjectTemplate ?? null, bodyTemplate: input.bodyTemplate, requiredServiceNotice: input.requiredServiceNotice ?? false, active: true, createdAt: now, updatedAt: now });
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
