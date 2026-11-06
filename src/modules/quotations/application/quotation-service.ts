import Decimal from "decimal.js";
import { Prisma, type PrismaClient, type QuotationStatus } from "@prisma/client";
import { nextBusinessCode } from "@/lib/database/business-code";
import { effectiveQuotationStatus } from "@/modules/quotations/domain/quotation-calculations";

export class QuotationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "QuotationError";
  }
}

export type QuotationInput = {
  customerId: string;
  currencyId: string;
  issueDate: Date;
  validUntil: Date;
  promisedAt?: Date;
  exchangeRate: Decimal.Value;
  discountRate: Decimal.Value;
  paymentTerms?: string;
  deliveryTerms?: string;
  notes?: string;
  lines: { productVariantId: string; quantity: Decimal.Value; unitPrice: Decimal.Value }[];
};

function validate(input: QuotationInput) {
  if (!input.lines.length || new Set(input.lines.map((line) => line.productVariantId)).size !== input.lines.length) {
    throw new QuotationError("QUOTATION_INVALID_LINES", "La cotización requiere variantes únicas.");
  }
  if (input.validUntil < input.issueDate) throw new QuotationError("QUOTATION_INVALID_DATES", "La vigencia no puede terminar antes de la fecha de emisión.");
  const discount = new Decimal(input.discountRate);
  if (discount.isNegative() || discount.greaterThan(100)) throw new QuotationError("QUOTATION_INVALID_DISCOUNT", "El descuento debe estar entre 0 y 100 %.");
  if (!new Decimal(input.exchangeRate).greaterThan(0)) throw new QuotationError("QUOTATION_INVALID_EXCHANGE_RATE", "El tipo de cambio debe ser mayor que cero.");
  for (const line of input.lines) {
    if (!new Decimal(line.quantity).greaterThan(0) || new Decimal(line.unitPrice).isNegative()) {
      throw new QuotationError("QUOTATION_INVALID_LINES", "Las cantidades deben ser positivas y los precios no pueden ser negativos.");
    }
  }
}

async function references(tx: Prisma.TransactionClient, companyId: string, input: QuotationInput) {
  const [customer, currency, variants, company] = await Promise.all([
    tx.customer.findFirst({ where: { id: input.customerId, companyId, active: true } }),
    tx.currency.findFirst({ where: { id: input.currencyId, companyId } }),
    tx.productVariant.findMany({ where: { id: { in: input.lines.map((line) => line.productVariantId) }, active: true, product: { companyId, active: true } } }),
    tx.company.findUnique({ where: { id: companyId }, select: { igvRate: true } }),
  ]);
  if (!customer || !currency || variants.length !== input.lines.length || !company) {
    throw new QuotationError("QUOTATION_INVALID_REFERENCE", "El cliente, la moneda o alguna variante no es válida.");
  }
  return { customer, currency, taxRate: company.igvRate };
}

async function register(tx: Prisma.TransactionClient, companyId: string, userId: string, quotationId: string, action: string, status: string, extra: Prisma.InputJsonObject = {}) {
  await tx.auditLog.create({ data: { companyId, userId, module: "quotations", entity: "Quotation", entityId: quotationId, action, afterData: { status, ...extra } } });
  await tx.outboxEvent.create({ data: { companyId, topic: `private-company-${companyId}`, eventName: `quotation.${action.toLowerCase()}.v1`, aggregateId: quotationId, payload: { quotationId, status, ...extra } } });
}

export async function createQuotation(database: PrismaClient, command: QuotationInput & { companyId: string; userId: string }) {
  validate(command);
  return database.$transaction(async (tx) => {
    const { currency, taxRate } = await references(tx, command.companyId, command);
    const number = await nextBusinessCode(tx, command.companyId, "QUOTATION", command.issueDate);
    const quotation = await tx.quotation.create({
      data: {
        companyId: command.companyId,
        customerId: command.customerId,
        currencyId: command.currencyId,
        number,
        issueDate: command.issueDate,
        validUntil: command.validUntil,
        promisedAt: command.promisedAt,
        exchangeRate: currency.isBase ? new Decimal(1) : new Decimal(command.exchangeRate),
        discountRate: new Decimal(command.discountRate),
        taxRate,
        paymentTerms: command.paymentTerms,
        deliveryTerms: command.deliveryTerms,
        notes: command.notes,
        lines: { create: command.lines.map((line) => ({ productVariantId: line.productVariantId, quantity: new Decimal(line.quantity), unitPrice: new Decimal(line.unitPrice) })) },
      },
      include: { lines: true },
    });
    await register(tx, command.companyId, command.userId, quotation.id, "CREATE", "DRAFT", { number });
    return quotation;
  });
}

