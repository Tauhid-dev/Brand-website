import { eq } from "drizzle-orm";
import type { AppDatabase } from "../../../db/index.ts";
import { agentLinks, customerBusinessProfiles, customers, onboardingCases, plans } from "../../../db/schema.ts";
import type { AgentIntegrationRepository } from "../application/ports.ts";

export class D1AgentIntegrationRepository implements AgentIntegrationRepository {
  constructor(private readonly db: AppDatabase) {}
  async findCustomerProfile(customerId: string) { const [row] = await this.db.select({ id: customers.id, businessName: customerBusinessProfiles.businessName, contactName: customers.contactName, email: customers.email, phone: customers.phone, websiteUrl: customerBusinessProfiles.websiteUrl, industry: customerBusinessProfiles.industry, timezone: customerBusinessProfiles.timezone, state: customerBusinessProfiles.state }).from(customers).innerJoin(customerBusinessProfiles, eq(customerBusinessProfiles.customerId, customers.id)).where(eq(customers.id, customerId)).limit(1); return row ?? null; }
  async findOnboardingState(customerId: string) { const [row] = await this.db.select({ status: onboardingCases.status, updatedAt: onboardingCases.updatedAt }).from(onboardingCases).where(eq(onboardingCases.customerId, customerId)).limit(1); return row ?? null; }
  async findAgentLink(customerId: string) { const [row] = await this.db.select({ platform: agentLinks.agentPlatform, externalAgentId: agentLinks.externalAgentId, status: agentLinks.status, lastSyncedAt: agentLinks.lastSyncedAt }).from(agentLinks).where(eq(agentLinks.customerId, customerId)).limit(1); return row ?? null; }
  async findPlanCode(planId: string) { const [row] = await this.db.select({ code: plans.code }).from(plans).where(eq(plans.id, planId)).limit(1); return row?.code ?? null; }
}
