import { prisma } from "@/lib/database/prisma";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { requirePermission } from "@/modules/auth/application/session-service";
import { getRequestIp, getRequestUserAgent } from "@/modules/auth/application/request-metadata";
import { calculateReferenceTotalCost } from "@/modules/inventory/domain/reference-cost";
import { createWorkbook, isImportModule, workbookSpecs, type WorkbookData } from "@/modules/imports/application/workbook";
import { parseReportPeriod, reportDateFilter, ReportPeriodError, type ReportPeriod } from "@/modules/imports/application/report-period";

function date(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

export async function reportData(module: keyof typeof workbookSpecs, companyId: string, period: ReportPeriod | null): Promise<WorkbookData> {
  const dateRange = reportDateFilter(period);
  if (module === "purchases") {
    const items = await prisma.purchase.findMany({ where: { companyId, receptionDate: dateRange }, orderBy: { receptionDate: "desc" }, include: { supplier: true, currency: true, lines: { orderBy: { lineNumber: "asc" }, include: { item: { include: { unit: true } }, lots: { orderBy: { lineNumber: "asc" }, include: { lot: true } } } } } });
    return {
      Compras: items.flatMap((item) => item.lines.flatMap((line) => (line.lots.length ? line.lots : [{ lineNumber: 1, lot: null, quantity: line.receivedQuantity }]).map((allocation) => [item.code, item.sourceOrderReference, item.receiptSequence, date(item.receptionDate), item.supplier.code, null, null, item.documentNumber, item.currency.code, Number(item.exchangeRate), item.status, null, line.lineNumber, allocation.lineNumber, line.item.code, allocation.lot?.supplierLot, date(allocation.lot?.expiresAt), Number(line.presentationQty), line.presentationType, Number(line.contentPerUnit), line.item.unit.code, Number(line.pricePerBaseUnit), Number(line.taxRate), Number(allocation.quantity), Number(line.pricePerBaseUnit) * (1 + Number(line.taxRate) / 100), Number(line.subtotal), Number(line.taxAmount), Number(line.total)]))),
    };
  }
  if (module === "inventory") {
    const items = await prisma.inventoryItem.findMany({ where: { companyId, createdAt: dateRange }, orderBy: { code: "asc" }, include: { unit: true, supplier: true, currency: true, balances: { include: { warehouse: true, lot: true } } } });
    return {
      "Almacén": items.flatMap((item) => {
        const balances = item.balances.filter((balance) => balance.lotId === null && Number(balance.onHandQuantity) !== 0);
        const rows = balances.length ? balances : [null];
        const type = item.type === "RAW_MATERIAL" ? "MATERIA_PRIMA" : item.type === "WASTE" ? "MERMA" : "PRODUCTO_TERMINADO";
        const referenceTotalCost = item.referenceNetPrice ? Number(calculateReferenceTotalCost({ netPrice: item.referenceNetPrice.toString(), taxRate: item.referenceTaxRate?.toString() ?? null })) : null;
        return rows.map((balance) => [item.code, item.abbreviation, item.name, type, item.supplier?.name ?? null, item.supplierProductCode, item.currency?.code ?? null, item.referenceNetPrice ? Number(item.referenceNetPrice) : null, item.referenceTaxRate ? Number(item.referenceTaxRate) : null, referenceTotalCost, item.unit.code, item.lotTrackingMode, Number(item.minimumStock), item.active ? "SI" : "NO", balance?.warehouse.code ?? null, balance ? Number(balance.onHandQuantity) : null, balance ? Number(balance.averageUnitCost) : null, null, balance ? date(balance.updatedAt) : null, balance ? "Saldo actual exportado" : null]);
      }),
    };
  }
  if (module === "recipes") {
    const items = await prisma.recipe.findMany({ where: { companyId, createdAt: dateRange }, orderBy: { code: "asc" }, include: { product: true, versions: { orderBy: { version: "asc" }, include: { ingredients: { include: { item: { include: { unit: true } } } } } } } });
    return {
      Recetas: items.flatMap((recipe) => recipe.versions.flatMap((version) => version.ingredients.map((ingredient) => [recipe.code, recipe.code, recipe.product.code, null, version.version, Number(version.yieldQuantity), "UN", version.isActive ? "ACTIVE" : recipe.status, ingredient.item.code, Number(ingredient.quantity), ingredient.item.unit.code]))),
    };
  }
  if (module === "products") {
    const items = await prisma.product.findMany({ where: { companyId, createdAt: dateRange }, orderBy: { code: "asc" }, include: { variants: { include: { size: true, color: true, secondaryColor: true, inventoryItem: { include: { unit: true } } } } } });
    return {
      Productos: items.flatMap((item) => (item.variants.length ? item.variants : [null]).map((variant) => [item.code, item.code, item.matrixCode, item.name, null, item.description, item.active ? "SI" : "NO", variant?.sku ?? null, variant?.size.code ?? null, variant?.color.code ?? null, variant?.secondaryColor?.code ?? null, variant?.inventoryItem.unit.code ?? null, variant ? Number(variant.inventoryItem.minimumStock) : null, null, variant ? (variant.active ? "SI" : "NO") : null])),
    };
  }
  const items = await prisma.salesOrder.findMany({ where: { companyId, requestedAt: dateRange }, orderBy: { requestedAt: "desc" }, include: { customer: true, lines: { include: { productVariant: true } } } });
  return {
    Pedidos: items.flatMap((item) => item.lines.map((line, index) => { const subtotal = Number(line.quantity) * Number(line.unitPrice); const tax = subtotal * 0.18; return [item.number, item.number, item.customer.code, date(item.requestedAt), date(item.promisedAt), "PEN", 1, item.status, item.notes, index + 1, line.productVariant.sku, Number(line.quantity), Number(line.unitPrice), 18, subtotal, tax, subtotal + tax]; })),
  };
}

export async function GET(request: Request, context: { params: Promise<{ module: string }> }) {
  try {
    const { module } = await context.params;
    if (!isImportModule(module)) return Response.json({ error: { code: "NOT_FOUND", message: "El módulo no existe." } }, { status: 404 });
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") === "report" ? "report" : "template";
    const period = mode === "report" ? parseReportPeriod(url.searchParams) : null;
    const spec = workbookSpecs[module];
    const user = await requirePermission(mode === "report" ? spec.permission : "imports.read");
    const data = mode === "report" ? await reportData(module, user.companyId, period) : {};
    const inventoryOptions = module === "inventory" ? await Promise.all([
      prisma.warehouse.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { code: "asc" }, select: { code: true, name: true } }),
      prisma.supplier.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { name: "asc" }, select: { name: true } }),
      prisma.currency.findMany({ where: { companyId: user.companyId }, orderBy: { code: "asc" }, select: { code: true, name: true } }),
    ]) : undefined;
    const bytes = await createWorkbook(module, data, {
      fileKind: mode === "report" ? "REPORT" : "TEMPLATE",
      ...(inventoryOptions ? { warehouses: inventoryOptions[0], suppliers: inventoryOptions[1], currencies: inventoryOptions[2] } : {}),
      ...(period ? { reportPeriod: { from: period.fromText, to: period.toText } } : {}),
    });
    const stamp = new Date().toISOString().slice(0, 10);
    const periodSuffix = period ? `${period.fromText}-a-${period.toText}` : stamp;
    const fileName = mode === "report" ? `reporte-${spec.file}-${periodSuffix}.xlsx` : `plantilla-${spec.file}-v1.8.xlsx`;
    await prisma.auditLog.create({ data: { companyId: user.companyId, userId: user.id, module, entity: mode === "report" ? "Report" : "Template", entityId: module, action: "EXPORT", ipAddress: getRequestIp(request), userAgent: getRequestUserAgent(request), requestPath: new URL(request.url).pathname, afterData: { kind: mode, fileName, period: period ? { from: period.fromText, to: period.toText } : null } } });
    return new Response(new Uint8Array(bytes), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${fileName}"`, "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    if (error instanceof ReportPeriodError) return Response.json({ error: { code: "INVALID_DATE_RANGE", message: error.message } }, { status: 400 });
    throw error;
  }
}
