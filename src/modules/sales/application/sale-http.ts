import { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiError } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { SaleError } from "@/modules/sales/application/sale-service";

const decimal = z.union([z.string().trim().min(1), z.number()]);

export const saleInputSchema = z.object({
  salesOrderIds: z.array(z.uuid()).min(1).max(50),
  currencyId: z.uuid(),
  documentType: z.enum(["INVOICE", "RECEIPT", "SALE_NOTE", "OTHER"]),
  documentSeries: z.string().trim().max(20).optional(),
  documentNumber: z.string().trim().max(30).optional(),
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date().optional(),
  exchangeRate: decimal,
  discountRate: decimal.default(0),
  paymentMethod: z.enum(["CASH", "TRANSFER", "CARD", "CREDIT", "OTHER"]),
  notes: z.string().trim().max(1000).optional(),
  lines: z.array(z.object({ productVariantId: z.uuid(), unitPrice: decimal })).min(1).max(100),
});

export const paymentInputSchema = z.object({
  amount: decimal,
  paymentDate: z.coerce.date(),
  method: z.enum(["CASH", "TRANSFER", "CARD", "CREDIT", "OTHER"]),
  reference: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
});

export function knownSaleError(error: unknown) {
  if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
  if (error instanceof SaleError) return apiError(error.code, error.message, error.code === "SALE_NOT_FOUND" ? 404 : 422);
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError("SALE_DUPLICATE", "El código de venta, el documento o alguno de los pedidos ya está registrado.", 409);
  return null;
}
