import { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiError } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { QuotationError } from "@/modules/quotations/application/quotation-service";

const decimal = z.union([z.string().trim().min(1), z.number()]);

export const quotationInputSchema = z.object({
  customerId: z.uuid(),
  currencyId: z.uuid(),
  issueDate: z.coerce.date(),
  validUntil: z.coerce.date(),
  promisedAt: z.coerce.date().optional(),
  exchangeRate: decimal,
  discountRate: decimal.default(0),
  paymentTerms: z.string().trim().max(500).optional(),
  deliveryTerms: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(1000).optional(),
  lines: z.array(z.object({ productVariantId: z.uuid(), quantity: decimal, unitPrice: decimal })).min(1).max(100),
});

export function knownQuotationError(error: unknown) {
  if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
  if (error instanceof QuotationError) return apiError(error.code, error.message, error.code === "QUOTATION_NOT_FOUND" ? 404 : 422);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError("QUOTATION_DUPLICATE", "El número de cotización ya existe.", 409);
  return null;
}
