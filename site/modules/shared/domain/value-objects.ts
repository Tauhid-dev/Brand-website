import { DomainValidationError } from "./errors.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class EntityId {
  readonly value: string;

  constructor(value: string) {
    if (!UUID_PATTERN.test(value)) {
      throw new DomainValidationError("INVALID_ENTITY_ID", "Entity IDs must be UUIDs.");
    }
    this.value = value.toLowerCase();
  }

  equals(other: EntityId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

export class EmailAddress {
  readonly value: string;

  constructor(value: string) {
    const normalised = value.trim().toLowerCase();
    if (normalised.length > 254 || !EMAIL_PATTERN.test(normalised)) {
      throw new DomainValidationError("INVALID_EMAIL", "A valid email address is required.");
    }
    this.value = normalised;
  }

  toString(): string {
    return this.value;
  }
}

export class StableCode {
  readonly value: string;

  constructor(value: string) {
    const normalised = value.trim().toLowerCase();
    if (normalised.length > 80 || !CODE_PATTERN.test(normalised)) {
      throw new DomainValidationError(
        "INVALID_STABLE_CODE",
        "Stable codes must use lower-case words separated by underscores.",
      );
    }
    this.value = normalised;
  }

  toString(): string {
    return this.value;
  }
}

export function requireText(value: string, field: string, maxLength = 200): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    throw new DomainValidationError(
      "INVALID_TEXT",
      `${field} is required and must be at most ${maxLength} characters.`,
    );
  }
  return trimmed;
}

export function optionalText(
  value: string | null | undefined,
  field: string,
  maxLength = 500,
): string | null {
  if (value == null || value.trim() === "") return null;
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new DomainValidationError(
      "INVALID_TEXT",
      `${field} must be at most ${maxLength} characters.`,
    );
  }
  return trimmed;
}
