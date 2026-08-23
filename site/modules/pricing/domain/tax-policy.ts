import type { TaxBehaviour } from "./pricing.ts";
import { Money } from "./money.ts";

export const AUSTRALIAN_GST_BASIS_POINTS = 1_000;
export const PUBLIC_PRICE_TAX_DISCLOSURE = "All prices are in Australian dollars and exclude GST.";

export type TaxBreakdown = {
  subtotal: Money;
  tax: Money;
  total: Money;
};

export class AustralianGstPolicy {
  calculate(charge: Money, behaviour: TaxBehaviour): TaxBreakdown {
    if (behaviour === "EXEMPT") {
      return { subtotal: charge, tax: new Money(0, charge.currency), total: charge };
    }
    if (behaviour === "INCLUSIVE") {
      const tax = charge.includedTaxAtBasisPoints(AUSTRALIAN_GST_BASIS_POINTS);
      return { subtotal: charge.subtract(tax), tax, total: charge };
    }
    const tax = charge.taxAtBasisPoints(AUSTRALIAN_GST_BASIS_POINTS);
    return { subtotal: charge, tax, total: charge.add(tax) };
  }
}
