import type { AuditEvent, AuditJson } from "../domain/audit-event.ts";

export type AuditRecordInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
};

export interface AuditRecorder {
  record(input: AuditRecordInput): Promise<void>;
}

export interface AuditEventRepository {
  append(event: AuditEvent): Promise<void>;
}

export interface AuditSnapshotSanitizer {
  sanitize(value: unknown): AuditJson;
}
