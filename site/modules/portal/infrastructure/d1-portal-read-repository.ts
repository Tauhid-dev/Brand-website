import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import type { AppDatabase } from "../../../db/index.ts";
import {
  adminUserRoles, adminUsers, agentLinks, agentProvisioningJobs, auditEvents,
  customerBusinessProfiles, customerDiscounts, customerIntegrations, customerNotes,
  customerPriceOverrides, customers, discountRedemptions, discounts, invoiceLines,
  invoices, notificationPreferences, offerings, onboardingCases, onboardingTasks,
  operationalQueueItems, paymentReminders, planFeatures, planPrices, plans,
  priceQuotes, promotionCodes, roles, subscriptionEntitlements, subscriptions,
} from "../../../db/schema.ts";
import type { AdminCustomerView, AdminDashboardView, CustomerAccountView, PortalCustomerSummary, PortalReadRepository } from "../application/ports.ts";

const CURRENT_SUBSCRIPTION_STATUSES = ["PENDING", "TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED"];

export class D1PortalReadRepository implements PortalReadRepository {
  constructor(private readonly db: AppDatabase) {}

  async getCustomerAccount(customerId: string): Promise<CustomerAccountView | null> {
    const [customer] = await this.db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    if (!customer) return null;
    const [profile, onboarding, subscription] = await Promise.all([
      this.db.select().from(customerBusinessProfiles).where(eq(customerBusinessProfiles.customerId, customerId)).limit(1).then((rows) => rows[0] ?? null),
      this.db.select().from(onboardingCases).where(eq(onboardingCases.customerId, customerId)).orderBy(desc(onboardingCases.createdAt)).limit(1).then((rows) => rows[0] ?? null),
      this.db.select({ subscription: subscriptions, planName: plans.name }).from(subscriptions).innerJoin(plans, eq(plans.id, subscriptions.planId)).where(eq(subscriptions.customerId, customerId)).orderBy(desc(subscriptions.createdAt)).limit(1).then((rows) => rows[0] ?? null),
    ]);
    const [tasks, integrations, entitlements, invoiceRows, reminderRows, links, jobs, preferences] = await Promise.all([
      onboarding ? this.db.select().from(onboardingTasks).where(eq(onboardingTasks.onboardingCaseId, onboarding.id)).orderBy(onboardingTasks.sortOrder) : [],
      this.db.select().from(customerIntegrations).where(eq(customerIntegrations.customerId, customerId)).orderBy(customerIntegrations.integrationCode),
      subscription ? this.db.select().from(subscriptionEntitlements).where(and(eq(subscriptionEntitlements.subscriptionId, subscription.subscription.id), sql`${subscriptionEntitlements.effectiveTo} is null`)).orderBy(subscriptionEntitlements.offeringCode) : [],
      this.db.select().from(invoices).where(eq(invoices.customerId, customerId)).orderBy(desc(invoices.createdAt)).limit(50),
      this.db.select({ reminder: paymentReminders, invoiceNumber: invoices.invoiceNumber }).from(paymentReminders).innerJoin(invoices, eq(invoices.id, paymentReminders.invoiceId)).where(eq(invoices.customerId, customerId)).orderBy(desc(paymentReminders.createdAt)).limit(50),
      this.db.select().from(agentLinks).where(eq(agentLinks.customerId, customerId)).orderBy(agentLinks.agentPlatform),
      this.db.select().from(agentProvisioningJobs).where(eq(agentProvisioningJobs.customerId, customerId)).orderBy(desc(agentProvisioningJobs.createdAt)).limit(25),
      this.db.select().from(notificationPreferences).where(eq(notificationPreferences.customerId, customerId)).orderBy(notificationPreferences.notificationCode),
    ]);
    return {
      customer: { id: customer.id, externalReference: customer.externalReference, businessName: customer.businessName, contactName: customer.contactName, email: customer.email, phone: customer.phone, industry: customer.industry, websiteUrl: customer.websiteUrl, status: customer.status, subscriptionStatus: subscription?.subscription.status ?? null, planName: subscription?.planName ?? null, createdAt: customer.createdAt },
      profile,
      onboarding: onboarding ? { id: onboarding.id, status: onboarding.status, tasks } : null,
      integrations,
      subscription: subscription ? { ...subscription.subscription, planName: subscription.planName } : null,
      entitlements,
      invoices: invoiceRows,
      reminders: reminderRows.map((row) => ({ ...row.reminder, invoiceNumber: row.invoiceNumber })),
      agentLinks: links,
      agentJobs: jobs,
      notificationPreferences: preferences,
    };
  }

