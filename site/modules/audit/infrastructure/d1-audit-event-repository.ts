import type { AppDatabase } from "../../../db/index.ts";
import { auditEvents } from "../../../db/schema.ts";
import type { AuditEventRepository } from "../application/ports.ts";
import type { AuditEvent } from "../domain/audit-event.ts";

export class D1AuditEventRepository implements AuditEventRepository {
  constructor(private readonly db: AppDatabase) {}

  async append(event: AuditEvent): Promise<void> {
    const { props } = event;
    await this.db.insert(auditEvents).values({
      id: props.id.value,
      actorType: props.actor.type,
      actorId: props.actor.type === "ANONYMOUS" ? null : props.actor.id,
      action: props.action,
      entityType: props.entityType,
      entityId: props.entityId,
      beforeJson: props.before,
      afterJson: props.after,
      requestId: props.requestId,
      ipAddress: props.ipAddress,
      userAgent: props.userAgent,
      createdAt: props.createdAt,
    });
  }
}
