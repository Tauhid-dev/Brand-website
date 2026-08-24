import { and, asc, eq, gt, inArray, lte } from "drizzle-orm";
import type { AppDatabase } from "../../../db/index.ts";
import {
  agentLinks, auditEvents, customerDiscounts, customerIntegrations, customers, invoices,
  onboardingCases, onboardingTasks, paymentReminders, subscriptions,
} from "../../../db/schema.ts";
import type { CommercialNotificationRequest, CommercialNotificationSource } from "../application/ports.ts";

export class D1CommercialNotificationSource implements CommercialNotificationSource {
  constructor(private readonly db: AppDatabase) {}

  async listRequired(at: Date, limit: number): Promise<CommercialNotificationRequest[]> {
    const perSource = Math.min(limit, 200);
    const expiringBefore = new Date(at.getTime() + 7 * 24 * 60 * 60_000);
    const [newCustomers, tasks, cases, reminders, overdue, lifecycleEvents, expiringDiscounts, readyAgents, problemIntegrations] = await Promise.all([
      this.db.select({ id: customers.id, email: customers.email, contactName: customers.contactName, businessName: customers.businessName, createdAt: customers.createdAt }).from(customers).where(inArray(customers.status, ["PROSPECT", "ACTIVE", "SUSPENDED"])).orderBy(asc(customers.createdAt)).limit(perSource),
      this.db.select({ id: onboardingTasks.id, version: onboardingTasks.version, title: onboardingTasks.title, dueAt: onboardingTasks.dueAt, customerId: onboardingCases.customerId, email: customers.email, contactName: customers.contactName }).from(onboardingTasks).innerJoin(onboardingCases, eq(onboardingCases.id, onboardingTasks.onboardingCaseId)).innerJoin(customers, eq(customers.id, onboardingCases.customerId)).where(and(eq(onboardingTasks.ownerType, "CUSTOMER"), inArray(onboardingTasks.status, ["TODO", "IN_PROGRESS", "BLOCKED"]))).orderBy(asc(onboardingTasks.dueAt), asc(onboardingTasks.createdAt)).limit(perSource),
      this.db.select({ id: onboardingCases.id, version: onboardingCases.version, status: onboardingCases.status, customerId: onboardingCases.customerId, email: customers.email, contactName: customers.contactName }).from(onboardingCases).innerJoin(customers, eq(customers.id, onboardingCases.customerId)).where(inArray(onboardingCases.status, ["IN_PROGRESS", "BLOCKED"])).orderBy(asc(onboardingCases.updatedAt)).limit(perSource),
      this.db.select({ id: paymentReminders.id, stage: paymentReminders.stage, scheduledFor: paymentReminders.scheduledFor, customerId: invoices.customerId, invoiceNumber: invoices.invoiceNumber, amountDueMinor: invoices.amountDueMinor, currency: invoices.currency, email: customers.email, contactName: customers.contactName }).from(paymentReminders).innerJoin(invoices, eq(invoices.id, paymentReminders.invoiceId)).innerJoin(customers, eq(customers.id, invoices.customerId)).where(and(eq(paymentReminders.status, "SCHEDULED"), lte(paymentReminders.scheduledFor, at))).orderBy(asc(paymentReminders.scheduledFor)).limit(perSource),
      this.db.select({ id: invoices.id, dueAt: invoices.dueAt, customerId: invoices.customerId, invoiceNumber: invoices.invoiceNumber, amountDueMinor: invoices.amountDueMinor, currency: invoices.currency, email: customers.email, contactName: customers.contactName }).from(invoices).innerJoin(customers, eq(customers.id, invoices.customerId)).where(and(eq(invoices.status, "OPEN"), gt(invoices.amountDueMinor, 0), lte(invoices.dueAt, at))).orderBy(asc(invoices.dueAt)).limit(perSource),
      this.db.select({ id: auditEvents.id, action: auditEvents.action, before: auditEvents.beforeJson, after: auditEvents.afterJson, subscriptionId: subscriptions.id, customerId: subscriptions.customerId, email: customers.email, contactName: customers.contactName }).from(auditEvents).innerJoin(subscriptions, eq(subscriptions.id, auditEvents.entityId)).innerJoin(customers, eq(customers.id, subscriptions.customerId)).where(and(eq(auditEvents.entityType, "SUBSCRIPTION"), inArray(auditEvents.action, ["SUBSCRIPTION_CREATED", "SUBSCRIPTION_CHANGED", "SUBSCRIPTION_SUSPENDED", "SUBSCRIPTION_RESUMED", "SUBSCRIPTION_CANCELLED"]))).orderBy(asc(auditEvents.createdAt)).limit(perSource),
      this.db.select({ id: customerDiscounts.id, effectiveTo: customerDiscounts.effectiveTo, customerId: customerDiscounts.customerId, email: customers.email, contactName: customers.contactName }).from(customerDiscounts).innerJoin(customers, eq(customers.id, customerDiscounts.customerId)).where(and(eq(customerDiscounts.status, "ACTIVE"), gt(customerDiscounts.effectiveTo, at), lte(customerDiscounts.effectiveTo, expiringBefore))).orderBy(asc(customerDiscounts.effectiveTo)).limit(perSource),
      this.db.select({ id: agentLinks.id, version: agentLinks.version, customerId: agentLinks.customerId, platform: agentLinks.agentPlatform, email: customers.email, contactName: customers.contactName }).from(agentLinks).innerJoin(customers, eq(customers.id, agentLinks.customerId)).where(eq(agentLinks.status, "ACTIVE")).orderBy(asc(agentLinks.updatedAt)).limit(perSource),
      this.db.select({ id: customerIntegrations.id, version: customerIntegrations.version, customerId: customerIntegrations.customerId, integrationCode: customerIntegrations.integrationCode, status: customerIntegrations.status, email: customers.email, contactName: customers.contactName }).from(customerIntegrations).innerJoin(customers, eq(customers.id, customerIntegrations.customerId)).where(inArray(customerIntegrations.status, ["DEGRADED", "ERROR"])).orderBy(asc(customerIntegrations.updatedAt)).limit(perSource),
    ]);

    const requests: CommercialNotificationRequest[] = [];
    const add = (request: CommercialNotificationRequest) => { if (requests.length < limit) requests.push(request); };
    for (const row of newCustomers) add(emailRequest("welcome", row.id, row.email, { name: row.contactName, business: row.businessName }, `welcome:${row.id}`));
    for (const row of tasks) {
      const variables = { name: row.contactName, task: row.title, due_date: formatDate(row.dueAt) };
      add(emailRequest("customer_action_required", row.customerId, row.email, variables, `customer-action:${row.id}:${row.version}:email`));
      add(inAppRequest("customer_action_required", row.customerId, variables, `customer-action:${row.id}:${row.version}:in-app`));
    }
    for (const row of cases) add(emailRequest("onboarding_reminder", row.customerId, row.email, { name: row.contactName, status: row.status }, `onboarding-reminder:${row.id}:${row.version}`));
    for (const row of reminders) add(emailRequest("payment_reminder", row.customerId, row.email, { name: row.contactName, invoice: row.invoiceNumber, amount: money(row.amountDueMinor, row.currency), stage: row.stage }, `payment-reminder:${row.id}`));
    for (const row of overdue) add(emailRequest("payment_overdue", row.customerId, row.email, { name: row.contactName, invoice: row.invoiceNumber, amount: money(row.amountDueMinor, row.currency), due_date: formatDate(row.dueAt) }, `payment-overdue:${row.id}:${row.dueAt?.getTime() ?? 0}`));
    for (const row of lifecycleEvents) {
      const code = lifecycleCode(row.action, row.before, row.after);
      if (code) add(emailRequest(code, row.customerId, row.email, { name: row.contactName }, `${code}:${row.subscriptionId}:${row.id}`));
    }
    for (const row of expiringDiscounts) add(emailRequest("discount_expiring", row.customerId, row.email, { name: row.contactName, expiry_date: formatDate(row.effectiveTo) }, `discount-expiring:${row.id}:${row.effectiveTo?.getTime() ?? 0}`));
    for (const row of readyAgents) {
      const variables = { name: row.contactName, platform: row.platform };
      add(emailRequest("agent_ready", row.customerId, row.email, variables, `agent-ready:${row.id}:${row.version}:email`));
      add(inAppRequest("agent_ready", row.customerId, variables, `agent-ready:${row.id}:${row.version}:in-app`));
    }
    for (const row of problemIntegrations) add(emailRequest("integration_action_required", row.customerId, row.email, { name: row.contactName, integration: row.integrationCode, status: row.status }, `integration-action:${row.id}:${row.version}`));
    return requests;
  }
}

