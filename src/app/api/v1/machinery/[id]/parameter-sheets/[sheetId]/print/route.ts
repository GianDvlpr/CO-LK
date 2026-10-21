import { prisma } from "@/lib/database/prisma";
import { apiError } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { getRequestIp, getRequestUserAgent } from "@/modules/auth/application/request-metadata";
import { buildMachineParameterSheetPdf } from "@/modules/machinery/application/machine-parameter-sheet-pdf";

export async function GET(request: Request, context: { params: Promise<{ id: string; sheetId: string }> }) {
  try {
    const user = await requirePermission("machinery.read");
    const { id, sheetId } = await context.params;
    const sheet = await prisma.machineParameterSheet.findFirst({
      where: { id: sheetId, machineId: id, machine: { companyId: user.companyId } },
      include: { machine: { include: { company: true } }, createdBy: { select: { name: true, username: true } }, parameters: { orderBy: { sortOrder: "asc" } } },
    });
    if (!sheet) return apiError("MACHINE_SHEET_NOT_FOUND", "La ficha de parámetros no existe.", 404);
    const pdf = await buildMachineParameterSheetPdf(sheet);
    await prisma.auditLog.create({ data: { companyId: user.companyId, userId: user.id, module: "machinery", entity: "MachineParameterSheet", entityId: sheet.id, action: "EXPORT", ipAddress: getRequestIp(request), userAgent: getRequestUserAgent(request), requestPath: new URL(request.url).pathname, afterData: { machineCode: sheet.machine.code, revision: sheet.revision, format: "PDF" } } });
    const baseName = `ficha-parametros-${sheet.machine.code}-rev-${String(sheet.revision).padStart(2, "0")}`.replace(/[^a-zA-Z0-9-_]/g, "-");
    return new Response(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${baseName}.pdf"`, "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthError) return apiError(error.code, error.message, error.status);
    throw error;
  }
}
