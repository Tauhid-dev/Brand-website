import { DomainConflictError, DomainValidationError } from "../../shared/domain/errors.ts";
import { EntityId, StableCode, optionalText, requireText } from "../../shared/domain/value-objects.ts";

export const NOTIFICATION_CHANNELS = ["EMAIL", "SMS", "WHATSAPP", "IN_APP"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const COMMERCIAL_NOTIFICATION_CODES = [
  "welcome", "customer_action_required", "onboarding_reminder", "payment_reminder",
  "payment_overdue", "subscription_activated", "subscription_suspended",
  "subscription_resumed", "subscription_cancelled", "discount_expiring",
  "agent_ready", "integration_action_required",
] as const;
export type CommercialNotificationCode = (typeof COMMERCIAL_NOTIFICATION_CODES)[number];
export type NotificationPreferenceStatus = "OPTED_IN" | "OPTED_OUT";
export type NotificationDeliveryStatus = "PENDING" | "PROCESSING" | "SENT" | "FAILED" | "CANCELLED";
const SENSITIVE_KEY = /(password|secret|token|credential|authorization|cookie|api.?key|hash)/i;

export type NotificationTemplateProps = {
  id: EntityId; code: StableCode; channel: NotificationChannel; version: number;
  subjectTemplate: string | null; bodyTemplate: string; requiredServiceNotice: boolean;
  active: boolean; createdAt: Date; updatedAt: Date;
};

export class NotificationTemplate {
  readonly props: Readonly<NotificationTemplateProps>;
  constructor(input: NotificationTemplateProps) {
    if (!NOTIFICATION_CHANNELS.includes(input.channel)) throw new DomainValidationError("INVALID_NOTIFICATION_CHANNEL", "Notification channel is invalid.");
    if (input.channel === "EMAIL" && !input.subjectTemplate) throw new DomainValidationError("NOTIFICATION_SUBJECT_REQUIRED", "Email templates require a subject.");
    this.props = Object.freeze({ ...input, subjectTemplate: optionalText(input.subjectTemplate, "subjectTemplate", 500), bodyTemplate: requireText(input.bodyTemplate, "bodyTemplate", 20_000) });
  }
}

export type NotificationDeliveryProps = {
  id: EntityId; templateId: EntityId; customerId: EntityId | null;
  recipientType: "CUSTOMER" | "ADMIN" | "SYSTEM"; recipientId: string;
  channel: NotificationChannel; status: NotificationDeliveryStatus;
  templateVariables: Readonly<Record<string, unknown>>; idempotencyKey: string;
  scheduledFor: Date; attemptCount: number; maxAttempts: number; nextAttemptAt: Date | null;
  processingStartedAt: Date | null; leaseExpiresAt: Date | null;
  providerReference: string | null; errorCategory: string | null; sentAt: Date | null;
  cancelledAt: Date | null; readAt: Date | null; version: number;
  createdAt: Date; updatedAt: Date;
};

export class NotificationDelivery {
  readonly props: Readonly<NotificationDeliveryProps>;
  constructor(input: NotificationDeliveryProps) {
    for (const key of Object.keys(input.templateVariables)) if (SENSITIVE_KEY.test(key)) throw new DomainValidationError("SENSITIVE_NOTIFICATION_VARIABLE", "Notification variables cannot contain credentials or secrets.");
    if (!NOTIFICATION_CHANNELS.includes(input.channel)) throw new DomainValidationError("INVALID_NOTIFICATION_CHANNEL", "Notification channel is invalid.");
    if (!Number.isSafeInteger(input.attemptCount) || input.attemptCount < 0 || input.attemptCount > input.maxAttempts || input.maxAttempts < 1) throw new DomainValidationError("INVALID_NOTIFICATION_ATTEMPTS", "Notification attempts are invalid.");
    const hasLease = input.processingStartedAt !== null && input.leaseExpiresAt !== null;
    if ((input.status === "PROCESSING") !== hasLease) throw new DomainValidationError("INVALID_NOTIFICATION_LEASE", "Processing deliveries require an active lease.");
    if (input.readAt && (input.channel !== "IN_APP" || input.status !== "SENT" || !input.sentAt || input.readAt < input.sentAt)) throw new DomainValidationError("INVALID_NOTIFICATION_READ_STATE", "Only sent in-app notifications can be marked as read.");
    this.props = Object.freeze({
      ...input,
      recipientId: requireText(input.recipientId, "recipientId", 255),
      idempotencyKey: requireText(input.idempotencyKey, "idempotencyKey", 255),
      templateVariables: Object.freeze({ ...input.templateVariables }),
      providerReference: optionalText(input.providerReference, "providerReference", 255),
      errorCategory: optionalText(input.errorCategory, "errorCategory", 120),
    });
  }

  start(at: Date, leaseExpiresAt: Date): NotificationDelivery {
    const reclaimable = this.props.status === "PROCESSING" && this.props.leaseExpiresAt && this.props.leaseExpiresAt <= at;
    if (this.props.status !== "PENDING" && !reclaimable) throw new DomainConflictError("NOTIFICATION_NOT_READY", "Notification delivery is not ready to process.");
    if (leaseExpiresAt <= at) throw new DomainValidationError("INVALID_NOTIFICATION_LEASE", "Notification delivery lease must expire in the future.");
    if (this.props.attemptCount >= this.props.maxAttempts) throw new DomainConflictError("NOTIFICATION_ATTEMPTS_EXHAUSTED", "Notification delivery attempts are exhausted.");
    return new NotificationDelivery({ ...this.props, status: "PROCESSING", attemptCount: this.props.attemptCount + 1, nextAttemptAt: null, processingStartedAt: at, leaseExpiresAt, version: this.props.version + 1, updatedAt: at });
  }

  sent(providerReference: string, at: Date): NotificationDelivery {
    if (this.props.status !== "PROCESSING") throw new DomainConflictError("NOTIFICATION_NOT_PROCESSING", "Notification delivery is not processing.");
    return new NotificationDelivery({ ...this.props, status: "SENT", providerReference, errorCategory: null, sentAt: at, processingStartedAt: null, leaseExpiresAt: null, version: this.props.version + 1, updatedAt: at });
  }

  failed(errorCategory: string, retryAt: Date | null, at: Date): NotificationDelivery {
    if (this.props.status !== "PROCESSING") throw new DomainConflictError("NOTIFICATION_NOT_PROCESSING", "Notification delivery is not processing.");
    const terminal = !retryAt || this.props.attemptCount >= this.props.maxAttempts;
    return new NotificationDelivery({ ...this.props, status: terminal ? "FAILED" : "PENDING", errorCategory: terminal ? errorCategory : null, nextAttemptAt: terminal ? null : retryAt, processingStartedAt: null, leaseExpiresAt: null, version: this.props.version + 1, updatedAt: at });
  }

  cancel(at: Date): NotificationDelivery {
    if (!["PENDING", "PROCESSING"].includes(this.props.status)) throw new DomainConflictError("NOTIFICATION_ALREADY_FINAL", "Only pending notifications can be cancelled.");
    return new NotificationDelivery({ ...this.props, status: "CANCELLED", nextAttemptAt: null, processingStartedAt: null, leaseExpiresAt: null, cancelledAt: at, version: this.props.version + 1, updatedAt: at });
  }

  markRead(customerId: EntityId, at: Date): NotificationDelivery {
    if (!this.props.customerId?.equals(customerId)) throw new DomainConflictError("NOTIFICATION_CUSTOMER_MISMATCH", "Notification does not belong to this customer.");
    if (this.props.channel !== "IN_APP" || this.props.status !== "SENT") throw new DomainConflictError("NOTIFICATION_NOT_READABLE", "Only sent in-app notifications can be marked as read.");
    if (this.props.readAt) return this;
    return new NotificationDelivery({ ...this.props, readAt: at, version: this.props.version + 1, updatedAt: at });
  }
}

export type NotificationAttemptStatus = "PROCESSING" | "SENT" | "FAILED";
export type NotificationDeliveryAttemptProps = {
  id: EntityId; deliveryId: EntityId; attemptNumber: number; provider: string;
  status: NotificationAttemptStatus; providerReference: string | null;
  errorCategory: string | null; startedAt: Date; completedAt: Date | null; createdAt: Date;
};

export class NotificationDeliveryAttempt {
  readonly props: Readonly<NotificationDeliveryAttemptProps>;
  constructor(input: NotificationDeliveryAttemptProps) {
    if (!Number.isSafeInteger(input.attemptNumber) || input.attemptNumber < 1) throw new DomainValidationError("INVALID_NOTIFICATION_ATTEMPT_NUMBER", "Notification attempt number must be positive.");
    if (!["PROCESSING", "SENT", "FAILED"].includes(input.status)) throw new DomainValidationError("INVALID_NOTIFICATION_ATTEMPT_STATUS", "Notification attempt status is invalid.");
    this.props = Object.freeze({ ...input, provider: requireText(input.provider, "provider", 80).toLowerCase(), providerReference: optionalText(input.providerReference, "providerReference", 255), errorCategory: optionalText(input.errorCategory, "errorCategory", 120) });
  }
  sent(providerReference: string, at: Date) { return new NotificationDeliveryAttempt({ ...this.props, status: "SENT", providerReference, completedAt: at }); }
  failed(errorCategory: string, at: Date) { return new NotificationDeliveryAttempt({ ...this.props, status: "FAILED", errorCategory, completedAt: at }); }
}
