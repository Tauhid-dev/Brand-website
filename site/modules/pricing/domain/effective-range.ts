import { DomainValidationError } from "../../shared/domain/errors.ts";

export class EffectiveRange {
  private readonly fromMillis: number;
  private readonly toMillis: number | null;

  constructor(effectiveFrom: Date, effectiveTo: Date | null) {
    const fromMillis = effectiveFrom.getTime();
    const toMillis = effectiveTo?.getTime() ?? null;
    if (!Number.isFinite(fromMillis) || (toMillis != null && !Number.isFinite(toMillis))) {
      throw new DomainValidationError("INVALID_EFFECTIVE_DATE", "Effective dates must be valid.");
    }
    if (toMillis != null && toMillis <= fromMillis) {
      throw new DomainValidationError(
        "INVALID_EFFECTIVE_RANGE",
        "effectiveTo must be later than effectiveFrom.",
      );
    }
    this.fromMillis = fromMillis;
    this.toMillis = toMillis;
  }

  get effectiveFrom(): Date {
    return new Date(this.fromMillis);
  }

  get effectiveTo(): Date | null {
    return this.toMillis == null ? null : new Date(this.toMillis);
  }

  contains(value: Date): boolean {
    const millis = value.getTime();
    return Number.isFinite(millis) && millis >= this.fromMillis &&
      (this.toMillis == null || millis < this.toMillis);
  }

  overlaps(other: EffectiveRange): boolean {
    const thisEnd = this.toMillis ?? Number.POSITIVE_INFINITY;
    const otherEnd = other.toMillis ?? Number.POSITIVE_INFINITY;
    return this.fromMillis < otherEnd && other.fromMillis < thisEnd;
  }
}
