import { DomainValidationError } from "../../shared/domain/errors.ts";

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export class Money {
  readonly amountMinor: number;
  readonly currency: string;

  constructor(amountMinor: number, currency: string) {
    const normalisedCurrency = currency.trim().toUpperCase();
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
      throw new DomainValidationError(
        "INVALID_MONEY_AMOUNT",
        "Money must be a non-negative safe integer in minor units.",
      );
    }
    if (!CURRENCY_PATTERN.test(normalisedCurrency)) {
      throw new DomainValidationError("INVALID_CURRENCY", "Currency must be a three-letter code.");
    }
    this.amountMinor = amountMinor;
    this.currency = normalisedCurrency;
  }

  add(other: Money): Money {
    this.requireSameCurrency(other);
    const result = this.amountMinor + other.amountMinor;
    if (!Number.isSafeInteger(result)) {
      throw new DomainValidationError("MONEY_OVERFLOW", "Money calculation exceeds safe limits.");
    }
    return new Money(result, this.currency);
  }

  taxAtBasisPoints(basisPoints: number): Money {
    if (!Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
      throw new DomainValidationError("INVALID_TAX_RATE", "Tax rate must be valid basis points.");
    }
    const numerator = this.amountMinor * basisPoints;
    if (!Number.isSafeInteger(numerator)) {
      throw new DomainValidationError("MONEY_OVERFLOW", "Money calculation exceeds safe limits.");
    }
    return new Money(Math.round(numerator / 10_000), this.currency);
  }

  includedTaxAtBasisPoints(basisPoints: number): Money {
    if (!Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
      throw new DomainValidationError("INVALID_TAX_RATE", "Tax rate must be valid basis points.");
    }
    const divisor = 10_000 + basisPoints;
    const numerator = this.amountMinor * basisPoints;
    if (!Number.isSafeInteger(numerator)) {
      throw new DomainValidationError("MONEY_OVERFLOW", "Money calculation exceeds safe limits.");
    }
    return new Money(Math.round(numerator / divisor), this.currency);
  }

  subtract(other: Money): Money {
    this.requireSameCurrency(other);
    if (other.amountMinor > this.amountMinor) {
      throw new DomainValidationError("NEGATIVE_MONEY", "Money cannot become negative.");
    }
    return new Money(this.amountMinor - other.amountMinor, this.currency);
  }

  private requireSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new DomainValidationError("CURRENCY_MISMATCH", "Money currencies must match.");
    }
  }
}
