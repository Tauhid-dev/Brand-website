import { and, asc, eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "../../../db/index.ts";
import { onboardingCases, onboardingTaskDependencies, onboardingTasks } from "../../../db/schema.ts";
import { DomainConflictError } from "../../shared/domain/errors.ts";
import { EntityId, StableCode } from "../../shared/domain/value-objects.ts";
import type { OperationalQueueItem } from "../../operations/domain/operational-queue.ts";
import { findActiveOperationalQueueRows, insertOperationalQueueItem, resolveOperationalQueueItem } from "../../operations/infrastructure/d1-operational-queue-statements.ts";
import type { OnboardingRepository } from "../application/ports.ts";
import { OnboardingCase, OnboardingTask, type OnboardingStatus, type OnboardingTaskDependency, type OnboardingTaskOwner, type OnboardingTaskStatus } from "../domain/onboarding.ts";

export class D1OnboardingRepository implements OnboardingRepository {
  constructor(private readonly db: AppDatabase) {}
  async findCurrentCase(customerId: string) { const [row] = await this.db.select().from(onboardingCases).where(and(eq(onboardingCases.customerId, customerId), inArray(onboardingCases.status, ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "READY"]))).limit(1); return row ? mapCase(row) : null; }
  async findCase(id: string) { const [row] = await this.db.select().from(onboardingCases).where(eq(onboardingCases.id, id)).limit(1); return row ? mapCase(row) : null; }
  async listTasks(caseId: string) { const rows = await this.db.select().from(onboardingTasks).where(eq(onboardingTasks.onboardingCaseId, caseId)).orderBy(asc(onboardingTasks.sortOrder)); return rows.map(mapTask); }
  async listDependencies(taskId: string) { const rows = await this.db.select().from(onboardingTaskDependencies).where(eq(onboardingTaskDependencies.taskId, taskId)); return rows.map((row): OnboardingTaskDependency => ({ taskId: new EntityId(row.taskId), dependsOnTaskId: new EntityId(row.dependsOnTaskId), createdAt: row.createdAt })); }
  async create(value: OnboardingCase, tasks: readonly OnboardingTask[], dependencies: readonly OnboardingTaskDependency[], queues: readonly OperationalQueueItem[]) {
    type BatchItem = Parameters<AppDatabase["batch"]>[0][number]; const statements: BatchItem[] = [insertCase(this.db, value), ...tasks.map((task) => insertTask(this.db, task)), ...dependencies.map((dependency) => this.db.insert(onboardingTaskDependencies).values({ taskId: dependency.taskId.value, dependsOnTaskId: dependency.dependsOnTaskId.value, createdAt: dependency.createdAt })), ...queues.map((queue) => insertQueue(this.db, queue))];
    try { await this.db.batch(statements as [BatchItem, ...BatchItem[]]); } catch (error) { throw mapConflict(error); }
  }
  async saveTaskProjection(task: OnboardingTask, expectedTaskVersion: number, onboardingCase: OnboardingCase, expectedCaseVersion: number, queues: readonly OperationalQueueItem[]) {
    const currentQueues = await findActiveOperationalQueueRows(this.db, "ONBOARDING_TASK", task.props.id.value);
    type BatchItem = Parameters<AppDatabase["batch"]>[0][number]; const tp = task.props; const cp = onboardingCase.props;
    const statements: BatchItem[] = [
      this.db.update(onboardingTasks).set({ status: tp.status, blockedReason: tp.blockedReason, completedAt: tp.completedAt, version: expectedTaskVersion + 1, updatedAt: tp.updatedAt }).where(eq(onboardingTasks.id, tp.id.value)),
      this.db.update(onboardingCases).set({ status: cp.status, startedAt: cp.startedAt, readyAt: cp.readyAt, completedAt: cp.completedAt, cancelledAt: cp.cancelledAt, version: expectedCaseVersion + 1, updatedAt: cp.updatedAt }).where(eq(onboardingCases.id, cp.id.value)),
      ...currentQueues.map((item) => resolveOperationalQueueItem(this.db, item, tp.updatedAt)),
    ];
    statements.push(...queues.map((queue) => insertQueue(this.db, queue)));
    try { await this.db.batch(statements as [BatchItem, ...BatchItem[]]); } catch (error) { throw mapConflict(error); }
  }
  async saveCase(value: OnboardingCase, expectedVersion: number) { const p = value.props; const result = await this.db.update(onboardingCases).set({ status: p.status, startedAt: p.startedAt, readyAt: p.readyAt, completedAt: p.completedAt, cancelledAt: p.cancelledAt, version: p.version, updatedAt: p.updatedAt }).where(and(eq(onboardingCases.id, p.id.value), eq(onboardingCases.version, expectedVersion))); if (Number(result.meta.changes) !== 1) throw new DomainConflictError("ONBOARDING_VERSION_CONFLICT", "Onboarding case changed concurrently."); }
}

function insertCase(db: AppDatabase, value: OnboardingCase) { const p = value.props; return db.insert(onboardingCases).values({ id: p.id.value, customerId: p.customerId.value, status: p.status, startedAt: p.startedAt, readyAt: p.readyAt, completedAt: p.completedAt, cancelledAt: p.cancelledAt, version: p.version, createdAt: p.createdAt, updatedAt: p.updatedAt }); }
function insertTask(db: AppDatabase, value: OnboardingTask) { const p = value.props; return db.insert(onboardingTasks).values({ id: p.id.value, onboardingCaseId: p.onboardingCaseId.value, code: p.code.value, title: p.title, description: p.description, ownerType: p.ownerType, status: p.status, required: p.required, dueAt: p.dueAt, blockedReason: p.blockedReason, sortOrder: p.sortOrder, completedAt: p.completedAt, version: p.version, createdAt: p.createdAt, updatedAt: p.updatedAt }); }
const insertQueue = insertOperationalQueueItem;
function mapCase(row: typeof onboardingCases.$inferSelect) { return new OnboardingCase({ id: new EntityId(row.id), customerId: new EntityId(row.customerId), status: row.status as OnboardingStatus, startedAt: row.startedAt, readyAt: row.readyAt, completedAt: row.completedAt, cancelledAt: row.cancelledAt, version: row.version, createdAt: row.createdAt, updatedAt: row.updatedAt }); }
function mapTask(row: typeof onboardingTasks.$inferSelect) { return new OnboardingTask({ id: new EntityId(row.id), onboardingCaseId: new EntityId(row.onboardingCaseId), code: new StableCode(row.code), title: row.title, description: row.description, ownerType: row.ownerType as OnboardingTaskOwner, status: row.status as OnboardingTaskStatus, required: row.required, dueAt: row.dueAt, blockedReason: row.blockedReason, sortOrder: row.sortOrder, completedAt: row.completedAt, version: row.version, createdAt: row.createdAt, updatedAt: row.updatedAt }); }
function mapConflict(error: unknown): DomainConflictError { const message = error instanceof Error ? error.message : ""; if (message.includes("onboarding_cases.customer_id")) return new DomainConflictError("CURRENT_ONBOARDING_EXISTS", "Customer already has current onboarding."); if (message.includes("VERSION_CONFLICT")) return new DomainConflictError("ONBOARDING_VERSION_CONFLICT", "Onboarding changed concurrently."); throw error; }
