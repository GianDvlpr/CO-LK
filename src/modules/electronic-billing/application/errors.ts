import type { BillingApiFailure } from "@/modules/electronic-billing/domain/types";

export class ElectronicBillingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
    public readonly details?: BillingApiFailure,
  ) {
    super(message);
    this.name = "ElectronicBillingError";
  }
}

export class BillingConfigurationError extends ElectronicBillingError {
  constructor(message: string) {
    super("BILLING_NOT_CONFIGURED", message, 503, false);
    this.name = "BillingConfigurationError";
  }
}

export class BillingAuthenticationError extends ElectronicBillingError {
  constructor(message: string, details?: BillingApiFailure) {
    super("BILLING_AUTHENTICATION_FAILED", message, 401, false, details);
    this.name = "BillingAuthenticationError";
  }
}

export class BillingValidationError extends ElectronicBillingError {
  constructor(message: string, details?: BillingApiFailure) {
    super(details?.codigo_error ?? "BILLING_VALIDATION_FAILED", message, 422, false, details);
    this.name = "BillingValidationError";
  }
}

export class BillingRateLimitError extends ElectronicBillingError {
  constructor(message: string, details?: BillingApiFailure) {
    super("BILLING_RATE_LIMITED", message, 429, true, details);
    this.name = "BillingRateLimitError";
  }
}

export function billingHttpError(status: number, body?: BillingApiFailure, retryable = false) {
  const message = body?.mensaje || "No se pudo completar la operación de facturación electrónica.";
  if (status === 401) return new BillingAuthenticationError(message, body);
  if (status === 403) return new ElectronicBillingError("BILLING_FORBIDDEN", message, status, false, body);
  if (status === 404) return new ElectronicBillingError("BILLING_NOT_FOUND", message, status, false, body);
  if (status === 409) return new ElectronicBillingError("BILLING_CONFLICT", message, status, true, body);
  if (status === 422) return new BillingValidationError(message, body);
  if (status === 429) return new BillingRateLimitError(message, body);
  return new ElectronicBillingError(
    status >= 500 ? "BILLING_SERVER_ERROR" : "BILLING_HTTP_ERROR",
    message,
    status,
    retryable,
    body,
  );
}
