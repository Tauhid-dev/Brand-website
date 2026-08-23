import { DomainValidationError } from "../../shared/domain/errors.ts";
import { EntityId, StableCode, optionalText, requireText } from "../../shared/domain/value-objects.ts";

export type OfferingProps = {
  id: EntityId;
  code: StableCode;
  name: string;
  description: string | null;
  category: string;
  active: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export class Offering {
  readonly props: Readonly<OfferingProps>;

  constructor(input: OfferingProps) {
    validateCatalogueTimestamps(input.createdAt, input.updatedAt);
    this.props = {
      ...input,
      name: requireText(input.name, "offering name", 160),
      description: optionalText(input.description, "offering description", 2_000),
      category: requireText(input.category, "offering category", 80),
      displayOrder: requireNonNegativeInteger(input.displayOrder, "displayOrder"),
    };
  }
}

export type PlanProps = {
  id: EntityId;
  code: StableCode;
  name: string;
  description: string | null;
  active: boolean;
  featured: boolean;
  custom: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export class Plan {
  readonly props: Readonly<PlanProps>;

  constructor(input: PlanProps) {
    validateCatalogueTimestamps(input.createdAt, input.updatedAt);
    this.props = {
      ...input,
      name: requireText(input.name, "plan name", 160),
      description: optionalText(input.description, "plan description", 2_000),
      displayOrder: requireNonNegativeInteger(input.displayOrder, "displayOrder"),
    };
  }
}

export type PlanFeature = {
  id: EntityId;
  planId: EntityId;
  offeringId: EntityId;
  included: boolean;
  limitValue: number | null;
  limitUnit: string | null;
  configuration: Readonly<Record<string, unknown>> | null;
  createdAt: Date;
  updatedAt: Date;
};

export function createPlanFeature(input: PlanFeature): PlanFeature {
  if (input.limitValue != null) {
    requireNonNegativeInteger(input.limitValue, "limitValue");
    requireText(input.limitUnit ?? "", "limitUnit", 80);
  } else if (input.limitUnit != null) {
    throw new DomainValidationError("LIMIT_UNIT_WITHOUT_VALUE", "limitUnit requires limitValue.");
  }
  if (!input.included && input.limitValue != null) {
    throw new DomainValidationError(
      "EXCLUDED_FEATURE_HAS_LIMIT",
      "An excluded feature cannot define a limit.",
    );
  }
  validateCatalogueTimestamps(input.createdAt, input.updatedAt);
  return { ...input };
}

function validateCatalogueTimestamps(createdAt: Date, updatedAt: Date): void {
  if (updatedAt < createdAt) {
    throw new DomainValidationError("INVALID_TIMESTAMPS", "updatedAt cannot precede createdAt.");
  }
}

function requireNonNegativeInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new DomainValidationError(
      "INVALID_NON_NEGATIVE_INTEGER",
      `${field} must be a non-negative integer.`,
    );
  }
  return value;
}
