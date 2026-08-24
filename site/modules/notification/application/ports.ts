import type {
  CommercialNotificationCode, NotificationChannel, NotificationDelivery,
  NotificationDeliveryAttempt, NotificationPreferenceStatus, NotificationTemplate,
} from "../domain/notification.ts";

export interface NotificationRepository {
  findTemplate(id: string): Promise<NotificationTemplate | null>;
  findActiveTemplate(code: string, channel: NotificationChannel): Promise<NotificationTemplate | null>;
  findPreference(customerId: string, code: string, channel: NotificationChannel): Promise<NotificationPreferenceStatus | null>;
  findDelivery(id: string): Promise<NotificationDelivery | null>;
  findDeliveryByIdempotencyKey(key: string): Promise<NotificationDelivery | null>;
  findReadyDelivery(at: Date): Promise<NotificationDelivery | null>;
  enqueue(value: NotificationDelivery): Promise<void>;
  startAttempt(value: NotificationDelivery, expectedVersion: number, attempt: NotificationDeliveryAttempt): Promise<void>;
  saveAttemptOutcome(value: NotificationDelivery, expectedVersion: number, attempt: NotificationDeliveryAttempt): Promise<void>;
  saveDelivery(value: NotificationDelivery, expectedVersion: number): Promise<void>;
  setPreference(input: { id: string; customerId: string; code: string; channel: NotificationChannel; status: NotificationPreferenceStatus; updatedBy: string; at: Date }): Promise<void>;
  publishTemplate(value: NotificationTemplate): Promise<void>;
}

export interface NotificationService {
  request(input: {
    code: string; channel: NotificationChannel; customerId?: string | null;
    recipientType: "CUSTOMER" | "ADMIN" | "SYSTEM"; recipientId: string;
    variables: Readonly<Record<string, unknown>>; idempotencyKey: string; scheduledFor?: Date;
  }): Promise<NotificationDelivery | null>;
}

export interface NotificationProvider {
  readonly code?: string;
  send(input: { channel: NotificationChannel; recipientId: string; subject: string | null; body: string; idempotencyKey: string }): Promise<{ providerReference: string }>;
}

export type CommercialNotificationRequest = {
  code: CommercialNotificationCode;
  channel: Extract<NotificationChannel, "EMAIL" | "IN_APP">;
  customerId: string;
  recipientId: string;
  variables: Readonly<Record<string, string | number | boolean>>;
  idempotencyKey: string;
  scheduledFor?: Date;
};

export interface CommercialNotificationSource {
  listRequired(at: Date, limit: number): Promise<CommercialNotificationRequest[]>;
}
