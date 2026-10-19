import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { requirePermission } from "@/modules/auth/application/session-service";
import { getRequestIp, getRequestUserAgent } from "@/modules/auth/application/request-metadata";
import { applyImport, ImportApplicationError } from "@/modules/imports/application/confirm-import";
import { isImportModule, validateWorkbook } from "@/modules/imports/application/workbook";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export async function POST(request: Request, context: { params: Promise<{ module: string }> }) {
  try { requireSameOrigin(request); } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
  let user;
  try { user = await requirePermission("imports.confirm"); } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
  const { module } = await context.params;
  if (!isImportModule(module)) return apiError("NOT_FOUND", "El módulo no existe.", 404);
  const body = await request.formData();
  const file = body.get("file"); const jobId = body.get("jobId");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx") || typeof jobId !== "string") return apiError("VALIDATION_ERROR", "Archivo o validación inválida.", 400);
  if (file.size > MAX_FILE_SIZE) return apiError("FILE_TOO_LARGE", "El archivo no puede superar 5 MB.", 413);
  const bytes = await file.arrayBuffer();
  const parsed = await validateWorkbook(module, bytes).catch(() => null);
  if (!parsed) return apiError("INVALID_WORKBOOK", "El archivo no es un libro Excel válido o está dañado.", 422);
  if (parsed.errors.length) return apiError("IMPORT_HAS_ERRORS", "El archivo contiene errores y no puede confirmarse.", 422);
  const digest = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
  const job = await prisma.importJob.findFirst({ where: { id: jobId, companyId: user.companyId, module }, include: { errors: true } });
  if (!job) return apiError("NOT_FOUND", "La validación no existe.", 404);
  if (job.status !== "PENDING" || job.errors.length) return apiError("IMPORT_INVALID_STATE", "La validación ya fue procesada o contiene errores.", 409);
  const previewAudit = await prisma.auditLog.findFirst({ where: { companyId: user.companyId, entity: "ImportJob", entityId: job.id, action: "PREVIEW" }, orderBy: { createdAt: "desc" } });
  const previewData = previewAudit?.afterData as Record<string, unknown> | null;
  if (!previewData || previewData.sha256 !== digest) return apiError("IMPORT_FILE_CHANGED", "El archivo cambió después de la validación. Vuelve a validarlo.", 409);

  try {
    let importResult = { createdRecords: 0, skippedRecords: 0 };
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.importJob.updateMany({ where: { id: job.id, companyId: user.companyId, status: "PENDING" }, data: { status: "PROCESSING" } });
      if (claimed.count !== 1) throw new ImportApplicationError("IMPORT_ALREADY_PROCESSED", "La importación ya fue procesada.");
      importResult = await applyImport(tx, module, parsed.data, user.companyId, user.id, job.id, parsed.importMode);
      await tx.importJob.update({ where: { id: job.id }, data: { status: "COMPLETED", successRows: importResult.createdRecords, errorRows: 0, finishedAt: new Date() } });
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, module, entity: "ImportJob", entityId: job.id, action: "CONFIRM", ipAddress: getRequestIp(request), userAgent: getRequestUserAgent(request), requestPath: new URL(request.url).pathname, afterData: { module, totalRows: parsed.totalRows, importMode: parsed.importMode, createdRecords: importResult.createdRecords, skippedRecords: importResult.skippedRecords, sha256: digest } } });
      await tx.outboxEvent.create({ data: { companyId: user.companyId, topic: `private-company-${user.companyId}`, eventName: "import.completed.v1", aggregateId: job.id, payload: { importJobId: job.id, module, totalRows: parsed.totalRows, createdRecords: importResult.createdRecords, skippedRecords: importResult.skippedRecords } } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 15_000, timeout: 120_000 });
    return apiSuccess({ jobId: job.id, status: "COMPLETED", successRows: importResult.createdRecords, skippedRows: importResult.skippedRecords, importMode: parsed.importMode });
  } catch (error) {
    const known = error instanceof ImportApplicationError ? error : error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" ? new ImportApplicationError("CONFLICT", "Un código, documento o SKU del archivo ya existe.") : null;
    if (!known) throw error;
    const marked = await prisma.importJob.updateMany({ where: { id: job.id, status: { in: ["PENDING", "PROCESSING"] } }, data: { status: "FAILED", successRows: 0, errorRows: 1, finishedAt: new Date() } });
    if (marked.count) await prisma.importError.create({ data: { importId: job.id, rowNumber: known.rowNumber, field: known.field, code: known.code, message: known.message } });
    return apiError(known.code, known.message, known.code === "IMPORT_ALREADY_PROCESSED" ? 409 : 422);
  }
}