function emailRequest(code: CommercialNotificationRequest["code"], customerId: string, recipientId: string, variables: CommercialNotificationRequest["variables"], idempotencyKey: string): CommercialNotificationRequest {
  return { code, channel: "EMAIL", customerId, recipientId, variables, idempotencyKey };
}
function inAppRequest(code: CommercialNotificationRequest["code"], customerId: string, variables: CommercialNotificationRequest["variables"], idempotencyKey: string): CommercialNotificationRequest {
  return { code, channel: "IN_APP", customerId, recipientId: customerId, variables, idempotencyKey };
}
function formatDate(value: Date | null) { return value ? value.toISOString().slice(0, 10) : "not specified"; }
function money(amountMinor: number, currency: string) { return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(amountMinor / 100); }
function lifecycleCode(action: string, before: unknown, after: unknown): Extract<CommercialNotificationRequest["code"], "subscription_activated" | "subscription_suspended" | "subscription_resumed" | "subscription_cancelled"> | null {
  if (action === "SUBSCRIPTION_SUSPENDED") return "subscription_suspended";
  if (action === "SUBSCRIPTION_RESUMED") return "subscription_resumed";
  if (action === "SUBSCRIPTION_CANCELLED") return "subscription_cancelled";
  const afterStatus = subscriptionStatus(after);
  const beforeStatus = subscriptionStatus(before);
  if (action === "SUBSCRIPTION_CREATED" && afterStatus === "ACTIVE") return "subscription_activated";
  if (action === "SUBSCRIPTION_CHANGED" && afterStatus === "ACTIVE" && ["PENDING", "TRIAL"].includes(beforeStatus ?? "")) return "subscription_activated";
  return null;
}
function subscriptionStatus(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const object = value as Record<string, unknown>;
  const subscription = object.subscription;
  if (subscription && typeof subscription === "object" && !Array.isArray(subscription)) {
    const status = (subscription as Record<string, unknown>).status;
    return typeof status === "string" ? status : null;
  }
  return typeof object.status === "string" ? object.status : null;
}