  async getAdminDashboard(): Promise<AdminDashboardView> {
    const [customerCount, subscriptionCount, onboardingCount, invoiceCount, queueCount, queues, recentCustomers] = await Promise.all([
      countRows(this.db, customers),
      this.db.select({ count: sql<number>`count(*)` }).from(subscriptions).where(inArray(subscriptions.status, CURRENT_SUBSCRIPTION_STATUSES)).then(firstCount),
      this.db.select({ count: sql<number>`count(*)` }).from(onboardingCases).where(inArray(onboardingCases.status, ["BLOCKED", "READY"])).then(firstCount),
      this.db.select({ count: sql<number>`count(*)` }).from(invoices).where(inArray(invoices.status, ["OPEN", "UNCOLLECTIBLE"])).then(firstCount),
      this.db.select({ count: sql<number>`count(*)` }).from(operationalQueueItems).where(inArray(operationalQueueItems.status, ["OPEN", "CLAIMED"])).then(firstCount),
      this.db.select().from(operationalQueueItems).where(inArray(operationalQueueItems.status, ["OPEN", "CLAIMED"])).orderBy(operationalQueueItems.priority, operationalQueueItems.availableAt).limit(20),
      this.searchCustomers({ limit: 8 }),
    ]);
    return { metrics: { customers: customerCount, currentSubscriptions: subscriptionCount, onboardingAttention: onboardingCount, openInvoices: invoiceCount, openQueueItems: queueCount }, queues, recentCustomers };
  }

