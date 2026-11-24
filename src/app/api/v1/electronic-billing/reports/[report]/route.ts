import { prisma } from "@/lib/database/prisma";
import { apiError, apiSuccess } from "@/lib/http/api-response";
import { requirePermission } from "@/modules/auth/application/session-service";
import { knownElectronicBillingError } from "@/modules/electronic-billing/application/electronic-billing-http";
import { downloadFiscalReport, getFiscalReport } from "@/modules/electronic-billing/application/electronic-document-service";
import type { FiscalReportName } from "@/modules/electronic-billing/domain/types";

const REPORTS: FiscalReportName[] = ["registro-ventas", "ventas-consolidado", "notas", "cobranzas", "documentos-internos", "por-cliente", "por-sucursal"];
const FORMATS = ["json", "pdf", "excel"] as const;
const SUNAT_STATES = ["pendiente", "enviado", "aceptado", "rechazado"];
const PAYMENT_STATES = ["pendiente", "parcial", "pagado"];
const CURRENCIES = ["PEN", "USD"];
const GROUPINGS = ["dia", "semana", "mes"];

function isReport(value: string): value is FiscalReportName {
  return REPORTS.includes(value as FiscalReportName);
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function GET(request: Request, context: { params: Promise<{ report: string }> }) {
  try {
    const user = await requirePermission("sales.read");
    const { report } = await context.params;
    if (!isReport(report)) return apiError("FISCAL_REPORT_NOT_FOUND", "El reporte fiscal solicitado no existe.", 404);

    const source = new URL(request.url).searchParams;
    const from = source.get("from") ?? "";
    const to = source.get("to") ?? "";
    const format = source.get("format") ?? "json";
    if (!validDate(from) || !validDate(to)) return apiError("VALIDATION_ERROR", "Selecciona un rango de fechas válido.", 400);
    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T00:00:00.000Z`);
    const days = Math.floor((toDate.getTime() - fromDate.getTime()) / 86_400_000);
    if (days < 0 || days > 366) return apiError("VALIDATION_ERROR", "El rango debe estar ordenado y no puede superar 366 días.", 400);
    if (!FORMATS.includes(format as (typeof FORMATS)[number])) return apiError("VALIDATION_ERROR", "El formato del reporte no es válido.", 400);

    const clientDocument = source.get("clientDocument")?.trim() ?? "";
    if (report === "por-cliente" && !/^\d{8,15}$/.test(clientDocument)) return apiError("VALIDATION_ERROR", "Ingresa el RUC o DNI del cliente.", 400);
    const sunatState = source.get("sunatState") ?? "";
    const paymentState = source.get("paymentState") ?? "";
    const currency = source.get("currency") ?? "";
    const grouping = source.get("grouping") ?? "";
    if (sunatState && !SUNAT_STATES.includes(sunatState)) return apiError("VALIDATION_ERROR", "El estado SUNAT no es válido.", 400);
    if (paymentState && !PAYMENT_STATES.includes(paymentState)) return apiError("VALIDATION_ERROR", "El estado de pago no es válido.", 400);
    if (currency && !CURRENCIES.includes(currency)) return apiError("VALIDATION_ERROR", "La moneda no es válida.", 400);
    if (grouping && !GROUPINGS.includes(grouping)) return apiError("VALIDATION_ERROR", "La agrupación no es válida.", 400);

    const query = new URLSearchParams({ fecha_desde: from, fecha_hasta: to, formato: format });
    if (clientDocument) query.set("client_num_doc", clientDocument);
    if (sunatState) query.set("estado_sunat", sunatState);
    if (paymentState) query.set("estado_pago", paymentState);
    if (currency) query.set("tipo_moneda", currency);
    if (grouping) query.set("agrupacion", grouping);
    if (source.get("overdue") === "true") query.set("vencido", "1");

    if (format === "json") return apiSuccess(await getFiscalReport(prisma, user.companyId, report, query.toString()));
    const file = await downloadFiscalReport(prisma, user.companyId, report, query.toString());
    const extension = format === "pdf" ? "pdf" : "xlsx";
    const fallback = `${report}-${from}-${to}.${extension}`;
    const fileName = (file.fileName ?? fallback).replace(/[^A-Za-z0-9._-]/g, "_");
    return new Response(file.bytes, { headers: { "Content-Type": file.contentType, "Content-Disposition": `attachment; filename="${fileName}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    const response = knownElectronicBillingError(error);
    if (response) return response;
    throw error;
  }
}
