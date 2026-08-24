import type { AuditRecorder } from "../../audit/application/ports.ts";
import { AUDIT_ACTIONS } from "../../audit/domain/audit-event.ts";
import type { Clock, IdGenerator } from "../../shared/application/ports.ts";
import { DomainConflictError, DomainValidationError } from "../../shared/domain/errors.ts";
import { EntityId, StableCode } from "../../shared/domain/value-objects.ts";
import { OperationalQueueItem } from "../../operations/domain/operational-queue.ts";
import type { OnboardingRepository } from "./ports.ts";
import { OnboardingCase, OnboardingTask, type OnboardingTaskDependency, type OnboardingTaskOwner, type OnboardingTaskStatus } from "../domain/onboarding.ts";

export type OnboardingTaskDefinition = { code: string; title: string; description?: string | null; ownerType: OnboardingTaskOwner; required?: boolean; dueAt?: Date | null; dependsOnCodes?: readonly string[] };

export class CreateOnboardingCaseService {
  constructor(private readonly repository: OnboardingRepository, private readonly ids: IdGenerator, private readonly clock: Clock, private readonly audit: AuditRecorder) {}
  async execute(customerId: string, definitions: readonly OnboardingTaskDefinition[]) {
    if (definitions.length === 0) throw new DomainValidationError("ONBOARDING_TASKS_REQUIRED", "Onboarding requires at least one task.");
    if (await this.repository.findCurrentCase(customerId)) throw new DomainConflictError("CURRENT_ONBOARDING_EXISTS", "Customer already has current onboarding.");
    const now = this.clock.now(); const caseId = new EntityId(this.ids.next()); const customer = new EntityId(customerId);
    const value = new OnboardingCase({ id: caseId, customerId: customer, status: "NOT_STARTED", startedAt: null, readyAt: null, completedAt: null, cancelledAt: null, version: 1, createdAt: now, updatedAt: now });
    const codeIds = new Map<string, EntityId>();
    const tasks = definitions.map((definition, index) => { const code = new StableCode(definition.code); if (codeIds.has(code.value)) throw new DomainValidationError("DUPLICATE_ONBOARDING_TASK_CODE", "Onboarding task codes must be unique."); const id = new EntityId(this.ids.next()); codeIds.set(code.value, id); return new OnboardingTask({ id, onboardingCaseId: caseId, code, title: definition.title, description: definition.description ?? null, ownerType: definition.ownerType, status: "TODO", required: definition.required ?? true, dueAt: definition.dueAt ?? null, blockedReason: null, sortOrder: index, completedAt: null, version: 1, createdAt: now, updatedAt: now }); });
    const dependencies: OnboardingTaskDependency[] = definitions.flatMap((definition) => (definition.dependsOnCodes ?? []).map((dependencyCode) => { const taskId = codeIds.get(new StableCode(definition.code).value); const dependsOnTaskId = codeIds.get(new StableCode(dependencyCode).value); if (!taskId || !dependsOnTaskId) throw new DomainValidationError("UNKNOWN_ONBOARDING_DEPENDENCY", "Onboarding dependency references an unknown task."); if (taskId.equals(dependsOnTaskId)) throw new DomainValidationError("SELF_ONBOARDING_DEPENDENCY", "A task cannot depend on itself."); return { taskId, dependsOnTaskId, createdAt: now }; }));
    assertAcyclic(tasks, dependencies);
    const dependentTaskIds = new Set(dependencies.map((dependency) => dependency.taskId.value));
    const queues = tasks.filter((task) => !dependentTaskIds.has(task.props.id.value)).map((task) => taskQueue(task, customer, new EntityId(this.ids.next()), now));
    await this.repository.create(value, tasks, dependencies, queues);
    await this.audit.record({ action: AUDIT_ACTIONS.onboardingCaseCreated, entityType: "ONBOARDING_CASE", entityId: caseId.value, after: { case: value.props, tasks: tasks.map((task) => task.props), dependencies } });
    return { onboardingCase: value, tasks };
  }
}

