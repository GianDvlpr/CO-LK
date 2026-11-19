import { Prisma, type PrismaClient } from "@prisma/client";
import { nextBusinessCode } from "@/lib/database/business-code";
import { ElectronicBillingError } from "@/modules/electronic-billing/application/errors";
import type { CreateElectronicDocumentInput } from "@/modules/electronic-billing/application/schemas";
import { mapSaleToBillingPayload } from "@/modules/electronic-billing/application/sale-mapper";
import { isFinalElectronicStatus, nextPollingDate, normalizeRemoteStatus, remoteStatusValue } from "@/modules/electronic-billing/domain/status";
import type { CreditOrDebitNotePayload, ElectronicDocumentKind, InvoicePayload, OfficialCpeResult, RemoteDocument, RemotePaymentSummary, RemoteSeries, SunatServiceMonitor } from "@/modules/electronic-billing/domain/types";
import { ElectronicBillingClient } from "@/modules/electronic-billing/infrastructure/client";
import { readElectronicBillingConfig } from "@/modules/electronic-billing/infrastructure/config";

const saleInclude = {
  company: { select: { taxId: true } },
  customer: { select: { name: true, taxId: true, documentType: true, fiscalAddress: true } },
  currency: { select: { code: true } },
  lines: {
    include: {
      productVariant: {
        select: {
          sku: true,
          product: { select: { name: true } },
          size: { select: { name: true } },
          color: { select: { name: true } },
          secondaryColor: { select: { name: true } },
        },
      },
    },
  },
} satisfies Prisma.SaleInclude;

const resources: Record<ElectronicDocumentKind, string> = {
  INVOICE: "facturas",
  RECEIPT: "boletas",
  CREDIT_NOTE: "notas-credito",
  DEBIT_NOTE: "notas-debito",
  SENDER_GUIDE: "guias-remision",
  CARRIER_GUIDE: "guias-remision",
  RETENTION: "retenciones",
  PERCEPTION: "percepciones",
  PURCHASE_SETTLEMENT: "liquidaciones-compra",
  DAILY_SUMMARY: "resumenes",
  VOIDED_DOCUMENT: "anulaciones",
  REVERSION: "anulaciones",
};

const seriesTypes: Partial<Record<ElectronicDocumentKind, string>> = {
  INVOICE: "01",
  RECEIPT: "03",
  CREDIT_NOTE: "07",
  DEBIT_NOTE: "08",
  SENDER_GUIDE: "09",
  CARRIER_GUIDE: "31",
  RETENTION: "20",
  PERCEPTION: "40",
  PURCHASE_SETTLEMENT: "04",
};

const officialCpeTypes: Partial<Record<ElectronicDocumentKind, string>> = {
  INVOICE: "01",
  RECEIPT: "03",
  PURCHASE_SETTLEMENT: "04",
  CREDIT_NOTE: "07",
  DEBIT_NOTE: "08",
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function officialCpeDate(value: unknown) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) throw new ElectronicBillingError("BILLING_CPE_DATA_INVALID", "El comprobante no tiene una fecha de emisión válida para consultar a SUNAT.", 422, false);
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function officialCpeAmount(remote: RemoteDocument, kind: ElectronicDocumentKind) {
  const totals = record(remote.totales);
  const value = kind === "PURCHASE_SETTLEMENT" ? totals.neto_a_pagar : totals.total;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new ElectronicBillingError("BILLING_CPE_DATA_INVALID", "El comprobante no tiene un total válido para consultar a SUNAT.", 422, false);
  }
  return amount;
}

function remoteDocumentId(remote: RemoteDocument, fallback?: string | null) {
  const value = remote.id ?? remote.id_resumen ?? remote.id_anulacion ?? remote.voided_id ?? fallback;
  if (value === undefined || value === null || value === "") {
    throw new ElectronicBillingError("BILLING_INVALID_RESPONSE", "La plataforma de facturación no devolvió el identificador del documento.", 502, true);
  }
  return String(value);
}

function documentFields(remote: RemoteDocument, attempts: number, submitted = false, current?: {
  remoteId?: string | null;
  series?: string | null;
  correlativo?: string | null;
  number?: string | null;
}) {
  const remoteStatus = remoteStatusValue(remote);
  const status = normalizeRemoteStatus(remoteStatus);
  const now = new Date();
  return {
    status,
    remoteStatus,
    remoteId: remoteDocumentId(remote, current?.remoteId),
    series: remote.serie ? String(remote.serie) : current?.series ?? null,
    correlativo: remote.correlativo === undefined ? current?.correlativo ?? null : String(remote.correlativo),
    number: remote.numero_completo ? String(remote.numero_completo) : remote.identifier ? String(remote.identifier) : current?.number ?? null,
    sunatCode: remote.sunat_code || remote.codigo_sunat ? String(remote.sunat_code ?? remote.codigo_sunat) : null,
    sunatDescription: remote.sunat_description || remote.descripcion_sunat ? String(remote.sunat_description ?? remote.descripcion_sunat) : null,
    sunatNotes: remote.sunat_notes || remote.notas_sunat ? (remote.sunat_notes ?? remote.notas_sunat) as Prisma.InputJsonValue : Prisma.JsonNull,
    ticket: remote.ticket ? String(remote.ticket) : remote.num_ticket ? String(remote.num_ticket) : null,
    response: remote as Prisma.InputJsonValue,
    lastError: null,
    attempts,
    ...(submitted ? { submittedAt: now } : {}),
    acceptedAt: status === "ACCEPTED" || status === "ACCEPTED_WITH_OBSERVATION" ? now : null,
    lastCheckedAt: now,
    nextCheckAt: isFinalElectronicStatus(status) ? null : nextPollingDate(attempts, now),
  };
}

