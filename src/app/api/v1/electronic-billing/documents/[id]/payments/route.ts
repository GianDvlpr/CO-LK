import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { requirePermission } from "@/modules/auth/application/session-service";
import { knownElectronicBillingError } from "@/modules/electronic-billing/application/electronic-billing-http";
import { addElectronicDocumentPayment, getElectronicDocumentPayments } from "@/modules/electronic-billing/application/electronic-document-service";

const schema = z.object({
  metodo: z.enum(["efectivo", "yape", "plin", "transferencia", "tarjeta", "cheque", "otro"]),
  monto: z.coerce.number().positive(),
  referencia: z.string().trim().max(100).optional(),
  monto_recibido: z.coerce.number().nonnegative().optional(),
  notas: z.string().trim().max(255).optional(),
});

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("sales.read");
    const { id } = await context.params;
    return apiSuccess(await getElectronicDocumentPayments(prisma, user.companyId, id));
  } catch (error) {
    const response = knownElectronicBillingError(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { requireSameOrigin(request); } catch (error) { const response = knownElectronicBillingError(error); if (response) return response; throw error; }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "El pago contiene datos inválidos.", 400, Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), issue.message])));
  try {
    const user = await requirePermission("sales.payment");
    const { id } = await context.params;
    return apiSuccess(await addElectronicDocumentPayment(prisma, { companyId: user.companyId, userId: user.id, documentId: id, payment: parsed.data }), 201);
  } catch (error) {
    const response = knownElectronicBillingError(error);
    if (response) return response;
    throw error;
  }
}
