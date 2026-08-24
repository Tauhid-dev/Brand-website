import type { OperationalQueueItem } from "../../operations/domain/operational-queue.ts";
import type { OnboardingCase, OnboardingTask, OnboardingTaskDependency } from "../domain/onboarding.ts";

export interface OnboardingRepository {
  findCurrentCase(customerId: string): Promise<OnboardingCase | null>;
  findCase(id: string): Promise<OnboardingCase | null>;
  listTasks(caseId: string): Promise<OnboardingTask[]>;
  listDependencies(taskId: string): Promise<OnboardingTaskDependency[]>;
  create(value: OnboardingCase, tasks: readonly OnboardingTask[], dependencies: readonly OnboardingTaskDependency[], queues: readonly OperationalQueueItem[]): Promise<void>;
  saveTaskProjection(task: OnboardingTask, expectedTaskVersion: number, onboardingCase: OnboardingCase, expectedCaseVersion: number, queues: readonly OperationalQueueItem[]): Promise<void>;
  saveCase(value: OnboardingCase, expectedVersion: number): Promise<void>;
}
