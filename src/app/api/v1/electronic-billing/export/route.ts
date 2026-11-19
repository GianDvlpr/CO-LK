import { prisma } from "@/lib/database/prisma";
import { apiError } from "@/lib/http/api-response";
import { requirePermission } from "@/modules/auth/application/session-service";
import { knownElectronicBillingError } from "@/modules/electronic-billing/application/electronic-billing-http";
import { downloadFiscalExport } from "@/modules/electronic-billing/application/electronic-document-service";

export async function GET(request: Request) {
  try {
    const user = await requirePermission("sales.read");
    const source = new URL(request.url).searchParams;
    const from = source.get("from") ?? "";
    const to = source.get("to") ?? "";
    const format = source.get("format") ?? "xml";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return apiError("VALIDATION_ERROR", "Selecciona un rango de fechas válido.", 400);
    if (!["xml", "pdf", "ambos"].includes(format)) return apiError("VALIDATION_ERROR", "El formato de exportación no es válido.", 400);
    const query = `?fecha_desde=${from}&fecha_hasta=${to}&tipo=${format}`;
    const file = await downloadFiscalExport(prisma, user.companyId, query);
    return new Response(file.bytes, { headers: { "Content-Type": file.contentType, "Content-Disposition": `attachment; filename="${(file.fileName ?? `comprobantes-${from}-${to}.zip`).replace(/[^A-Za-z0-9._-]/g, "_")}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    const response = knownElectronicBillingError(error);
    if (response) return response;
    throw error;
  }
}
