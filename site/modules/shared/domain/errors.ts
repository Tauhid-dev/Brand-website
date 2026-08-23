export class DomainValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DomainValidationError";
    this.code = code;
  }
}

export class DomainConflictError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DomainConflictError";
    this.code = code;
  }
}
