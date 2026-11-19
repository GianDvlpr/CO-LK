import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { requirePermission } from "@/modules/auth/application/session-service";
import { DniLookupError, lookupDni } from "@/modules/catalogs/application/dni-lookup";
import type { DniLookupResult } from "@/modules/catalogs/application/dni-lookup";
import { lookupRemoteTaxpayer } from "@/modules/electronic-billing/application/electronic-document-service";

const schema = z.object({ dni: z.string().trim().regex(/^\d{8}$/) });

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requirePermission("catalogs.manage");
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiError("INVALID_DNI", "Ingresa un DNI peruano válido de 8 dígitos.", 400);
    let result: DniLookupResult;
    try {
      const remote = await lookupRemoteTaxpayer(prisma, user.companyId, "1", parsed.data.dni);
      const name = String(remote.razon_social ?? "");
      if (!name) throw new Error("Respuesta incompleta");
      result = {
        dni: String(remote.num_doc ?? parsed.data.dni),
        name,
        firstNames: typeof remote.nombres === "string" ? remote.nombres : null,
        paternalSurname: typeof remote.apellido_paterno === "string" ? remote.apellido_paterno : null,
        maternalSurname: typeof remote.apellido_materno === "string" ? remote.apellido_materno : null,
        source: "SUNAT_API",
        consultedAt: new Date().toISOString(),
      };
    } catch {
      result = await lookupDni(parsed.data.dni);
    }
    await prisma.auditLog.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        entity: "TaxpayerLookup",
        entityId: result.dni,
        action: "LOOKUP",
        afterData: { documentType: "DNI", source: result.source, consultedAt: result.consultedAt },
      },
    });
    return apiSuccess(result);
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    if (error instanceof DniLookupError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
