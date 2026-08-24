import { asc, eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "../../../db/index.ts";
import {
  agentProvisioningJobs, customerIntegrations, customers, invoices,
  onboardingCases, onboardingTasks,
} from "../../../db/schema.ts";
import type { ExpectedOperationalWork, OperationalQueueProjectionSource } from "../application/ports.ts";

export class D1OperationalProjectionSource implements OperationalQueueProjectionSource {
  constructor(private readonly db: AppDatabase) {}

  async listExpected(at: Date, limit: number): Promise<ExpectedOperationalWork[]> {
    const perSource = Math.min(limit, 500);
    const [registrations, cases, tasks, invoiceRows, agentJobs, integrations] = await Promise.all([
      this.db.select({ id: customers.id, businessName: customers.businessName, createdAt: customers.createdAt }).from(customers).where(eq(customers.status, "PROSPECT")).orderBy(asc(customers.createdAt)).limit(perSource),
      this.db.select({ id: onboardingCases.id, customerId: onboardingCases.customerId, status: onboardingCases.status, updatedAt: onboardingCases.updatedAt }).from(onboardingCases).where(inArray(onboardingCases.status, ["IN_PROGRESS", "BLOCKED", "READY"])).orderBy(asc(onboardingCases.updatedAt)).limit(perSource),
      this.db.select({ id: onboardingTasks.id, customerId: onboardingCases.customerId, ownerType: onboardingTasks.ownerType, title: onboardingTasks.title, status: onboardingTasks.status, dueAt: onboardingTasks.dueAt, createdAt: onboardingTasks.createdAt }).from(onboardingTasks).innerJoin(onboardingCases, eq(onboardingCases.id, onboardingTasks.onboardingCaseId)).where(inArray(onboardingTasks.status, ["TODO", "IN_PROGRESS", "BLOCKED"])).orderBy(asc(onboardingTasks.dueAt), asc(onboardingTasks.createdAt)).limit(perSource),
      this.db.select({ id: invoices.id, customerId: invoices.customerId, invoiceNumber: invoices.invoiceNumber, amountDueMinor: invoices.amountDueMinor, currency: invoices.currency, status: invoices.status, dueAt: invoices.dueAt, createdAt: invoices.createdAt }).from(invoices).where(inArray(invoices.status, ["OPEN", "UNCOLLECTIBLE"])).orderBy(asc(invoices.dueAt), asc(invoices.createdAt)).limit(perSource),
      this.db.select({ id: agentProvisioningJobs.id, customerId: agentProvisioningJobs.customerId, operation: agentProvisioningJobs.operation, status: agentProvisioningJobs.status, nextAttemptAt: agentProvisioningJobs.nextAttemptAt, requestedAt: agentProvisioningJobs.requestedAt }).from(agentProvisioningJobs).where(inArray(agentProvisioningJobs.status, ["PENDING", "IN_PROGRESS"])).orderBy(asc(agentProvisioningJobs.nextAttemptAt), asc(agentProvisioningJobs.requestedAt)).limit(perSource),
      this.db.select({ id: customerIntegrations.id, customerId: customerIntegrations.customerId, integrationCode: customerIntegrations.integrationCode, status: customerIntegrations.status, updatedAt: customerIntegrations.updatedAt }).from(customerIntegrations).where(inArray(customerIntegrations.status, ["DEGRADED", "ERROR"])).orderBy(asc(customerIntegrations.updatedAt)).limit(perSource),
    ]);

    const work: ExpectedOperationalWork[] = [];
    for (const row of registrations) work.push({ queueType: "INTERNAL_ACTION", sourceType: "CUSTOMER_REGISTRATION", sourceId: row.id, customerId: row.id, priority: 20, title: `Review new customer registration: ${row.businessName}`, availableAt: row.createdAt, dueAt: row.createdAt });
    for (const row of cases) work.push({ queueType: "INTERNAL_ACTION", sourceType: row.status === "READY" ? "LAUNCH_READY_CUSTOMER" : "ONBOARDING_CASE", sourceId: row.id, customerId: row.customerId, priority: row.status === "BLOCKED" ? 20 : row.status === "READY" ? 15 : 60, title: row.status === "READY" ? "Customer is ready for launch review" : row.status === "BLOCKED" ? "Resolve blocked onboarding" : "Review onboarding progress", availableAt: row.updatedAt, dueAt: null });
    for (const row of tasks) work.push({ queueType: row.ownerType === "CUSTOMER" ? "CUSTOMER_ACTION" : "INTERNAL_ACTION", sourceType: "ONBOARDING_TASK", sourceId: row.id, customerId: row.customerId, priority: row.status === "BLOCKED" ? 20 : 50, title: row.title, availableAt: row.createdAt, dueAt: row.dueAt });
    for (const row of invoiceRows) {
      const overdue = row.dueAt !== null && row.dueAt < at;
      work.push({ queueType: "BILLING_ATTENTION", sourceType: "INVOICE", sourceId: row.id, customerId: row.customerId, priority: row.status === "UNCOLLECTIBLE" ? 5 : overdue ? 10 : 35, title: row.status === "UNCOLLECTIBLE" ? `Invoice ${row.invoiceNumber} is uncollectible` : overdue ? `Overdue payment: ${row.invoiceNumber}` : `Payment due: ${row.invoiceNumber}`, availableAt: row.createdAt, dueAt: row.dueAt });
    }
    for (const row of agentJobs) work.push({ queueType: "AGENT_PROVISIONING", sourceType: "AGENT_PROVISIONING_JOB", sourceId: row.id, customerId: row.customerId, priority: row.status === "IN_PROGRESS" ? 25 : 30, title: `${row.operation.toLowerCase()} customer agent`, availableAt: row.nextAttemptAt ?? row.requestedAt, dueAt: null });
    for (const row of integrations) work.push({ queueType: "INTERNAL_ACTION", sourceType: "CUSTOMER_INTEGRATION", sourceId: row.id, customerId: row.customerId, priority: row.status === "ERROR" ? 20 : 40, title: `Resolve ${row.integrationCode} integration`, availableAt: row.updatedAt, dueAt: null });
    return work.sort(compareWork).slice(0, limit);
  }
}

function compareWork(left: ExpectedOperationalWork, right: ExpectedOperationalWork) {
  return left.priority - right.priority || (left.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER) - (right.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER) || left.availableAt.getTime() - right.availableAt.getTime();
}
