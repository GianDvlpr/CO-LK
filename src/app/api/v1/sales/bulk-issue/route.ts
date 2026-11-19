import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { requirePermission } from "@/modules/auth/application/session-service";
import { knownElectronicBillingError } from "@/modules/electronic-billing/application/electronic-billing-http";
import { issueElectronicSalesBulk } from "@/modules/electronic-billing/application/electronic-document-service";

const schema = z.object({ saleIds: z.array(z.string().uuid()).min(1).max(100) });

export async function POST(request: Request) {
  try { requireSameOrigin(request); } catch (error) { const response = knownElectronicBillingError(error); if (response) return response; throw error; }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Selecciona entre 1 y 100 facturas válidas.", 400);
  try {
    const user = await requirePermission("sales.issue");
    return apiSuccess(await issueElectronicSalesBulk(prisma, { companyId: user.companyId, userId: user.id, saleIds: parsed.data.saleIds }));
  } catch (error) {
    const response = knownElectronicBillingError(error);
    if (response) return response;
    throw error;
  }
}
