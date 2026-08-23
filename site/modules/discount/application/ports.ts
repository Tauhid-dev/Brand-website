import type { DiscountResolutionPort } from "../../pricing/application/ports.ts";
import type {
  CustomerDiscount,
  Discount,
  DiscountRedemption,
  EligibleDiscount,
  PromotionCode,
} from "../domain/discount.ts";

export interface DiscountRepository {
  findDiscountByCode(code: string): Promise<Discount | null>;
  findDiscountById(id: string): Promise<Discount | null>;
  saveDiscount(discount: Discount): Promise<void>;
  findPromotionByCode(code: string): Promise<{ promotion: PromotionCode; discount: Discount } | null>;
  savePromotionCode(promotion: PromotionCode): Promise<void>;
  saveCustomerDiscount(customerDiscount: CustomerDiscount): Promise<void>;
  findEligibleCustomerDiscounts(customerId: string, planId: string, at: Date, subscriptionId?: string | null): Promise<EligibleDiscount[]>;
  claimPromotionCode(customerDiscount: CustomerDiscount, redemption: DiscountRedemption): Promise<void>;
  saveChargeRedemption(redemption: DiscountRedemption): Promise<void>;
}

export interface PurchaseHistoryPort {
  hasPriorPurchase(customerId: string): Promise<boolean>;
}

export interface PromotionCodeGeneratorPort {
  next(): string;
}

export type DiscountPricingPort = DiscountResolutionPort;
