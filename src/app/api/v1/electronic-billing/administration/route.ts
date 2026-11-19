import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { requirePermission } from "@/modules/auth/application/session-service";
import { knownElectronicBillingError } from "@/modules/electronic-billing/application/electronic-billing-http";
import { getFiscalAdministration, mutateFiscalAdministration } from "@/modules/electronic-billing/application/electronic-document-service";

const seriesCreate = z.object({ entity: z.literal("series"), action: z.literal("create"), payload: z.object({ tipo: z.string().trim().min(1).max(40), serie: z.string().trim().regex(/^[A-Z][A-Z0-9]{3}$/), sucursal_id: z.coerce.number().int().positive(), correlativo_inicial: z.coerce.number().int().nonnegative().optional() }) });
const seriesUpdate = z.object({ entity: z.literal("series"), action: z.literal("update"), id: z.coerce.number().int().positive(), payload: z.object({ activo: z.boolean().optional(), correlativo: z.coerce.number().int().nonnegative().optional(), sucursal_id: z.coerce.number().int().positive().optional() }) });
const seriesDelete = z.object({ entity: z.literal("series"), action: z.literal("delete"), id: z.coerce.number().int().positive() });
const branchFields = z.object({ nombre: z.string().trim().min(1).max(100), cod_local: z.string().regex(/^\d{4}$/), direccion: z.string().trim().min(1).max(500), ubigeo: z.string().regex(/^\d{4,6}$/), telefono: z.string().trim().max(20).optional(), email: z.string().email().max(255).optional(), es_principal: z.boolean().optional() });
const branchCreate = z.object({ entity: z.literal("branches"), action: z.literal("create"), payload: branchFields });
const branchUpdate = z.object({ entity: z.literal("branches"), action: z.literal("update"), id: z.coerce.number().int().positive(), payload: branchFields.partial().extend({ activo: z.boolean().optional() }) });
const branchDelete = z.object({ entity: z.literal("branches"), action: z.literal("delete"), id: z.coerce.number().int().positive() });
const schema = z.union([seriesCreate, seriesUpdate, seriesDelete, branchCreate, branchUpdate, branchDelete]);

async function superadmin() {
  const user = await requirePermission("sales.issue");
  if (!user.roles.includes("SUPERADMIN")) return null;
  return user;
}

export async function GET() {
  try {
    const user = await superadmin();
    if (!user) return apiError("FORBIDDEN", "Solo un superadministrador puede administrar series y sucursales.", 403);
    return apiSuccess(await getFiscalAdministration(prisma, user.companyId));
  } catch (error) {
    const response = knownElectronicBillingError(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(request: Request) {
  try { requireSameOrigin(request); } catch (error) { const response = knownElectronicBillingError(error); if (response) return response; throw error; }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "La configuración fiscal contiene datos inválidos.", 400, Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), issue.message])));
  try {
    const user = await superadmin();
    if (!user) return apiError("FORBIDDEN", "Solo un superadministrador puede administrar series y sucursales.", 403);
    return apiSuccess(await mutateFiscalAdministration(prisma, { companyId: user.companyId, userId: user.id, entity: parsed.data.entity, action: parsed.data.action, id: "id" in parsed.data ? parsed.data.id : undefined, payload: "payload" in parsed.data ? parsed.data.payload : undefined }));
  } catch (error) {
    const response = knownElectronicBillingError(error);
    if (response) return response;
    throw error;
  }
}
