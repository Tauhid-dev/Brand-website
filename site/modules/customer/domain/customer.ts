import { DomainValidationError } from "../../shared/domain/errors.ts";
import {
  EmailAddress,
  EntityId,
  optionalText,
  requireText,
} from "../../shared/domain/value-objects.ts";

export const CUSTOMER_STATUSES = [
  "PROSPECT",
  "ACTIVE",
  "SUSPENDED",
  "CANCELLED",
  "ARCHIVED",
] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const CUSTOMER_CREATION_SOURCES = [
  "SELF_REGISTRATION",
  "ADMIN",
  "INVITATION",
  "MIGRATION",
] as const;
export type CustomerCreationSource = (typeof CUSTOMER_CREATION_SOURCES)[number];

export type CustomerProps = {
  id: EntityId;
  externalReference: string;
  businessName: string;
  contactName: string;
  email: EmailAddress;
  phone: string | null;
  industry: string | null;
  websiteUrl: string | null;
  status: CustomerStatus;
  creationSource: CustomerCreationSource;
  createdAt: Date;
  updatedAt: Date;
};

const ALLOWED_TRANSITIONS: Record<CustomerStatus, readonly CustomerStatus[]> = {
  PROSPECT: ["ACTIVE", "CANCELLED", "ARCHIVED"],
  ACTIVE: ["SUSPENDED", "CANCELLED", "ARCHIVED"],
  SUSPENDED: ["ACTIVE", "CANCELLED", "ARCHIVED"],
  CANCELLED: ["ARCHIVED"],
  ARCHIVED: [],
};

export class Customer {
  private props: CustomerProps;

  private constructor(props: CustomerProps) {
    this.props = props;
  }

  static create(input: CustomerProps): Customer {
    if (!CUSTOMER_STATUSES.includes(input.status)) {
      throw new DomainValidationError("INVALID_CUSTOMER_STATUS", "Customer status is invalid.");
    }
    if (!CUSTOMER_CREATION_SOURCES.includes(input.creationSource)) {
      throw new DomainValidationError("INVALID_CREATION_SOURCE", "Creation source is invalid.");
    }
    if (input.updatedAt < input.createdAt) {
      throw new DomainValidationError("INVALID_TIMESTAMPS", "updatedAt cannot precede createdAt.");
    }
    return new Customer({
      ...input,
      externalReference: requireText(input.externalReference, "externalReference", 80),
      businessName: requireText(input.businessName, "businessName", 200),
      contactName: requireText(input.contactName, "contactName", 160),
      phone: optionalText(input.phone, "phone", 40),
      industry: optionalText(input.industry, "industry", 120),
      websiteUrl: optionalText(input.websiteUrl, "websiteUrl", 500),
    });
  }

  transitionTo(status: CustomerStatus, at: Date): void {
    if (!ALLOWED_TRANSITIONS[this.props.status].includes(status)) {
      throw new DomainValidationError(
        "INVALID_CUSTOMER_TRANSITION",
        `Cannot transition customer from ${this.props.status} to ${status}.`,
      );
    }
    this.props = { ...this.props, status, updatedAt: at };
  }

  get snapshot(): Readonly<CustomerProps> {
    return { ...this.props };
  }
}

export type CustomerBusinessProfileProps = {
  id: EntityId;
  customerId: EntityId;
  businessName: string;
  tradingName: string | null;
  abn: string | null;
  websiteUrl: string | null;
  primaryEmail: EmailAddress;
  primaryPhone: string | null;
  industry: string | null;
  timezone: string;
  country: "AU";
  state: string | null;
  suburb: string | null;
  postcode: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export class CustomerBusinessProfile {
  readonly props: Readonly<CustomerBusinessProfileProps>;

  constructor(input: CustomerBusinessProfileProps) {
    if (input.updatedAt < input.createdAt) {
      throw new DomainValidationError("INVALID_TIMESTAMPS", "updatedAt cannot precede createdAt.");
    }
    this.props = {
      ...input,
      businessName: requireText(input.businessName, "businessName", 200),
      tradingName: optionalText(input.tradingName, "tradingName", 200),
      abn: optionalText(input.abn, "abn", 20),
      websiteUrl: optionalText(input.websiteUrl, "websiteUrl", 500),
      primaryPhone: optionalText(input.primaryPhone, "primaryPhone", 40),
      industry: optionalText(input.industry, "industry", 120),
      timezone: requireText(input.timezone, "timezone", 80),
      state: optionalText(input.state, "state", 40),
      suburb: optionalText(input.suburb, "suburb", 120),
      postcode: optionalText(input.postcode, "postcode", 12),
    };
  }
}

export type CustomerNote = {
  id: EntityId;
  customerId: EntityId;
  body: string;
  authorType: "ADMIN" | "SYSTEM";
  authorId: string;
  createdAt: Date;
};

export function createCustomerNote(input: CustomerNote): CustomerNote {
  if (input.authorType !== "ADMIN" && input.authorType !== "SYSTEM") {
    throw new DomainValidationError("INVALID_NOTE_AUTHOR_TYPE", "Note author type is invalid.");
  }
  return {
    ...input,
    body: requireText(input.body, "note body", 5_000),
    authorId: requireText(input.authorId, "authorId", 200),
  };
}
