import type { AuditRecordInput, AuditRecorder } from "../../modules/audit/application/ports.ts";

export const NOOP_AUDIT: AuditRecorder = {
  async record(input: AuditRecordInput): Promise<void> { void input; },
};

export class RecordingAudit implements AuditRecorder {
  readonly records: AuditRecordInput[] = [];
  async record(input: AuditRecordInput): Promise<void> {
    this.records.push(input);
  }
}
