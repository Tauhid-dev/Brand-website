import { DomainConflictError, DomainValidationError } from "../../shared/domain/errors.ts";
import { EntityId, StableCode, optionalText, requireText } from "../../shared/domain/value-objects.ts";

export const ONBOARDING_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "READY", "COMPLETED", "CANCELLED"] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];
export type OnboardingTaskOwner = "CUSTOMER" | "INTERNAL";
export type OnboardingTaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "SKIPPED" | "CANCELLED";

export type OnboardingCaseProps = { id: EntityId; customerId: EntityId; status: OnboardingStatus; startedAt: Date | null; readyAt: Date | null; completedAt: Date | null; cancelledAt: Date | null; version: number; createdAt: Date; updatedAt: Date };
export class OnboardingCase {
  readonly props: Readonly<OnboardingCaseProps>;
  constructor(input: OnboardingCaseProps) {
    if (!ONBOARDING_STATUSES.includes(input.status)) throw new DomainValidationError("INVALID_ONBOARDING_STATUS", "Onboarding status is invalid.");
    if (!Number.isSafeInteger(input.version) || input.version < 1) throw new DomainValidationError("INVALID_ONBOARDING_VERSION", "Onboarding version must be positive.");
    this.props = Object.freeze(input);
  }
  derive(tasks: readonly OnboardingTask[], at: Date): OnboardingCase {
    if (["COMPLETED", "CANCELLED"].includes(this.props.status)) throw new DomainConflictError("ONBOARDING_CASE_CLOSED", "Closed onboarding cases cannot change.");
    const required = tasks.filter((task) => task.props.required);
    const status: OnboardingStatus = required.length > 0 && required.every((task) => ["DONE", "SKIPPED"].includes(task.props.status)) ? "READY" : tasks.some((task) => task.props.status === "BLOCKED") ? "BLOCKED" : "IN_PROGRESS";
    return new OnboardingCase({ ...this.props, status, startedAt: this.props.startedAt ?? at, readyAt: status === "READY" ? (this.props.readyAt ?? at) : null, updatedAt: at, version: this.props.version + 1 });
  }
  complete(at: Date) { if (this.props.status !== "READY") throw new DomainConflictError("ONBOARDING_NOT_READY", "Only ready onboarding can be completed."); return new OnboardingCase({ ...this.props, status: "COMPLETED", completedAt: at, updatedAt: at, version: this.props.version + 1 }); }
  cancel(at: Date) { if (["COMPLETED", "CANCELLED"].includes(this.props.status)) throw new DomainConflictError("ONBOARDING_CASE_CLOSED", "Onboarding case is already closed."); return new OnboardingCase({ ...this.props, status: "CANCELLED", cancelledAt: at, updatedAt: at, version: this.props.version + 1 }); }
}

export type OnboardingTaskProps = { id: EntityId; onboardingCaseId: EntityId; code: StableCode; title: string; description: string | null; ownerType: OnboardingTaskOwner; status: OnboardingTaskStatus; required: boolean; dueAt: Date | null; blockedReason: string | null; sortOrder: number; completedAt: Date | null; version: number; createdAt: Date; updatedAt: Date };
export class OnboardingTask {
  readonly props: Readonly<OnboardingTaskProps>;
  constructor(input: OnboardingTaskProps) {
    if (!["CUSTOMER", "INTERNAL"].includes(input.ownerType)) throw new DomainValidationError("INVALID_TASK_OWNER", "Onboarding task owner is invalid.");
    if (!["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "SKIPPED", "CANCELLED"].includes(input.status)) throw new DomainValidationError("INVALID_TASK_STATUS", "Onboarding task status is invalid.");
    if (input.status === "BLOCKED" && !input.blockedReason) throw new DomainValidationError("BLOCKED_REASON_REQUIRED", "Blocked tasks require a reason.");
    if ((input.status === "DONE") !== (input.completedAt != null)) throw new DomainValidationError("INVALID_TASK_COMPLETION", "Done tasks require a completion time exclusively.");
    if (!Number.isSafeInteger(input.sortOrder) || input.sortOrder < 0 || !Number.isSafeInteger(input.version) || input.version < 1) throw new DomainValidationError("INVALID_TASK_VERSION", "Task order and version must be non-negative.");
    this.props = Object.freeze({ ...input, title: requireText(input.title, "title", 200), description: optionalText(input.description, "description", 2000), blockedReason: optionalText(input.blockedReason, "blockedReason", 500) });
  }
  transition(status: OnboardingTaskStatus, at: Date, blockedReason: string | null = null) {
    if (["DONE", "SKIPPED", "CANCELLED"].includes(this.props.status)) throw new DomainConflictError("ONBOARDING_TASK_CLOSED", "Closed onboarding tasks cannot change.");
    if (status === "TODO") throw new DomainConflictError("INVALID_TASK_TRANSITION", "Tasks cannot transition back to TODO.");
    return new OnboardingTask({ ...this.props, status, blockedReason: status === "BLOCKED" ? blockedReason : null, completedAt: status === "DONE" ? at : null, updatedAt: at, version: this.props.version + 1 });
  }
}

export type OnboardingTaskDependency = { taskId: EntityId; dependsOnTaskId: EntityId; createdAt: Date };
