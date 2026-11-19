import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { requirePermission } from "@/modules/auth/application/session-service";
import { knownElectronicBillingError } from "@/modules/electronic-billing/application/electronic-billing-http";
import { getFiscalReference } from "@/modules/electronic-billing/application/electronic-document-service";

export async function GET(request: Request) {
  try {
    const user = await requirePermission("sales.read");
    const params = new URL(request.url).searchParams;
    const type = params.get("type");
    let path: string;
    if (type === "products") {
      const query = (params.get("q") ?? "").trim();
      if (query.length < 2 || query.length > 100) return apiError("VALIDATION_ERROR", "La búsqueda debe tener entre 2 y 100 caracteres.", 400);
      path = `catalogos/producto-sunat?q=${encodeURIComponent(query)}&per_page=50`;
    } else if (type === "regions") path = "catalogos/ubigeo/regiones";
    else if (type === "provinces") {
      const region = params.get("region") ?? "";
      if (!/^\d{2}$/.test(region)) return apiError("VALIDATION_ERROR", "Selecciona una región válida.", 400);
      path = `catalogos/ubigeo/provincias?region_id=${region}`;
    } else if (type === "districts") {
      const province = params.get("province") ?? "";
      if (!/^\d{4}$/.test(province)) return apiError("VALIDATION_ERROR", "Selecciona una provincia válida.", 400);
      path = `catalogos/ubigeo/distritos?provincia_id=${province}`;
    } else return apiError("VALIDATION_ERROR", "El catálogo solicitado no está permitido.", 400);
    return apiSuccess(await getFiscalReference(prisma, user.companyId, path));
  } catch (error) {
    const response = knownElectronicBillingError(error);
    if (response) return response;
    throw error;
  }
}
