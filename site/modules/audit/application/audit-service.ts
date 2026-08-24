import type { Clock, IdGenerator } from "../../shared/application/ports.ts";
import type { RequestContext } from "../../shared/application/request-context.ts";
import { EntityId } from "../../shared/domain/value-objects.ts";
import { AuditEvent, type AuditJson } from "../domain/audit-event.ts";
import type { AuditEventRepository, AuditRecordInput, AuditRecorder, AuditSnapshotSanitizer } from "./ports.ts";

const SENSITIVE_KEY = /(password|passphrase|secret|token|credential|authorization|cookie|api.?key|hash)/i;

export class RedactingAuditSnapshotSanitizer implements AuditSnapshotSanitizer {
  sanitize(value: unknown): AuditJson {
    return sanitizeValue(value, new WeakSet<object>(), 0);
  }
}

export class AuditService implements AuditRecorder {
  constructor(
    private readonly repository: AuditEventRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly context: RequestContext,
    private readonly sanitizer: AuditSnapshotSanitizer = new RedactingAuditSnapshotSanitizer(),
  ) {}

  async record(input: AuditRecordInput): Promise<void> {
    await this.repository.append(new AuditEvent({
      id: new EntityId(this.ids.next()),
      actor: this.context.actor,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: this.sanitizer.sanitize(input.before ?? null),
      after: this.sanitizer.sanitize(input.after ?? null),
      requestId: this.context.requestId,
      ipAddress: this.context.ipAddress,
      userAgent: this.context.userAgent,
      createdAt: this.clock.now(),
    }));
  }
}

function sanitizeValue(value: unknown, seen: WeakSet<object>, depth: number): AuditJson {
  if (value == null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "string") return value.slice(0, 4_000);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "undefined") return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  if (depth >= 8) return "[TRUNCATED]";
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) {
    const result = value.slice(0, 100).map((item) => sanitizeValue(item, seen, depth + 1));
    seen.delete(value);
    return result;
  }
  const output: Record<string, AuditJson> = {};
  for (const [key, item] of Object.entries(value).slice(0, 100)) {
    output[key] = SENSITIVE_KEY.test(key) ? "[REDACTED]" : sanitizeValue(item, seen, depth + 1);
  }
  seen.delete(value);
  return output;
}
