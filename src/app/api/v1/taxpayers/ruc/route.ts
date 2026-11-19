import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { requirePermission } from "@/modules/auth/application/session-service";
import { lookupRuc, RucLookupError } from "@/modules/catalogs/application/ruc-lookup";
import type { RucLookupResult } from "@/modules/catalogs/application/ruc-lookup";
import { lookupRemoteTaxpayer } from "@/modules/electronic-billing/application/electronic-document-service";

const schema = z.object({ ruc: z.string().trim().length(11) });

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requirePermission("catalogs.manage");
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("INVALID_RUC", "Ingresa un RUC peruano válido de 11 dígitos.", 400);
    let result: RucLookupResult;
    try {
      const remote = await lookupRemoteTaxpayer(prisma, user.companyId, "6", parsed.data.ruc);
      result = {
        ruc: String(remote.num_doc ?? parsed.data.ruc),
        name: String(remote.razon_social ?? ""),
        status: typeof remote.estado === "string" ? remote.estado : null,
        condition: typeof remote.condicion === "string" ? remote.condicion : null,
        fiscalAddress: typeof remote.direccion === "string" ? remote.direccion : null,
        ubigeo: typeof remote.ubigeo === "string" ? remote.ubigeo : null,
        department: typeof remote.departamento === "string" ? remote.departamento : null,
        province: typeof remote.provincia === "string" ? remote.provincia : null,
        district: typeof remote.distrito === "string" ? remote.distrito : null,
        source: "SUNAT_API",
        consultedAt: new Date().toISOString(),
      };
      if (!result.name) throw new Error("Respuesta incompleta");
    } catch {
      result = await lookupRuc(parsed.data.ruc);
    }
    await prisma.auditLog.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        entity: "TaxpayerLookup",
        entityId: result.ruc,
        action: "LOOKUP",
        afterData: { source: result.source, status: result.status, condition: result.condition, consultedAt: result.consultedAt },
      },
    });
    return apiSuccess(result);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    if (error instanceof RucLookupError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