export class OnboardingLifecycleService {
  constructor(private readonly repository: OnboardingRepository, private readonly ids: IdGenerator, private readonly clock: Clock, private readonly audit: AuditRecorder) {}
  async transitionTask(caseId: string, taskId: string, status: OnboardingTaskStatus, blockedReason: string | null = null) {
    const onboardingCase = await this.requiredCase(caseId); const tasks = await this.repository.listTasks(caseId); const current = tasks.find((task) => task.props.id.value === new EntityId(taskId).value);
    if (!current) throw new DomainConflictError("ONBOARDING_TASK_NOT_FOUND", "Onboarding task does not exist in this case.");
    if (["DONE", "SKIPPED"].includes(status)) { const dependencies = await this.repository.listDependencies(taskId); const incomplete = dependencies.some((dependency) => !["DONE", "SKIPPED"].includes(tasks.find((task) => task.props.id.equals(dependency.dependsOnTaskId))?.props.status ?? "TODO")); if (incomplete) throw new DomainConflictError("ONBOARDING_DEPENDENCY_INCOMPLETE", "Task dependencies must be completed first."); }
    const now = this.clock.now(); const nextTask = current.transition(status, now, blockedReason); const nextTasks = tasks.map((task) => task.props.id.equals(current.props.id) ? nextTask : task); const nextCase = onboardingCase.derive(nextTasks, now);
    const queues: OperationalQueueItem[] = [];
    if (["TODO", "IN_PROGRESS", "BLOCKED"].includes(status)) queues.push(taskQueue(nextTask, onboardingCase.props.customerId, new EntityId(this.ids.next()), now));
    if (["DONE", "SKIPPED"].includes(status)) {
      const dependencySets = await Promise.all(nextTasks.map(async (task) => ({ task, dependencies: await this.repository.listDependencies(task.props.id.value) })));
      for (const candidate of dependencySets.filter((value) => value.dependencies.some((dependency) => dependency.dependsOnTaskId.equals(nextTask.props.id)))) {
        if (["TODO", "IN_PROGRESS", "BLOCKED"].includes(candidate.task.props.status) && candidate.dependencies.every((dependency) => ["DONE", "SKIPPED"].includes(nextTasks.find((task) => task.props.id.equals(dependency.dependsOnTaskId))?.props.status ?? "TODO"))) queues.push(taskQueue(candidate.task, onboardingCase.props.customerId, new EntityId(this.ids.next()), now));
      }
    }
    await this.repository.saveTaskProjection(nextTask, current.props.version, nextCase, onboardingCase.props.version, queues);
    await this.audit.record({ action: AUDIT_ACTIONS.onboardingTaskChanged, entityType: "ONBOARDING_TASK", entityId: taskId, before: current.props, after: nextTask.props });
    if (onboardingCase.props.status !== nextCase.props.status) await this.audit.record({ action: AUDIT_ACTIONS.onboardingCaseChanged, entityType: "ONBOARDING_CASE", entityId: caseId, before: onboardingCase.props, after: nextCase.props });
    return { onboardingCase: nextCase, task: nextTask };
  }
  async complete(caseId: string) { const current = await this.requiredCase(caseId); const next = current.complete(this.clock.now()); await this.repository.saveCase(next, current.props.version); await this.audit.record({ action: AUDIT_ACTIONS.onboardingCaseCompleted, entityType: "ONBOARDING_CASE", entityId: caseId, before: current.props, after: next.props }); return next; }
  async cancel(caseId: string) { const current = await this.requiredCase(caseId); const next = current.cancel(this.clock.now()); await this.repository.saveCase(next, current.props.version); await this.audit.record({ action: AUDIT_ACTIONS.onboardingCaseCancelled, entityType: "ONBOARDING_CASE", entityId: caseId, before: current.props, after: next.props }); return next; }
  private async requiredCase(id: string) { const value = await this.repository.findCase(new EntityId(id).value); if (!value) throw new DomainConflictError("ONBOARDING_CASE_NOT_FOUND", "Onboarding case does not exist."); return value; }
}

function taskQueue(task: OnboardingTask, customerId: EntityId, id: EntityId, now: Date) { return new OperationalQueueItem({ id, queueType: task.props.ownerType === "CUSTOMER" ? "CUSTOMER_ACTION" : "INTERNAL_ACTION", sourceType: "ONBOARDING_TASK", sourceId: task.props.id.value, customerId, status: "OPEN", priority: 50, title: task.props.title, availableAt: now, dueAt: task.props.dueAt, assignedToAdminUserId: null, claimedAt: null, resolvedAt: null, version: 1, createdAt: now, updatedAt: now }); }
function assertAcyclic(tasks: readonly OnboardingTask[], dependencies: readonly OnboardingTaskDependency[]) { const edges = new Map(tasks.map((task) => [task.props.id.value, dependencies.filter((value) => value.taskId.equals(task.props.id)).map((value) => value.dependsOnTaskId.value)])); const visiting = new Set<string>(); const visited = new Set<string>(); const visit = (id: string) => { if (visiting.has(id)) throw new DomainValidationError("CYCLIC_ONBOARDING_DEPENDENCY", "Onboarding task dependencies cannot form a cycle."); if (visited.has(id)) return; visiting.add(id); for (const dependency of edges.get(id) ?? []) visit(dependency); visiting.delete(id); visited.add(id); }; for (const task of tasks) visit(task.props.id.value); }