function billingClient(companyTaxId: string | null) {
  const config = readElectronicBillingConfig(companyTaxId);
  return { config, client: new ElectronicBillingClient(config) };
}

export async function issueElectronicSale(database: PrismaClient, command: {
  companyId: string;
  userId: string;
  saleId: string;
}) {
  const sale = await database.sale.findFirst({
    where: { id: command.saleId, companyId: command.companyId },
    include: saleInclude,
  });
  if (!sale) throw new ElectronicBillingError("SALE_NOT_FOUND", "La venta no existe.", 404, false);
  if (sale.status !== "DRAFT") throw new ElectronicBillingError("SALE_INVALID_STATE", "Solo puede emitirse una venta en borrador.", 422, false);
  if (sale.documentType !== "INVOICE" && sale.documentType !== "RECEIPT") {
    throw new ElectronicBillingError("SALE_NOT_ELECTRONIC", "El tipo de venta seleccionado no es un comprobante electrónico.", 422, false);
  }

  const kind = sale.documentType === "INVOICE" ? "INVOICE" : "RECEIPT";
  const businessKey = `sale:${sale.id}:primary`;
  const idempotencyKey = `lkinnova:${businessKey}`;
  const { config, client } = billingClient(sale.company.taxId);
  const preferredSeries = (sale.documentSeries ?? (kind === "INVOICE" ? config.series.invoice : config.series.receipt))?.trim().toUpperCase();
  const availableSeries = activeSeriesForKind(await client.getSeries(), kind);
  const selectedSeries = preferredSeries
    ? availableSeries.find((item) => item.serie.toUpperCase() === preferredSeries)
    : availableSeries[0];
  if (!selectedSeries) {
    throw new ElectronicBillingError(
      "BILLING_SERIES_INVALID",
      preferredSeries
        ? `La serie ${preferredSeries} no está activa para esta ${kind === "INVOICE" ? "factura" : "boleta"}.`
        : `No existe una serie activa para ${kind === "INVOICE" ? "facturas" : "boletas"} en la plataforma SUNAT.`,
      422,
      false,
    );
  }
  const series = selectedSeries.serie;
  const payload = mapSaleToBillingPayload(sale, series);

  const local = await database.electronicDocument.upsert({
    where: { companyId_businessKey: { companyId: command.companyId, businessKey } },
    update: {},
    create: {
      companyId: command.companyId,
      saleId: sale.id,
      createdById: command.userId,
      kind,
      businessKey,
      idempotencyKey,
      status: "SUBMITTING",
    },
  });
  if (local.remoteId) return local;

  try {
    const remote = kind === "INVOICE"
      ? await client.createInvoice(payload, idempotencyKey)
      : await client.createReceipt(payload, idempotencyKey);
    const fields = documentFields(remote, local.attempts + 1, true);

    return await database.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM sales WHERE id = ${sale.id}::uuid FOR UPDATE`;
      const document = await tx.electronicDocument.update({ where: { id: local.id }, data: fields });
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: "ISSUED",
          documentSeries: fields.series ?? series,
          documentNumber: fields.correlativo,
        },
      });
      await tx.auditLog.create({
        data: {
          companyId: command.companyId,
          userId: command.userId,
          module: "sales",
          entity: "Sale",
          entityId: sale.id,
          action: "ISSUE_ELECTRONIC",
          afterData: { documentId: document.id, kind, number: fields.number, status: fields.status },
        },
      });
      await tx.outboxEvent.create({
        data: {
          companyId: command.companyId,
          topic: `private-company-${command.companyId}`,
          eventName: "electronic-document.submitted.v1",
          aggregateId: document.id,
          payload: { electronicDocumentId: document.id, saleId: sale.id, kind, status: fields.status },
        },
      });
      return document;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1_000) : "Error desconocido al emitir.";
    await database.electronicDocument.update({
      where: { id: local.id },
      data: { status: "ERROR", lastError: message, attempts: { increment: 1 }, nextCheckAt: null },
    });
    throw error;
  }
}

export async function issueElectronicSalesBulk(database: PrismaClient, command: {
  companyId: string;
  userId: string;
  saleIds: string[];
}) {
  const uniqueIds = [...new Set(command.saleIds)];
  if (!uniqueIds.length || uniqueIds.length > 100) throw new ElectronicBillingError("BILLING_BULK_INVALID", "Selecciona entre 1 y 100 facturas.", 422, false);
  const sales = await database.sale.findMany({ where: { id: { in: uniqueIds }, companyId: command.companyId }, include: saleInclude });
  if (sales.length !== uniqueIds.length) throw new ElectronicBillingError("SALE_NOT_FOUND", "Alguna venta seleccionada no existe.", 404, false);
  if (sales.some((sale) => sale.status !== "DRAFT" || sale.documentType !== "INVOICE")) {
    throw new ElectronicBillingError("BILLING_BULK_INVALID", "La emisión masiva solo admite facturas en borrador.", 422, false);
  }
  const { config, client } = billingClient(sales[0]!.company.taxId);
  const availableSeries = activeSeriesForKind(await client.getSeries(), "INVOICE");
  const payloads: InvoicePayload[] = [];
  const locals = [];
  for (const sale of sales) {
    const preferred = (sale.documentSeries ?? config.series.invoice)?.trim().toUpperCase();
    const selected = preferred ? availableSeries.find((item) => item.serie.toUpperCase() === preferred) : availableSeries[0];
    if (!selected) throw new ElectronicBillingError("BILLING_SERIES_INVALID", `La venta ${sale.number} no tiene una serie de factura activa.`, 422, false);
    payloads.push(mapSaleToBillingPayload(sale, selected.serie));
    const businessKey = `sale:${sale.id}:primary`;
    const local = await database.electronicDocument.upsert({
      where: { companyId_businessKey: { companyId: command.companyId, businessKey } },
      update: {},
      create: { companyId: command.companyId, saleId: sale.id, createdById: command.userId, kind: "INVOICE", businessKey, idempotencyKey: `lkinnova:${businessKey}`, status: "SUBMITTING", series: selected.serie },
    });
    if (local.remoteId) throw new ElectronicBillingError("BILLING_DUPLICATE", `La venta ${sale.number} ya tiene un documento remoto.`, 409, false);
    locals.push(local);
  }

  const batchKey = `lkinnova:bulk:${uniqueIds.slice().sort().join(":")}`;
  let result: Awaited<ReturnType<ElectronicBillingClient["createInvoicesBulk"]>>;
  try {
    result = await client.createInvoicesBulk(payloads, batchKey);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1_000) : "No se pudo completar la emisión masiva.";
    await database.electronicDocument.updateMany({ where: { id: { in: locals.map((item) => item.id) }, remoteId: null }, data: { status: "ERROR", lastError: message, attempts: { increment: 1 }, nextCheckAt: null } });
    throw error;
  }
  for (const created of result.facturas) {
    const sale = sales[created.indice];
    const local = locals[created.indice];
    if (!sale || !local) continue;
    const fields = documentFields(created, local.attempts + 1, true, local);
    await database.$transaction(async (tx) => {
      const document = await tx.electronicDocument.update({ where: { id: local.id }, data: fields });
      await tx.sale.update({ where: { id: sale.id }, data: { status: "ISSUED", documentSeries: fields.series, documentNumber: fields.correlativo } });
      await tx.auditLog.create({ data: { companyId: command.companyId, userId: command.userId, module: "sales", entity: "Sale", entityId: sale.id, action: "ISSUE_ELECTRONIC_BULK", afterData: { documentId: document.id, number: fields.number, status: fields.status } } });
      await tx.outboxEvent.create({ data: { companyId: command.companyId, topic: `private-company-${command.companyId}`, eventName: "electronic-document.submitted.v1", aggregateId: document.id, payload: { electronicDocumentId: document.id, saleId: sale.id, kind: "INVOICE", status: fields.status } } });
    });
  }
  for (const failure of result.errores) {
    const local = locals[failure.indice];
    if (local) await database.electronicDocument.update({ where: { id: local.id }, data: { status: "ERROR", lastError: failure.mensaje.slice(0, 1_000), attempts: { increment: 1 }, nextCheckAt: null } });
  }
  return result;
}

function seriesForKind(config: ReturnType<typeof readElectronicBillingConfig>, kind: CreateElectronicDocumentInput["kind"]) {
  const definitions = {
    CREDIT_NOTE: [config.series.creditNote, "nota de crédito"],
    DEBIT_NOTE: [config.series.debitNote, "nota de débito"],
    SENDER_GUIDE: [config.series.senderGuide, "guía de remisión remitente"],
    CARRIER_GUIDE: [config.series.carrierGuide, "guía de remisión transportista"],
    RETENTION: [config.series.retention, "retención"],
    PERCEPTION: [config.series.perception, "percepción"],
    PURCHASE_SETTLEMENT: [config.series.purchaseSettlement, "liquidación de compra"],
  } as const;
  if (!(kind in definitions)) return undefined;
  const [value] = definitions[kind as keyof typeof definitions];
  return value?.trim().toUpperCase();
}

function activeSeriesForKind(series: RemoteSeries[], kind: ElectronicDocumentKind) {
  const type = seriesTypes[kind];
  return type ? series.filter((item) => item.activo && item.tipo_documento === type) : [];
}

export async function getRemoteBillingSeries(companyTaxId: string | null) {
  const { client } = billingClient(companyTaxId);
  return client.getSeries();
}

function extractRemotePage(value: unknown) {
  if (Array.isArray(value)) return { items: value as RemoteDocument[], currentPage: 1, lastPage: 1 };
  if (!value || typeof value !== "object") return { items: [] as RemoteDocument[], currentPage: 1, lastPage: 1 };
  const record = value as Record<string, unknown>;
  const nested = record.datos;
  const items = Array.isArray(nested) ? nested as RemoteDocument[]
    : Array.isArray(record.data) ? record.data as RemoteDocument[]
      : [];
  const pagination = (record.paginacion ?? record.meta) as Record<string, unknown> | undefined;
  return {
    items,
    currentPage: Number(pagination?.pagina_actual ?? pagination?.current_page ?? 1),
    lastPage: Number(pagination?.ultima_pagina ?? pagination?.last_page ?? 1),
  };
}

function remoteKind(collectionKind: ElectronicDocumentKind, remote: RemoteDocument): ElectronicDocumentKind {
  if (collectionKind === "SENDER_GUIDE" && String(remote.tipo_documento ?? "09") === "31") return "CARRIER_GUIDE";
  if (collectionKind === "VOIDED_DOCUMENT" && String(remote.identifier ?? "").startsWith("RR-")) return "REVERSION";
  return collectionKind;
}

const remoteCollections: Array<{ kind: ElectronicDocumentKind; resource: string }> = [
  { kind: "INVOICE", resource: "facturas" },
  { kind: "RECEIPT", resource: "boletas" },
  { kind: "CREDIT_NOTE", resource: "notas-credito" },
  { kind: "DEBIT_NOTE", resource: "notas-debito" },
  { kind: "SENDER_GUIDE", resource: "guias-remision" },
  { kind: "RETENTION", resource: "retenciones" },
  { kind: "PERCEPTION", resource: "percepciones" },
  { kind: "PURCHASE_SETTLEMENT", resource: "liquidaciones-compra" },
  { kind: "DAILY_SUMMARY", resource: "resumenes" },
  { kind: "VOIDED_DOCUMENT", resource: "anulaciones" },
];

export async function syncRemoteElectronicDocuments(database: PrismaClient, command: { companyId: string; userId: string }) {
  const company = await database.company.findUnique({ where: { id: command.companyId }, select: { taxId: true } });
  if (!company) throw new ElectronicBillingError("COMPANY_NOT_FOUND", "La empresa no existe.", 404, false);
  const { client } = billingClient(company.taxId);
  let created = 0;
  let updated = 0;
  const errors: Array<{ resource: string; message: string }> = [];

  for (const collection of remoteCollections) {
    try {
      let page = 1;
      let lastPage = 1;
      do {
        const separator = collection.resource.includes("?") ? "&" : "?";
        const value = await client.request<unknown>(`${collection.resource}${separator}pagina=${page}&page=${page}&por_pagina=100&per_page=100`);
        const remotePage = extractRemotePage(value);
        lastPage = Math.max(remotePage.lastPage, 1);
        for (const remote of remotePage.items) {
          const kind = remoteKind(collection.kind, remote);
          const remoteId = remoteDocumentId(remote);
          const existing = await database.electronicDocument.findFirst({ where: { companyId: command.companyId, kind, remoteId } });
          const fields = documentFields(remote, existing?.attempts ?? 0, false, existing ?? undefined);
          if (existing) {
            await database.electronicDocument.update({ where: { id: existing.id }, data: fields });
            updated += 1;
          } else {
            await database.electronicDocument.create({
              data: {
                companyId: command.companyId,
                createdById: command.userId,
                kind,
                businessKey: `remote:${kind}:${remoteId}`,
                idempotencyKey: `lkinnova:remote:${kind}:${remoteId}`,
                ...fields,
              },
            });
            created += 1;
          }
        }
        page += 1;
      } while (page <= lastPage && page <= 100);
    } catch (error) {
      errors.push({ resource: collection.resource, message: error instanceof Error ? error.message : "Error desconocido" });
    }
  }

  await database.auditLog.create({ data: {
    companyId: command.companyId, userId: command.userId, module: "electronic-billing",
    entity: "ElectronicDocument", entityId: command.companyId, action: "SYNC_REMOTE",
    afterData: { created, updated, errors },
  } });
  return { created, updated, errors };
}

export async function getElectronicDocumentDetail(database: PrismaClient, companyId: string, documentId: string) {
  const document = await database.electronicDocument.findFirst({
    where: { id: documentId, companyId },
    include: {
      company: { select: { taxId: true } },
      sale: { select: { id: true, number: true, customer: { select: { name: true } } } },
      createdBy: { select: { name: true, username: true } },
    },
  });
  if (!document?.remoteId) throw new ElectronicBillingError("BILLING_DOCUMENT_NOT_FOUND", "El documento remoto no está disponible.", 404, false);
  const { client } = billingClient(document.company.taxId);
  const statusEndpoint = document.kind === "DAILY_SUMMARY";
  const remote = await client.getDocumentStatus(resources[document.kind], document.remoteId, statusEndpoint);
  return { document, remote };
}

export async function validateElectronicDocumentCpe(database: PrismaClient, command: {
  companyId: string;
  userId: string;
  documentId: string;
}): Promise<OfficialCpeResult & { checkedAt: string; local: { kind: ElectronicDocumentKind; number: string | null; status: string } }> {
  const document = await database.electronicDocument.findFirst({
    where: { id: command.documentId, companyId: command.companyId },
    include: { company: { select: { taxId: true } } },
  });
  if (!document?.remoteId) throw new ElectronicBillingError("BILLING_DOCUMENT_NOT_FOUND", "El documento remoto no está disponible.", 404, false);
  const tipoDoc = officialCpeTypes[document.kind];
  if (!tipoDoc) {
    throw new ElectronicBillingError("BILLING_CPE_NOT_SUPPORTED", "La consulta oficial CPE no está disponible para este tipo de documento.", 422, false);
  }
  if (!document.company.taxId || !/^\d{11}$/.test(document.company.taxId)) {
    throw new ElectronicBillingError("BILLING_CPE_COMPANY_RUC_INVALID", "La empresa no tiene un RUC válido configurado.", 422, false);
  }

  const { client } = billingClient(document.company.taxId);
  const remote = await client.getDocument(resources[document.kind], document.remoteId);
  const serie = String(remote.serie ?? document.series ?? "").trim().toUpperCase();
  const correlativo = Number(remote.correlativo ?? document.correlativo);
  if (!serie || serie.length > 4 || !Number.isInteger(correlativo) || correlativo < 1) {
    throw new ElectronicBillingError("BILLING_CPE_DATA_INVALID", "La serie o el correlativo del comprobante no permiten realizar la consulta oficial.", 422, false);
  }

  const result = await client.consultCpe({
    rucEmisor: document.company.taxId,
    tipoDoc,
    serie,
    correlativo,
    fechaEmision: officialCpeDate(remote.fecha_emision),
    monto: officialCpeAmount(remote, document.kind),
  });
  const checkedAt = new Date().toISOString();
  await database.auditLog.create({ data: {
    companyId: command.companyId,
    userId: command.userId,
    module: "electronic-billing",
    entity: "ElectronicDocument",
    entityId: document.id,
    action: "OFFICIAL_CPE_QUERY",
    afterData: {
      tipoDoc,
      serie,
      correlativo,
      encontrado: result.encontrado,
      estadoCp: result.estado_cp ?? null,
      estadoCpDescripcion: result.estado_cp_descripcion ?? null,
    },
  } });
  return { ...result, checkedAt, local: { kind: document.kind, number: document.number, status: document.status } };
}

function paymentResource(kind: ElectronicDocumentKind) {
  if (kind === "INVOICE") return "facturas";
  if (kind === "RECEIPT") return "boletas";
  if (kind === "PURCHASE_SETTLEMENT") return "liquidaciones-compra";
  throw new ElectronicBillingError("BILLING_PAYMENTS_NOT_SUPPORTED", "Este tipo de documento no admite pagos en la plataforma SUNAT.", 422, false);
}

async function paymentDocument(database: PrismaClient, companyId: string, documentId: string) {
  const document = await database.electronicDocument.findFirst({
    where: { id: documentId, companyId },
    include: { company: { select: { taxId: true } } },
  });
  if (!document?.remoteId) throw new ElectronicBillingError("BILLING_DOCUMENT_NOT_FOUND", "El documento remoto no está disponible.", 404, false);
  return document;
}

export async function getElectronicDocumentPayments(database: PrismaClient, companyId: string, documentId: string): Promise<RemotePaymentSummary> {
  const document = await paymentDocument(database, companyId, documentId);
  const { client } = billingClient(document.company.taxId);
  return client.getPayments(paymentResource(document.kind), document.remoteId!);
}

export async function addElectronicDocumentPayment(database: PrismaClient, command: {
  companyId: string; userId: string; documentId: string; payment: Record<string, unknown>;
}) {
  const document = await paymentDocument(database, command.companyId, command.documentId);
  const { client } = billingClient(document.company.taxId);
  const result = await client.addPayment(paymentResource(document.kind), document.remoteId!, command.payment);
  await database.auditLog.create({ data: {
    companyId: command.companyId, userId: command.userId, module: "electronic-billing",
    entity: "ElectronicDocument", entityId: document.id, action: "REMOTE_PAYMENT_CREATE",
    afterData: { remoteId: document.remoteId, metodo: command.payment.metodo, monto: command.payment.monto } as Prisma.InputJsonValue,
  } });
  return result;
}

export async function deleteElectronicDocumentPayment(database: PrismaClient, command: {
  companyId: string; userId: string; documentId: string; paymentId: number;
}) {
  const document = await paymentDocument(database, command.companyId, command.documentId);
  const { client } = billingClient(document.company.taxId);
  const result = await client.deletePayment(paymentResource(document.kind), document.remoteId!, command.paymentId);
  await database.auditLog.create({ data: {
    companyId: command.companyId, userId: command.userId, module: "electronic-billing",
    entity: "ElectronicDocument", entityId: document.id, action: "REMOTE_PAYMENT_DELETE",
    afterData: { remoteId: document.remoteId, paymentId: command.paymentId },
  } });
  return result;
}

async function clientForCompany(database: PrismaClient, companyId: string) {
  const company = await database.company.findUnique({ where: { id: companyId }, select: { taxId: true } });
  if (!company) throw new ElectronicBillingError("COMPANY_NOT_FOUND", "La empresa no existe.", 404, false);
  return billingClient(company.taxId).client;
}

export async function getFiscalAdministration(database: PrismaClient, companyId: string) {
  const client = await clientForCompany(database, companyId);
  const [series, branches] = await Promise.all([client.getAllSeries(), client.getBranches()]);
  return { series, branches };
}

export async function mutateFiscalAdministration(database: PrismaClient, command: {
  companyId: string; userId: string; entity: "series" | "branches"; action: "create" | "update" | "delete"; id?: number; payload?: Record<string, unknown>;
}) {
  const client = await clientForCompany(database, command.companyId);
  let result: unknown;
  if (command.entity === "series") {
    if (command.action === "create") result = await client.createSeries(command.payload ?? {});
    else if (command.action === "update" && command.id) result = await client.updateSeries(command.id, command.payload ?? {});
    else if (command.action === "delete" && command.id) result = await client.disableSeries(command.id);
    else throw new ElectronicBillingError("BILLING_ADMIN_INVALID", "Operación de serie inválida.", 400, false);
  } else {
    if (command.action === "create") result = await client.createBranch(command.payload ?? {});
    else if (command.action === "update" && command.id) result = await client.updateBranch(command.id, command.payload ?? {});
    else if (command.action === "delete" && command.id) result = await client.deleteBranch(command.id);
    else throw new ElectronicBillingError("BILLING_ADMIN_INVALID", "Operación de sucursal inválida.", 400, false);
  }
  await database.auditLog.create({ data: {
    companyId: command.companyId, userId: command.userId, module: "electronic-billing",
    entity: command.entity === "series" ? "RemoteSeries" : "RemoteBranch",
    entityId: String(command.id ?? "new"), action: `REMOTE_${command.action.toUpperCase()}`,
    afterData: { payload: command.payload ?? null } as Prisma.InputJsonValue,
  } });
  return result;
}

export async function getFiscalDashboard(database: PrismaClient, companyId: string, month?: string) {
  const client = await clientForCompany(database, companyId);
  const query = month ? `?mes=${encodeURIComponent(month)}` : "";
  const [overview, indicators, sunat, collections, alerts, monthlySales, branches, currencies, customers, products, recentDocuments] = await Promise.all([
    client.request<Record<string, unknown>>(`panel${query}`),
    client.request<Record<string, unknown>>(`panel/indicadores${query}`),
    client.request<Record<string, unknown>>(`panel/estado-sunat${query}`),
    client.request<Record<string, unknown>>(`panel/cobranzas${query}`),
    client.request<Record<string, unknown>>("panel/alertas"),
    client.request<Record<string, unknown>>("panel/ventas-mensuales"),
    client.request<Record<string, unknown>>(`panel/por-sucursal${query}`),
    client.request<Record<string, unknown>>(`panel/por-moneda${query}`),
    client.request<Record<string, unknown>>(`panel/clientes${query}`),
    client.request<Record<string, unknown>>(`panel/productos${query}`),
    client.request<Record<string, unknown>>("panel/documentos-recientes?limit=20"),
  ]);
  return { overview, indicators, sunat, collections, alerts, monthlySales, branches, currencies, customers, products, recentDocuments };
}

export async function getSunatServiceMonitor(database: PrismaClient, companyId: string): Promise<SunatServiceMonitor & { checkedAt: string }> {
  const client = await clientForCompany(database, companyId);
  const monitor = await client.getSunatMonitor();
  return { ...monitor, checkedAt: new Date().toISOString() };
}

export async function getFiscalReference(database: PrismaClient, companyId: string, path: string) {
  const client = await clientForCompany(database, companyId);
  return client.request<unknown>(path);
}

export async function downloadFiscalExport(database: PrismaClient, companyId: string, query: string) {
  const client = await clientForCompany(database, companyId);
  return client.download(`comprobantes/exportar-zip${query}`);
}

export async function lookupRemoteTaxpayer(database: PrismaClient, companyId: string, type: "1" | "6", number: string) {
  const client = await clientForCompany(database, companyId);
  return client.lookupDocument(type, number);
}

export async function syncRemoteClients(database: PrismaClient, command: { companyId: string; userId: string }) {
  const client = await clientForCompany(database, command.companyId);
  let page = 1;
  let lastPage = 1;
  let created = 0;
  let updated = 0;
  do {
    const value = await client.request<unknown>(`clientes?page=${page}&por_pagina=100`);
    const remotePage = extractRemotePage(value);
    lastPage = Math.max(remotePage.lastPage, 1);
    for (const raw of remotePage.items) {
      const taxId = String(raw.numero_documento ?? "").trim();
      const name = String(raw.razon_social ?? "").trim();
      const remoteType = String(raw.tipo_documento ?? "");
      if (!taxId || !name || !["1", "6"].includes(remoteType)) continue;
      const existing = await database.customer.findFirst({ where: { companyId: command.companyId, taxId } });
      const data = {
        name,
        documentType: remoteType === "1" ? "DNI" as const : "RUC" as const,
        email: typeof raw.email === "string" && raw.email.trim() ? raw.email.trim() : existing?.email ?? null,
        phone: typeof raw.telefono === "string" && raw.telefono.trim() ? raw.telefono.trim() : existing?.phone ?? null,
        fiscalAddress: typeof raw.direccion === "string" && raw.direccion.trim() ? raw.direccion.trim() : existing?.fiscalAddress ?? null,
        ubigeo: typeof raw.ubigeo === "string" && raw.ubigeo.trim() ? raw.ubigeo.trim() : existing?.ubigeo ?? null,
        sunatSource: "SUNAT_API",
        sunatCheckedAt: new Date(),
      };
      if (existing) {
        await database.customer.update({ where: { id: existing.id }, data });
        updated += 1;
      } else {
        await database.$transaction(async (tx) => {
          await tx.customer.create({ data: { companyId: command.companyId, code: await nextBusinessCode(tx, command.companyId, "CUSTOMER"), taxId, ...data } });
        });
        created += 1;
      }
    }
    page += 1;
  } while (page <= lastPage && page <= 100);
  await database.$transaction([
    database.auditLog.create({ data: { companyId: command.companyId, userId: command.userId, module: "catalogs", entity: "Customer", entityId: command.companyId, action: "SYNC_SUNAT_CLIENTS", afterData: { created, updated } } }),
    database.outboxEvent.create({ data: { companyId: command.companyId, topic: `private-company-${command.companyId}`, eventName: "catalog.customers-synced.v1", aggregateId: command.companyId, payload: { created, updated } } }),
  ]);
  return { created, updated };
}

async function submitStandalone(client: ElectronicBillingClient, kind: CreateElectronicDocumentInput["kind"], payload: Record<string, unknown>, idempotencyKey: string) {
  switch (kind) {
    case "CREDIT_NOTE": return client.createCreditNote(payload as CreditOrDebitNotePayload, idempotencyKey);
    case "DEBIT_NOTE": return client.createDebitNote(payload as CreditOrDebitNotePayload, idempotencyKey);
    case "SENDER_GUIDE": return client.createSenderGuide(payload, idempotencyKey);
    case "CARRIER_GUIDE": return client.createCarrierGuide(payload, idempotencyKey);
    case "RETENTION": return client.createRetention(payload, idempotencyKey);
    case "PERCEPTION": return client.createPerception(payload, idempotencyKey);
    case "PURCHASE_SETTLEMENT": return client.createPurchaseSettlement(payload, idempotencyKey);
    case "DAILY_SUMMARY": return client.createDailySummary(payload, idempotencyKey);
    case "VOIDED_DOCUMENT": return client.createVoidedDocument(payload, idempotencyKey);
    case "REVERSION": return client.createReversion(payload, idempotencyKey);
  }
}

export async function createStandaloneElectronicDocument(database: PrismaClient, command: {
  companyId: string;
  userId: string;
  input: CreateElectronicDocumentInput;
}) {
  const company = await database.company.findUnique({ where: { id: command.companyId }, select: { taxId: true } });
  if (!company) throw new ElectronicBillingError("COMPANY_NOT_FOUND", "La empresa no existe.", 404, false);
  const { config, client } = billingClient(company.taxId);
  const payload = { ...command.input.payload } as Record<string, unknown>;
  if (seriesTypes[command.input.kind]) {
    const requestedSeries = (typeof payload.serie === "string" ? payload.serie : seriesForKind(config, command.input.kind))?.trim().toUpperCase();
    if (!requestedSeries) {
      throw new ElectronicBillingError("BILLING_SERIES_REQUIRED", "Selecciona una serie activa para este tipo de documento.", 422, false);
    }
    const available = activeSeriesForKind(await client.getSeries(), command.input.kind);
    const selected = available.find((item) => item.serie.toUpperCase() === requestedSeries);
    if (!selected) {
      throw new ElectronicBillingError("BILLING_SERIES_INVALID", `La serie ${requestedSeries} no está activa para este tipo de documento en la plataforma SUNAT.`, 422, false);
    }
    payload.serie = selected.serie;
  }
  payload.enviar_automatico = true;
  const businessKey = `manual:${command.input.kind}:${command.input.operationKey}`;
  const idempotencyKey = `lkinnova:${businessKey}`;
  const local = await database.electronicDocument.upsert({
    where: { companyId_businessKey: { companyId: command.companyId, businessKey } },
    update: {},
    create: {
      companyId: command.companyId,
      createdById: command.userId,
      kind: command.input.kind,
      businessKey,
      idempotencyKey,
      status: "SUBMITTING",
      series: typeof payload.serie === "string" ? payload.serie : null,
    },
  });
  if (local.remoteId) return local;

  try {
    const remote = await submitStandalone(client, command.input.kind, payload, idempotencyKey);
    const fields = documentFields(remote, local.attempts + 1, true);
    return await database.$transaction(async (tx) => {
      const document = await tx.electronicDocument.update({ where: { id: local.id }, data: fields });
      await tx.auditLog.create({ data: {
        companyId: command.companyId, userId: command.userId, module: "electronic-billing",
        entity: "ElectronicDocument", entityId: document.id, action: "SUBMIT",
        afterData: { kind: document.kind, number: document.number, status: document.status },
      } });
      await tx.outboxEvent.create({ data: {
        companyId: command.companyId, topic: `private-company-${command.companyId}`,
        eventName: "electronic-document.submitted.v1", aggregateId: document.id,
        payload: { electronicDocumentId: document.id, kind: document.kind, status: document.status },
      } });
      return document;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1_000) : "Error desconocido al emitir.";
    await database.electronicDocument.update({ where: { id: local.id }, data: { status: "ERROR", lastError: message, attempts: { increment: 1 }, nextCheckAt: null } });
    throw error;
  }
}

export async function voidElectronicSale(database: PrismaClient, command: { companyId: string; userId: string; saleId: string; reason?: string }) {
  const sale = await database.sale.findFirst({
    where: { id: command.saleId, companyId: command.companyId },
    include: { company: { select: { taxId: true } }, payments: { select: { amount: true } }, electronicDocuments: { orderBy: { createdAt: "asc" } } },
  });
  if (!sale) throw new ElectronicBillingError("SALE_NOT_FOUND", "La venta no existe.", 404, false);
  if (sale.status !== "ISSUED") throw new ElectronicBillingError("SALE_INVALID_STATE", "Solo puede anularse una venta emitida.", 422, false);
  if (sale.payments.some((payment) => payment.amount.greaterThan(0))) throw new ElectronicBillingError("SALE_HAS_PAYMENTS", "No se puede anular una venta con pagos registrados.", 422, false);
  const primary = sale.electronicDocuments.find((document) => document.kind === "INVOICE" || document.kind === "RECEIPT");
  if (!primary?.remoteId || !primary.series || !primary.correlativo) throw new ElectronicBillingError("BILLING_DOCUMENT_NOT_READY", "El comprobante electrónico todavía no está listo para anularse.", 422, false);
  if (primary.status !== "ACCEPTED" && primary.status !== "ACCEPTED_WITH_OBSERVATION") throw new ElectronicBillingError("BILLING_DOCUMENT_NOT_ACCEPTED", "SUNAT debe aceptar el comprobante antes de solicitar su anulación.", 422, false);
  const businessKey = `sale:${sale.id}:void`;
  const idempotencyKey = `lkinnova:${businessKey}`;
  const local = await database.electronicDocument.upsert({
    where: { companyId_businessKey: { companyId: command.companyId, businessKey } }, update: {},
    create: { companyId: command.companyId, saleId: sale.id, createdById: command.userId, kind: primary.kind === "INVOICE" ? "VOIDED_DOCUMENT" : "DAILY_SUMMARY", businessKey, idempotencyKey, status: "SUBMITTING" },
  });
  if (local.remoteId) return local;
  const { client } = billingClient(sale.company.taxId);
  const today = new Date().toISOString().slice(0, 10);
  const reason = command.reason?.trim() || "Anulación solicitada por la empresa";
  try {
    const remote = primary.kind === "INVOICE"
      ? await client.createVoidedDocument({ fecha_generacion: today, fecha_comunicacion: today, detalles: [{ tipo_documento: "01", serie: primary.series, correlativo: primary.correlativo, motivo: reason }], enviar_automatico: true }, idempotencyKey)
      : await client.createDailySummary({ fecha_resumen: today, anular: [{ id: Number(primary.remoteId), motivo: reason }], enviar_automatico: true }, idempotencyKey);
    const fields = documentFields(remote, local.attempts + 1, true);
    return database.$transaction(async (tx) => {
      const document = await tx.electronicDocument.update({ where: { id: local.id }, data: fields });
      await tx.sale.update({ where: { id: sale.id }, data: { status: "VOIDED" } });
      await tx.auditLog.create({ data: { companyId: command.companyId, userId: command.userId, module: "sales", entity: "Sale", entityId: sale.id, action: "VOID_ELECTRONIC", afterData: { documentId: document.id, reason, status: document.status } } });
      await tx.outboxEvent.create({ data: { companyId: command.companyId, topic: `private-company-${command.companyId}`, eventName: "electronic-document.submitted.v1", aggregateId: document.id, payload: { electronicDocumentId: document.id, saleId: sale.id, kind: document.kind, status: document.status } } });
      return document;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1_000) : "Error desconocido al solicitar la anulación.";
    await database.electronicDocument.update({ where: { id: local.id }, data: { status: "ERROR", lastError: message, attempts: { increment: 1 }, nextCheckAt: null } });
    throw error;
  }
}

export async function refreshElectronicDocument(database: PrismaClient, companyId: string, documentId: string) {
  const document = await database.electronicDocument.findFirst({
    where: { id: documentId, companyId },
    include: { company: { select: { taxId: true } } },
  });
  if (!document) throw new ElectronicBillingError("BILLING_DOCUMENT_NOT_FOUND", "El comprobante electrónico no existe.", 404, false);
  if (!document.remoteId || isFinalElectronicStatus(document.status)) return document;

  const { client } = billingClient(document.company.taxId);
  const statusEndpoint = ["SENDER_GUIDE", "CARRIER_GUIDE", "DAILY_SUMMARY", "VOIDED_DOCUMENT", "REVERSION"].includes(document.kind);
  const remote = await client.getDocumentStatus(resources[document.kind], document.remoteId, statusEndpoint);
  const fields = documentFields(remote, document.attempts + 1, false, document);
  return database.electronicDocument.update({ where: { id: document.id }, data: fields });
}

export async function resendElectronicDocument(database: PrismaClient, command: {
  companyId: string;
  userId: string;
  documentId: string;
}) {
  const document = await database.electronicDocument.findFirst({
    where: { id: command.documentId, companyId: command.companyId },
    include: { company: { select: { taxId: true } } },
  });
  if (!document) throw new ElectronicBillingError("BILLING_DOCUMENT_NOT_FOUND", "El comprobante electrónico no existe.", 404, false);
  if (!document.remoteId) throw new ElectronicBillingError("BILLING_DOCUMENT_NOT_SENT", "El documento todavía no tiene un identificador remoto para reenviarlo.", 422, false);
  if (!["PENDING", "REJECTED", "ERROR"].includes(document.status)) {
    throw new ElectronicBillingError("BILLING_RESEND_NOT_ALLOWED", "Solo se pueden reenviar documentos pendientes, rechazados o con error.", 422, false);
  }

  const action: "enviar" | "reenviar" = ["INVOICE", "RECEIPT", "CREDIT_NOTE", "DEBIT_NOTE", "PURCHASE_SETTLEMENT"].includes(document.kind)
    ? "reenviar"
    : "enviar";
  const { client } = billingClient(document.company.taxId);
  const attempt = document.attempts + 1;
  const remote = await client.resendDocument(resources[document.kind], document.remoteId, action, `${document.idempotencyKey}:retry:${attempt}`);
  const fields = documentFields(remote, attempt, true, document);

  return database.$transaction(async (tx) => {
    const updated = await tx.electronicDocument.update({ where: { id: document.id }, data: fields });
    await tx.auditLog.create({ data: {
      companyId: command.companyId, userId: command.userId, module: "electronic-billing",
      entity: "ElectronicDocument", entityId: document.id, action: "RESEND",
      afterData: { kind: document.kind, remoteId: document.remoteId, attempt, status: fields.status },
    } });
    await tx.outboxEvent.create({ data: {
      companyId: command.companyId, topic: `private-company-${command.companyId}`,
      eventName: "electronic-document.resent.v1", aggregateId: document.id,
      payload: { electronicDocumentId: document.id, kind: document.kind, status: fields.status, attempt },
    } });
    return updated;
  });
}

export async function reconcileElectronicDocuments(database: PrismaClient, limit = 25) {
  const pending = await database.electronicDocument.findMany({
    where: {
      remoteId: { not: null },
      status: { in: ["PENDING", "SENT", "PROCESSING"] },
      OR: [{ nextCheckAt: null }, { nextCheckAt: { lte: new Date() } }],
    },
    orderBy: { createdAt: "asc" },
    take: Math.min(Math.max(limit, 1), 100),
  });
  const results = [];
  for (const document of pending) {
    try {
      const refreshed = await refreshElectronicDocument(database, document.companyId, document.id);
      results.push({ id: document.id, status: refreshed.status, ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1_000) : "Error desconocido";
      await database.electronicDocument.update({
        where: { id: document.id },
        data: { lastError: message, attempts: { increment: 1 }, nextCheckAt: nextPollingDate(document.attempts + 1) },
      });
      results.push({ id: document.id, status: document.status, ok: false });
    }
  }
  return { examined: pending.length, results };
}

export async function downloadElectronicArtifact(database: PrismaClient, companyId: string, documentId: string, artifact: "pdf" | "xml" | "cdr", format?: string) {
  const document = await database.electronicDocument.findFirst({
    where: { id: documentId, companyId },
    include: { company: { select: { taxId: true } } },
  });
  if (!document?.remoteId) throw new ElectronicBillingError("BILLING_DOCUMENT_NOT_FOUND", "El archivo solicitado todavía no está disponible.", 404, false);
  const { client } = billingClient(document.company.taxId);
  return client.downloadArtifact(resources[document.kind], document.remoteId, artifact, format);
}
