import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requireSameOrigin } from "@/modules/auth/application/request-security";
import { requirePermission } from "@/modules/auth/application/session-service";
import { isImportModule, validateWorkbook, type ImportModule, type ParsedWorkbookRow } from "@/modules/imports/application/workbook";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
type Warning = { rowNumber: number; field?: string; code: string; message: string };
const value = (row: ParsedWorkbookRow, field: string) => row.values[field]?.trim() ?? "";

async function existingWarnings(module: ImportModule, data: Record<string, ParsedWorkbookRow[]>, companyId: string): Promise<Warning[]> {
  const warnings: Warning[] = [];
  if (module === "purchases") {
    const rows = data.Compras ?? []; const codes = rows.map((row) => value(row, "codigo_compra")).filter(Boolean);
    const existing = new Set((await prisma.purchase.findMany({ where: { companyId, code: { in: codes } }, select: { code: true } })).map((item) => item.code.toUpperCase()));
    rows.filter((row) => existing.has(value(row, "codigo_compra").toUpperCase())).forEach((row) => warnings.push({ rowNumber: row.rowNumber, field: "codigo_compra", code: "EXISTING_RECORD_SKIPPED", message: `La compra ${value(row, "codigo_compra")} ya existe y será omitida.` }));
  } else if (module === "orders") {
    const rows = data.Pedidos ?? []; const numbers = rows.map((row) => value(row, "numero_pedido")).filter(Boolean);
    const existing = new Set((await prisma.salesOrder.findMany({ where: { companyId, number: { in: numbers } }, select: { number: true } })).map((item) => item.number.toUpperCase()));
    rows.filter((row) => existing.has(value(row, "numero_pedido").toUpperCase())).forEach((row) => warnings.push({ rowNumber: row.rowNumber, field: "numero_pedido", code: "EXISTING_RECORD_SKIPPED", message: `El pedido ${value(row, "numero_pedido")} ya existe y será omitido.` }));
  } else if (module === "products") {
    const productRows = data.Productos ?? []; const variantRows = data.Variantes ?? [];
    const [products, variants] = await Promise.all([prisma.product.findMany({ where: { companyId, code: { in: productRows.map((row) => value(row, "producto_codigo")).filter(Boolean) } }, select: { code: true } }), prisma.productVariant.findMany({ where: { sku: { in: variantRows.map((row) => value(row, "sku")).filter(Boolean) }, inventoryItem: { companyId } }, select: { sku: true } })]);
    const productCodes = new Set(products.map((item) => item.code.toUpperCase())); const skus = new Set(variants.map((item) => item.sku.toUpperCase()));
    productRows.filter((row) => productCodes.has(value(row, "producto_codigo").toUpperCase())).forEach((row) => warnings.push({ rowNumber: row.rowNumber, field: "producto_codigo", code: "EXISTING_RECORD_SKIPPED", message: `El producto ${value(row, "producto_codigo")} ya existe y será omitido.` }));
    variantRows.filter((row) => skus.has(value(row, "sku").toUpperCase())).forEach((row) => warnings.push({ rowNumber: row.rowNumber, field: "sku", code: "EXISTING_RECORD_SKIPPED", message: `El SKU ${value(row, "sku")} ya existe y será omitido.` }));
  } else if (module === "inventory") {
    const itemRows = data["Almacén"] ?? [];
    const codes = itemRows.map((row) => value(row, "codigo")).filter(Boolean);
    const legacyCodes = itemRows.map((row) => value(row, "codigo_anterior")).filter(Boolean);
    const registered = await prisma.inventoryItem.findMany({ where: { companyId, OR: [{ code: { in: codes } }, { legacyCode: { in: legacyCodes } }] }, select: { code: true, legacyCode: true } });
    const existing = new Set(registered.map((item) => item.code.toUpperCase()));
    const existingLegacy = new Set(registered.map((item) => item.legacyCode?.toUpperCase()).filter(Boolean));
    itemRows.filter((row) => existing.has(value(row, "codigo").toUpperCase())).forEach((row) => warnings.push({ rowNumber: row.rowNumber, field: "codigo", code: "EXISTING_RECORD_SKIPPED", message: `El ítem ${value(row, "codigo")} ya existe y será omitido.` }));
    itemRows.filter((row) => !value(row, "codigo") && existingLegacy.has(value(row, "codigo_anterior").toUpperCase())).forEach((row) => warnings.push({ rowNumber: row.rowNumber, field: "codigo_anterior", code: "EXISTING_LEGACY_RECORD", message: `El código anterior ${value(row, "codigo_anterior")} ya pertenece a un ítem registrado.` }));
  } else {
    const recipeRows = data.Recetas ?? []; const recipes = await prisma.recipe.findMany({ where: { companyId, code: { in: recipeRows.map((row) => value(row, "receta_codigo")).filter(Boolean) } }, select: { code: true, versions: { select: { version: true } } } });
    const versions = new Set(recipes.flatMap((recipe) => recipe.versions.map((version) => `${recipe.code.toUpperCase()}:${version.version}`)));
    recipeRows.filter((row) => versions.has(`${value(row, "receta_codigo").toUpperCase()}:${Number(value(row, "version"))}`)).forEach((row) => warnings.push({ rowNumber: row.rowNumber, field: "receta_codigo, version", code: "EXISTING_RECORD_SKIPPED", message: `La receta ${value(row, "receta_codigo")} versión ${value(row, "version")} ya existe y será omitida.` }));
  }
  return warnings;
}