export async function updateQuotation(database: PrismaClient, command: QuotationInput & { companyId: string; userId: string; quotationId: string }) {
  validate(command);
  return database.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM quotations WHERE id = ${command.quotationId}::uuid FOR UPDATE`;
    const current = await tx.quotation.findFirst({ where: { id: command.quotationId, companyId: command.companyId } });
    if (!current) throw new QuotationError("QUOTATION_NOT_FOUND", "La cotización no existe.");
    if (effectiveQuotationStatus(current.status, current.validUntil) !== "DRAFT") throw new QuotationError("QUOTATION_INVALID_STATE", "Solo se puede editar una cotización vigente en borrador.");
    const { currency, taxRate } = await references(tx, command.companyId, command);
    await tx.quotationLine.deleteMany({ where: { quotationId: current.id } });
    const updated = await tx.quotation.update({
      where: { id: current.id },
      data: {
        customerId: command.customerId,
        currencyId: command.currencyId,
        issueDate: command.issueDate,
        validUntil: command.validUntil,
        promisedAt: command.promisedAt ?? null,
        exchangeRate: currency.isBase ? new Decimal(1) : new Decimal(command.exchangeRate),
        discountRate: new Decimal(command.discountRate),
        taxRate,
        paymentTerms: command.paymentTerms ?? null,
        deliveryTerms: command.deliveryTerms ?? null,
        notes: command.notes ?? null,
        lines: { create: command.lines.map((line) => ({ productVariantId: line.productVariantId, quantity: new Decimal(line.quantity), unitPrice: new Decimal(line.unitPrice) })) },
      },
      include: { lines: true },
    });
    await register(tx, command.companyId, command.userId, updated.id, "UPDATE", updated.status);
    return updated;
  });
}

const transitions: Record<"send" | "approve" | "reject", { from: QuotationStatus[]; to: QuotationStatus; action: string }> = {
  send: { from: ["DRAFT"], to: "SENT", action: "SEND" },
  approve: { from: ["DRAFT", "SENT"], to: "APPROVED", action: "APPROVE" },
  reject: { from: ["DRAFT", "SENT"], to: "REJECTED", action: "REJECT" },
};

export async function transitionQuotation(database: PrismaClient, command: { companyId: string; userId: string; quotationId: string; transition: keyof typeof transitions }) {
  return database.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM quotations WHERE id = ${command.quotationId}::uuid FOR UPDATE`;
    const current = await tx.quotation.findFirst({ where: { id: command.quotationId, companyId: command.companyId } });
    if (!current) throw new QuotationError("QUOTATION_NOT_FOUND", "La cotización no existe.");
    const effective = effectiveQuotationStatus(current.status, current.validUntil);
    if (effective === "EXPIRED") {
      throw new QuotationError("QUOTATION_EXPIRED", "La cotización está vencida.");
    }
    const transition = transitions[command.transition];
    if (!transition.from.includes(current.status)) throw new QuotationError("QUOTATION_INVALID_STATE", "La cotización no admite esta acción en su estado actual.");
    const updated = await tx.quotation.update({ where: { id: current.id }, data: { status: transition.to } });
    await register(tx, command.companyId, command.userId, updated.id, transition.action, updated.status);
    return updated;
  });
}

export async function convertQuotationToOrder(database: PrismaClient, command: { companyId: string; userId: string; quotationId: string }) {
  return database.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM quotations WHERE id = ${command.quotationId}::uuid FOR UPDATE`;
    const quotation = await tx.quotation.findFirst({ where: { id: command.quotationId, companyId: command.companyId }, include: { lines: { include: { productVariant: { select: { active: true, product: { select: { active: true } } } } } } } });
    if (!quotation) throw new QuotationError("QUOTATION_NOT_FOUND", "La cotización no existe.");
    if (quotation.status !== "APPROVED" || quotation.salesOrderId) throw new QuotationError("QUOTATION_INVALID_STATE", "Solo una cotización aprobada y no convertida puede generar un pedido.");
    if (quotation.lines.some((line) => !line.productVariant.active || !line.productVariant.product.active)) throw new QuotationError("QUOTATION_INVALID_REFERENCE", "Algún producto de la cotización ya no está activo.");
    const requestedAt = new Date();
    const number = await nextBusinessCode(tx, command.companyId, "SALES_ORDER", requestedAt);
    const factor = new Decimal(1).sub(new Decimal(quotation.discountRate.toString()).div(100));
    const order = await tx.salesOrder.create({
      data: {
        companyId: command.companyId,
        customerId: quotation.customerId,
        number,
        requestedAt,
        promisedAt: quotation.promisedAt,
        notes: [`Generado desde ${quotation.number}.`, quotation.notes].filter(Boolean).join(" "),
        lines: { create: quotation.lines.map((line) => ({ productVariantId: line.productVariantId, quantity: line.quantity, unitPrice: new Decimal(line.unitPrice.toString()).mul(quotation.exchangeRate.toString()).mul(factor).toDecimalPlaces(4) })) },
      },
    });
    await tx.quotation.update({ where: { id: quotation.id }, data: { status: "CONVERTED", salesOrderId: order.id } });
    await tx.auditLog.create({ data: { companyId: command.companyId, userId: command.userId, module: "orders", entity: "SalesOrder", entityId: order.id, action: "CREATE", afterData: { status: "DRAFT", number, sourceQuotation: quotation.number } } });
    await tx.outboxEvent.create({ data: { companyId: command.companyId, topic: `private-company-${command.companyId}`, eventName: "order.create.v1", aggregateId: order.id, payload: { salesOrderId: order.id, status: "DRAFT", sourceQuotationId: quotation.id } } });
    await register(tx, command.companyId, command.userId, quotation.id, "CONVERT", "CONVERTED", { salesOrderId: order.id, salesOrderNumber: number });
    return { quotationId: quotation.id, salesOrderId: order.id, salesOrderNumber: number };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
