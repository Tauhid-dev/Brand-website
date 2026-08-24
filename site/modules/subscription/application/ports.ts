import type { PricingBreakdown } from "../../pricing/domain/pricing.ts";
import type {
  EntitlementDefinition,
  Subscription,
  SubscriptionEntitlement,
  SubscriptionPrice,
} from "../domain/subscription.ts";

export interface SubscriptionRepository {
  findById(id: string): Promise<Subscription | null>;
  findByProviderReference(provider: string, externalSubscriptionId: string): Promise<Subscription | null>;
  findCurrentForCustomer(customerId: string): Promise<Subscription | null>;
  findLatestForCustomer(customerId: string): Promise<Subscription | null>;
  create(subscription: Subscription, price: SubscriptionPrice, entitlements: readonly SubscriptionEntitlement[]): Promise<void>;
  saveTransition(subscription: Subscription, closeEntitlementsAt: Date | null, restoredEntitlements: readonly SubscriptionEntitlement[]): Promise<void>;
  findEffectiveEntitlements(subscriptionId: string, at: Date): Promise<SubscriptionEntitlement[]>;
  findLatestEntitlementDefinitions(subscriptionId: string): Promise<EntitlementDefinition[]>;
  findPriceAt(subscriptionId: string, at: Date): Promise<SubscriptionPrice | null>;
  findPriceOverlaps(subscriptionId: string, from: Date, to: Date | null): Promise<SubscriptionPrice[]>;
  publishPrice(price: SubscriptionPrice, closePriceId: string | null): Promise<void>;
}

export interface SubscriptionPricingResolver {
  resolvePrice(input: {
    customerId: string; planId: string; subscriptionId?: string | null;
    billingInterval: "MONTHLY" | "ANNUAL"; effectiveAt: Date;
  }): Promise<PricingBreakdown>;
}