export async function POST(request: Request, context: { params: Promise<{ module: string }> }) {
  try { requireSameOrigin(request); } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
  let user;
  try { user = await requirePermission("imports.preview"); } catch (error) { if (error instanceof AuthError) return apiError(error.code, error.message, error.status); throw error; }
  const { module } = await context.params;
  if (!isImportModule(module)) return apiError("NOT_FOUND", "El módulo no existe.", 404);
  const body = await request.formData();
  const file = body.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) return apiError("VALIDATION_ERROR", "Selecciona un archivo .xlsx.", 400);
  if (file.size > MAX_FILE_SIZE) return apiError("FILE_TOO_LARGE", "El archivo no puede superar 5 MB.", 413);
  const job = await prisma.importJob.create({ data: { companyId: user.companyId, createdById: user.id, module, fileName: file.name.slice(0, 250), status: "PROCESSING" } });
  try {
    const bytes = await file.arrayBuffer();
    const result = await validateWorkbook(module, bytes);
    if (result.importMode === "ONLY_NEW") result.warnings.push(...await existingWarnings(module, result.data, user.companyId));
    const { data: _data, ...publicResult } = result;
    void _data;
    const status = result.errors.length ? "COMPLETED_WITH_ERRORS" : "PENDING";
    await prisma.$transaction(async (tx) => {
      if (result.errors.length) await tx.importError.createMany({ data: result.errors.map((error) => ({ importId: job.id, rowNumber: error.rowNumber, field: error.field, code: error.code, message: error.message, rawData: error.rawData as Prisma.InputJsonValue | undefined })) });
      await tx.importJob.update({ where: { id: job.id }, data: { status, totalRows: result.totalRows, successRows: 0, errorRows: result.errors.length, finishedAt: result.errors.length ? new Date() : null } });
      await tx.auditLog.create({ data: { companyId: user.companyId, userId: user.id, entity: "ImportJob", entityId: job.id, action: "PREVIEW", afterData: { module, fileName: file.name, sha256: createHash("sha256").update(Buffer.from(bytes)).digest("hex"), totalRows: result.totalRows, errorRows: result.errors.length, warningRows: result.warnings.length, importMode: result.importMode } } });
    });
    return apiSuccess({ jobId: job.id, status, ...publicResult });
  } catch {
    await prisma.importJob.update({ where: { id: job.id }, data: { status: "FAILED", errorRows: 1, finishedAt: new Date(), errors: { create: { rowNumber: 1, code: "INVALID_WORKBOOK", message: "El archivo no es un libro Excel válido o está dañado." } } } });
    return apiError("INVALID_WORKBOOK", "El archivo no es un libro Excel válido o está dañado.", 422);
  }
}
