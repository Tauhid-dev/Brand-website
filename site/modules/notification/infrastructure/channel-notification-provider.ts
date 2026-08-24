import { DomainConflictError } from "../../shared/domain/errors.ts";
import type { NotificationProvider } from "../application/ports.ts";
import type { NotificationChannel } from "../domain/notification.ts";

type ChannelSender = NotificationProvider["send"];

export class ChannelNotificationProvider implements NotificationProvider {
  readonly code = "channel_router";
  constructor(private readonly configured: Partial<Record<Exclude<NotificationChannel, "IN_APP">, ChannelSender>> = {}) {}

  async send(input: Parameters<ChannelSender>[0]) {
    if (input.channel === "IN_APP") return { providerReference: `in-app:${input.idempotencyKey}` };
    const sender = this.configured[input.channel];
    if (!sender) throw new DomainConflictError("NOTIFICATION_PROVIDER_NOT_CONFIGURED", `${input.channel} delivery is disabled until an explicit provider is configured.`);
    return sender(input);
  }
}
