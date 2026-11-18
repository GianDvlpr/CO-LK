import { Prisma } from "@prisma/client";
import { apiError } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { ElectronicBillingError } from "@/modules/electronic-billing/application/errors";

export function knownElectronicBillingError(error: unknown) {
  if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
  if (error instanceof ElectronicBillingError) return apiError(error.code, error.message, error.status);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return apiError("BILLING_DUPLICATE", "El documento ya fue registrado.", 409);
  }
  return null;
}
