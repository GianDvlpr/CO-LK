export class AuthError extends Error {
  constructor(
    public readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "INVALID_CREDENTIALS" | "INVALID_CURRENT_PASSWORD" | "PASSWORD_NOT_CHANGED" | "RATE_LIMITED" | "AUTH_NOT_CONFIGURED",
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AuthError";
  }
}
