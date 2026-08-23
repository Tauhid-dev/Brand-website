import type { EffectiveRange } from "../domain/effective-range.ts";
import type { Money } from "../domain/money.ts";
import type {
  BillingInterval,
  CustomerPriceOverride,
  PlanPrice,
  PriceQuote,
} from "../domain/pricing.ts";

export interface PricingRepository {
  findPlanPriceAt(planId: string, billingInterval: BillingInterval, at: Date): Promise<PlanPrice | null>;
  findPlanPriceOverlaps(
    planId: string,
    billingInterval: BillingInterval,
    range: EffectiveRange,
  ): Promise<PlanPrice[]>;
  publishPlanPrice(price: PlanPrice, closePriceId: string | null): Promise<void>;
  findCustomerOverrideAt(
    customerId: string,
    planId: string,
    billingInterval: BillingInterval,
    at: Date,
  ): Promise<CustomerPriceOverride | null>;
  findCustomerOverrideOverlaps(
    customerId: string,
    planId: string,
    billingInterval: BillingInterval,
    range: EffectiveRange,
  ): Promise<CustomerPriceOverride[]>;
  saveCustomerOverride(override: CustomerPriceOverride): Promise<void>;
  saveQuote(quote: PriceQuote): Promise<void>;
  findQuoteById(id: string): Promise<PriceQuote | null>;
}

export interface PricingReferenceRepository {
  planExists(planId: string): Promise<boolean>;
  customerExists(customerId: string): Promise<boolean>;
  findActivePlanByCode(code: string): Promise<{ id: string; code: string; name: string } | null>;
}

export type ResolvedDiscount = {
  customerDiscountId: string;
  discountCode: string;
  amountMinor: number;
};

export interface DiscountResolutionPort {
  resolve(input: {
    customerId: string;
    planId: string;
    subscriptionId?: string | null;
    effectiveAt: Date;
    charge: Money;
  }): Promise<{ total: Money; applications: ResolvedDiscount[] }>;
}
