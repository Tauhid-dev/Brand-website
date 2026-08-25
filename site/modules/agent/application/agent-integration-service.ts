import { DomainConflictError } from "../../shared/domain/errors.ts";
import type { AgentIntegrationRepository, CustomerEntitlementReader } from "./ports.ts";

export class AgentIntegrationService {
  constructor(private readonly repository: AgentIntegrationRepository, private readonly entitlements: CustomerEntitlementReader) {}

  async getCustomer(customerId: string) {
    const customer = await this.repository.findCustomerProfile(customerId);
    if (!customer) throw new DomainConflictError("CUSTOMER_NOT_FOUND", "Customer does not exist.");
    return customer;
  }

  async validateSubscription(customerId: string) {
    await this.getCustomer(customerId);
    const entitlement = await this.entitlements.getEntitlements(customerId);
    return entitlement ?? { customerId, subscriptionId: null, subscriptionStatus: "NOT_STARTED", planId: null, validUntil: null, valid: false, entitlements: {} };
  }

  async buildBootstrapProfile(customerId: string) {
    const [customer, onboarding, entitlement, agentLink] = await Promise.all([
      this.getCustomer(customerId), this.repository.findOnboardingState(customerId),
      this.entitlements.getEntitlements(customerId), this.repository.findAgentLink(customerId),
    ]);
    const planCode = entitlement ? await this.repository.findPlanCode(entitlement.planId) : null;
    return Object.freeze({
      customer,
      onboarding: onboarding ?? { status: "NOT_STARTED", updatedAt: null },
      subscription: { status: entitlement?.subscriptionStatus ?? "NOT_STARTED", valid: entitlement?.valid ?? false, validUntil: entitlement?.validUntil ?? null, planCode },
      entitlements: entitlement?.entitlements ?? {},
      agentLink: agentLink ?? { platform: null, externalAgentId: null, status: "NOT_PROVISIONED" },
    });
  }
}