  async searchCustomers(input: { query?: string; subscriptionStatus?: string; limit?: number }): Promise<PortalCustomerSummary[]> {
    const query = input.query?.trim().slice(0, 120);
    const conditions = [];
    if (query) {
      const pattern = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
      conditions.push(or(like(customers.businessName, pattern), like(customers.contactName, pattern), like(customers.email, pattern), like(customers.phone, pattern), like(customers.id, pattern), like(customers.externalReference, pattern))!);
    }
    if (input.subscriptionStatus) conditions.push(eq(subscriptions.status, input.subscriptionStatus));
    const rows = await this.db.select({ id: customers.id, externalReference: customers.externalReference, businessName: customers.businessName, contactName: customers.contactName, email: customers.email, phone: customers.phone, status: customers.status, subscriptionStatus: subscriptions.status, planName: plans.name, createdAt: customers.createdAt }).from(customers).leftJoin(subscriptions, and(eq(subscriptions.customerId, customers.id), inArray(subscriptions.status, CURRENT_SUBSCRIPTION_STATUSES))).leftJoin(plans, eq(plans.id, subscriptions.planId)).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(customers.createdAt)).limit(Math.min(Math.max(input.limit ?? 50, 1), 100));
    return rows;
  }

  async getAdminCustomer(customerId: string): Promise<AdminCustomerView | null> {
    const account = await this.getCustomerAccount(customerId);
    if (!account) return null;
    const [notes, overrides, assignedDiscounts, history] = await Promise.all([
      this.db.select().from(customerNotes).where(eq(customerNotes.customerId, customerId)).orderBy(desc(customerNotes.createdAt)).limit(100),
      this.db.select({ override: customerPriceOverrides, planName: plans.name }).from(customerPriceOverrides).innerJoin(plans, eq(plans.id, customerPriceOverrides.planId)).where(eq(customerPriceOverrides.customerId, customerId)).orderBy(desc(customerPriceOverrides.effectiveFrom)),
      this.db.select({ assignment: customerDiscounts, discountCode: discounts.code, discountName: discounts.name }).from(customerDiscounts).innerJoin(discounts, eq(discounts.id, customerDiscounts.discountId)).where(eq(customerDiscounts.customerId, customerId)).orderBy(desc(customerDiscounts.effectiveFrom)),
      this.db.select().from(auditEvents).where(or(and(eq(auditEvents.entityType, "CUSTOMER"), eq(auditEvents.entityId, customerId)), sql`${auditEvents.afterJson} like ${`%${customerId}%`}`)).orderBy(desc(auditEvents.createdAt)).limit(100),
    ]);
    return { ...account, notes, priceOverrides: overrides.map((row) => ({ ...row.override, planName: row.planName })), discounts: assignedDiscounts.map((row) => ({ ...row.assignment, discountCode: row.discountCode, discountName: row.discountName })), auditEvents: history };
  }

  async getCatalogue() {
    const [planRows, offeringRows, featureRows, priceRows] = await Promise.all([
      this.db.select().from(plans).orderBy(plans.displayOrder, plans.name),
      this.db.select().from(offerings).orderBy(offerings.displayOrder, offerings.name),
      this.db.select({ feature: planFeatures, planName: plans.name, offeringName: offerings.name, offeringCode: offerings.code }).from(planFeatures).innerJoin(plans, eq(plans.id, planFeatures.planId)).innerJoin(offerings, eq(offerings.id, planFeatures.offeringId)).orderBy(plans.displayOrder, offerings.displayOrder),
      this.db.select({ price: planPrices, planName: plans.name }).from(planPrices).innerJoin(plans, eq(plans.id, planPrices.planId)).orderBy(plans.displayOrder, desc(planPrices.effectiveFrom)),
    ]);
    return { plans: planRows, offerings: offeringRows, features: featureRows.map((row) => ({ ...row.feature, planName: row.planName, offeringName: row.offeringName, offeringCode: row.offeringCode })), prices: priceRows.map((row) => ({ ...row.price, planName: row.planName })) };
  }

  async getPricing() {
    const [prices, overrides, quotes] = await Promise.all([
      this.db.select({ price: planPrices, planName: plans.name }).from(planPrices).innerJoin(plans, eq(plans.id, planPrices.planId)).orderBy(desc(planPrices.effectiveFrom)).limit(200),
      this.db.select({ override: customerPriceOverrides, customerName: customers.businessName, planName: plans.name }).from(customerPriceOverrides).innerJoin(customers, eq(customers.id, customerPriceOverrides.customerId)).innerJoin(plans, eq(plans.id, customerPriceOverrides.planId)).orderBy(desc(customerPriceOverrides.effectiveFrom)).limit(200),
      this.db.select({ quote: priceQuotes, customerName: customers.businessName, planName: plans.name }).from(priceQuotes).innerJoin(customers, eq(customers.id, priceQuotes.customerId)).innerJoin(plans, eq(plans.id, priceQuotes.planId)).orderBy(desc(priceQuotes.createdAt)).limit(100),
    ]);
    return { prices: prices.map((row) => ({ ...row.price, planName: row.planName })), overrides: overrides.map((row) => ({ ...row.override, customerName: row.customerName, planName: row.planName })), quotes: quotes.map((row) => ({ ...row.quote, customerName: row.customerName, planName: row.planName })) };
  }

  async getDiscounts() {
    const [definitions, promotions, assignments, redemptions] = await Promise.all([
      this.db.select().from(discounts).orderBy(desc(discounts.createdAt)),
      this.db.select({ promotion: promotionCodes, discountName: discounts.name }).from(promotionCodes).innerJoin(discounts, eq(discounts.id, promotionCodes.discountId)).orderBy(desc(promotionCodes.createdAt)),
      this.db.select({ assignment: customerDiscounts, discountName: discounts.name, customerName: customers.businessName }).from(customerDiscounts).innerJoin(discounts, eq(discounts.id, customerDiscounts.discountId)).innerJoin(customers, eq(customers.id, customerDiscounts.customerId)).orderBy(desc(customerDiscounts.createdAt)).limit(200),
      this.db.select().from(discountRedemptions).orderBy(desc(discountRedemptions.redeemedAt)).limit(200),
    ]);
    return { discounts: definitions, promotions: promotions.map((row) => ({ ...row.promotion, discountName: row.discountName })), assignments: assignments.map((row) => ({ ...row.assignment, discountName: row.discountName, customerName: row.customerName })), redemptions };
  }

  async getSubscriptions() { return this.db.select({ subscription: subscriptions, customerName: customers.businessName, planName: plans.name }).from(subscriptions).innerJoin(customers, eq(customers.id, subscriptions.customerId)).innerJoin(plans, eq(plans.id, subscriptions.planId)).orderBy(desc(subscriptions.updatedAt)).limit(200).then((rows) => rows.map((row) => ({ ...row.subscription, customerName: row.customerName, planName: row.planName }))); }
  async getBilling() { const [invoiceRows, reminderRows] = await Promise.all([this.db.select({ invoice: invoices, customerName: customers.businessName, lineCount: sql<number>`count(${invoiceLines.id})` }).from(invoices).innerJoin(customers, eq(customers.id, invoices.customerId)).leftJoin(invoiceLines, eq(invoiceLines.invoiceId, invoices.id)).groupBy(invoices.id).orderBy(desc(invoices.createdAt)).limit(200), this.db.select({ reminder: paymentReminders, invoiceNumber: invoices.invoiceNumber, customerName: customers.businessName }).from(paymentReminders).innerJoin(invoices, eq(invoices.id, paymentReminders.invoiceId)).innerJoin(customers, eq(customers.id, invoices.customerId)).orderBy(desc(paymentReminders.createdAt)).limit(200)]); return { invoices: invoiceRows.map((row) => ({ ...row.invoice, customerName: row.customerName, lineCount: Number(row.lineCount) })), reminders: reminderRows.map((row) => ({ ...row.reminder, invoiceNumber: row.invoiceNumber, customerName: row.customerName })) }; }
  async getAgents() { const [links, jobs] = await Promise.all([this.db.select({ link: agentLinks, customerName: customers.businessName }).from(agentLinks).innerJoin(customers, eq(customers.id, agentLinks.customerId)).orderBy(desc(agentLinks.updatedAt)), this.db.select({ job: agentProvisioningJobs, customerName: customers.businessName, platform: agentLinks.agentPlatform }).from(agentProvisioningJobs).innerJoin(customers, eq(customers.id, agentProvisioningJobs.customerId)).innerJoin(agentLinks, eq(agentLinks.id, agentProvisioningJobs.agentLinkId)).orderBy(desc(agentProvisioningJobs.createdAt)).limit(200)]); return { links: links.map((row) => ({ ...row.link, customerName: row.customerName })), jobs: jobs.map((row) => ({ ...row.job, customerName: row.customerName, platform: row.platform })) }; }
  async getAuditEvents(limit = 200) { return this.db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(Math.min(Math.max(limit, 1), 500)); }
  async getAdminUsers() { return this.db.select({ user: adminUsers, roleCode: roles.code }).from(adminUsers).leftJoin(adminUserRoles, eq(adminUserRoles.adminUserId, adminUsers.id)).leftJoin(roles, eq(roles.id, adminUserRoles.roleId)).orderBy(adminUsers.displayName).then((rows) => { const grouped = new Map<string, Record<string, unknown>>(); for (const row of rows) { const current = grouped.get(row.user.id) ?? { ...row.user, roles: [] as string[] }; if (row.roleCode) (current.roles as string[]).push(row.roleCode); grouped.set(row.user.id, current); } return [...grouped.values()]; }); }
}

async function countRows(db: AppDatabase, table: typeof customers) { return db.select({ count: sql<number>`count(*)` }).from(table).then(firstCount); }
function firstCount(rows: Array<{ count: number }>) { return Number(rows[0]?.count ?? 0); }
