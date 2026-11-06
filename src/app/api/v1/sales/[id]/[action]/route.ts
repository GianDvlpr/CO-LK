import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { requirePermission } from "@/modules/auth/application/session-service";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { knownSaleError } from "@/modules/sales/application/sale-http";
import { issueSale, voidSale } from "@/modules/sales/application/sale-service";

const permissions = { issue: "sales.issue", void: "sales.void" } as const;

export async function POST(request: Request, context: { params: Promise<{ id: string; action: string }> }) {
  try { requireSameOrigin(request); } catch (error) { const response = knownSaleError(error); if (response) return response; throw error; }
  const { id, action } = await context.params;
  if (!(action in permissions)) return apiError("SALE_ACTION_NOT_FOUND", "La acción solicitada no existe.", 404);
  const typed = action as keyof typeof permissions;
  try {
    const user = await requirePermission(permissions[typed]);
    return apiSuccess(typed === "issue" ? await issueSale(prisma, { companyId: user.companyId, userId: user.id, saleId: id }) : await voidSale(prisma, { companyId: user.companyId, userId: user.id, saleId: id }));
  } catch (error) {
    const response = knownSaleError(error);
    if (response) return response;
    throw error;
  }
}
