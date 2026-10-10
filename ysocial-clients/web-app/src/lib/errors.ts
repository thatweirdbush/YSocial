/** Rejection for an owner-only mutation attempted by someone else (backend 403). */
export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Rejection for blocking oneself. */
export class CannotBlockYourselfError extends Error {
  constructor(message = "Cannot block yourself") {
    super(message);
    this.name = "CannotBlockYourselfError";
  }
}
