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

export class AuthenticationRequiredError extends Error {
  readonly code = "AUTHENTICATION_REQUIRED";

  constructor(message = "Authentication is required.") {
    super(message);
    this.name = "AuthenticationRequiredError";
  }
}

export class AuthorizationDeniedError extends Error {
  readonly code: string;

  constructor(code = "AUTHORIZATION_DENIED", message = "You are not authorized to perform this action.") {
    super(message);
    this.name = "AuthorizationDeniedError";
    this.code = code;
  }
}

export class RateLimitExceededError extends Error {
  readonly code = "RATE_LIMIT_EXCEEDED";

  constructor(message = "Too many requests.") {
    super(message);
    this.name = "RateLimitExceededError";
  }
}
