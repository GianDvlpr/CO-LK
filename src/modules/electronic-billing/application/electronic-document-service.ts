import { Prisma, type PrismaClient } from "@prisma/client";
import { ElectronicBillingError } from "@/modules/electronic-billing/application/errors";
import type { CreateElectronicDocumentInput } from "@/modules/electronic-billing/application/schemas";
import { mapSaleToBillingPayload } from "@/modules/electronic-billing/application/sale-mapper";
import { isFinalElectronicStatus, nextPollingDate, normalizeRemoteStatus, remoteStatusValue } from "@/modules/electronic-billing/domain/status";
import type { CreditOrDebitNotePayload, ElectronicDocumentKind, RemoteDocument, RemoteSeries } from "@/modules/electronic-billing/domain/types";
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
