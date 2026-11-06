import Decimal from "decimal.js";
import { Prisma, type PrismaClient, type SaleDocumentType, type SalePaymentMethod } from "@prisma/client";
import { nextBusinessCode } from "@/lib/database/business-code";
import { paymentSummary, saleTotals } from "@/modules/sales/domain/sale-calculations";

export class SaleError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "SaleError";
  }
}

export type SaleInput = {
  salesOrderIds: string[];
  currencyId: string;
  documentType: SaleDocumentType;
  documentSeries?: string;
  documentNumber?: string;
  issueDate: Date;
  dueDate?: Date;
  exchangeRate: Decimal.Value;
  discountRate: Decimal.Value;
  paymentMethod: SalePaymentMethod;
  notes?: string;
  lines: { productVariantId: string; unitPrice: Decimal.Value }[];
};

function validate(input: SaleInput) {
  if (!input.salesOrderIds.length || new Set(input.salesOrderIds).size !== input.salesOrderIds.length) throw new SaleError("SALE_INVALID_ORDERS", "Selecciona al menos un pedido despachado sin repetirlo.");
  if (!input.lines.length || new Set(input.lines.map((line) => line.productVariantId)).size !== input.lines.length) throw new SaleError("SALE_INVALID_LINES", "La venta requiere precios para cada variante despachada.");
  if (input.dueDate && input.dueDate < input.issueDate) throw new SaleError("SALE_INVALID_DATES", "El vencimiento no puede ser anterior a la emisión.");
  if (Boolean(input.documentSeries) !== Boolean(input.documentNumber)) throw new SaleError("SALE_INVALID_DOCUMENT", "La serie y el número del documento deben completarse juntos.");
  const discount = new Decimal(input.discountRate);
  if (discount.isNegative() || discount.greaterThan(100)) throw new SaleError("SALE_INVALID_DISCOUNT", "El descuento debe estar entre 0 y 100 %.");
  if (!new Decimal(input.exchangeRate).greaterThan(0)) throw new SaleError("SALE_INVALID_EXCHANGE_RATE", "El tipo de cambio debe ser mayor que cero.");
  if (input.lines.some((line) => new Decimal(line.unitPrice).isNegative())) throw new SaleError("SALE_INVALID_LINES", "Los precios no pueden ser negativos.");
}

async function sourceData(tx: Prisma.TransactionClient, companyId: string, input: SaleInput, currentSaleId?: string) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM sales_orders WHERE id IN (${Prisma.join(input.salesOrderIds)}) FOR UPDATE`);
  const [orders, currency, company] = await Promise.all([
    tx.salesOrder.findMany({
      where: { id: { in: input.salesOrderIds }, companyId },
      include: { saleLinks: true, pickPackOrder: { include: { lines: { include: { salesOrderLine: { select: { productVariantId: true } } } } } } },
    }),
    tx.currency.findFirst({ where: { id: input.currencyId, companyId } }),
    tx.company.findUnique({ where: { id: companyId }, select: { igvRate: true } }),
  ]);
  if (orders.length !== input.salesOrderIds.length || !currency || !company) throw new SaleError("SALE_INVALID_REFERENCE", "Algún pedido o la moneda no es válida.");
  if (orders.some((order) => order.status !== "DISPATCHED" || order.pickPackOrder?.status !== "DISPATCHED")) throw new SaleError("SALE_ORDER_NOT_DISPATCHED", "Solo pueden venderse pedidos que completaron el despacho.");
  if (orders.some((order) => order.saleLinks.some((link) => link.saleId !== currentSaleId))) throw new SaleError("SALE_ORDER_ALREADY_USED", "Algún pedido ya pertenece a otra venta.");
  const customerIds = new Set(orders.map((order) => order.customerId));
  if (customerIds.size !== 1) throw new SaleError("SALE_DIFFERENT_CUSTOMERS", "Todos los pedidos de una venta deben pertenecer al mismo cliente.");

  const quantities = new Map<string, Decimal>();
  for (const order of orders) for (const line of order.pickPackOrder?.lines ?? []) {
    const variantId = line.salesOrderLine.productVariantId;
    quantities.set(variantId, (quantities.get(variantId) ?? new Decimal(0)).add(line.packedQuantity.toString()));
  }
  const prices = new Map(input.lines.map((line) => [line.productVariantId, new Decimal(line.unitPrice)]));
  if (quantities.size !== prices.size || [...quantities.keys()].some((id) => !prices.has(id))) throw new SaleError("SALE_INVALID_LINES", "Los productos de la venta deben coincidir con lo realmente despachado.");
  if ([...quantities.values()].some((quantity) => !quantity.greaterThan(0))) throw new SaleError("SALE_INVALID_LINES", "La venta no puede incluir cantidades despachadas en cero.");
  const lines = [...quantities.entries()].map(([productVariantId, quantity]) => ({ productVariantId, quantity, unitPrice: prices.get(productVariantId)! }));
  return { orders, customerId: orders[0].customerId, currency, taxRate: company.igvRate, lines };
}

async function register(tx: Prisma.TransactionClient, companyId: string, userId: string, saleId: string, action: string, status: string, extra: Prisma.InputJsonObject = {}) {
  await tx.auditLog.create({ data: { companyId, userId, module: "sales", entity: "Sale", entityId: saleId, action, afterData: { status, ...extra } } });
  await tx.outboxEvent.create({ data: { companyId, topic: `private-company-${companyId}`, eventName: `sale.${action.toLowerCase()}.v1`, aggregateId: saleId, payload: { saleId, status, ...extra } } });
}

export async function createSale(database: PrismaClient, command: SaleInput & { companyId: string; userId: string }) {
  validate(command);
  return database.$transaction(async (tx) => {
    const source = await sourceData(tx, command.companyId, command);
    const number = await nextBusinessCode(tx, command.companyId, "SALE", command.issueDate);
    const sale = await tx.sale.create({ data: {
      companyId: command.companyId, customerId: source.customerId, currencyId: command.currencyId, number,
      documentType: command.documentType, documentSeries: command.documentSeries?.toUpperCase(), documentNumber: command.documentNumber,
      issueDate: command.issueDate, dueDate: command.dueDate, exchangeRate: source.currency.isBase ? 1 : new Decimal(command.exchangeRate),
      discountRate: new Decimal(command.discountRate), taxRate: source.taxRate, paymentMethod: command.paymentMethod, notes: command.notes,
      salesOrders: { create: command.salesOrderIds.map((salesOrderId) => ({ salesOrderId })) },
      lines: { create: source.lines },
    }, include: { lines: true } });
    await register(tx, command.companyId, command.userId, sale.id, "CREATE", "DRAFT", { number, salesOrderIds: command.salesOrderIds });
    return sale;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function updateSale(database: PrismaClient, command: SaleInput & { companyId: string; userId: string; saleId: string }) {
  validate(command);
  return database.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM sales WHERE id = ${command.saleId}::uuid FOR UPDATE`;
    const current = await tx.sale.findFirst({ where: { id: command.saleId, companyId: command.companyId } });
    if (!current) throw new SaleError("SALE_NOT_FOUND", "La venta no existe.");
    if (current.status !== "DRAFT") throw new SaleError("SALE_INVALID_STATE", "Solo se puede editar una venta en borrador.");
    const source = await sourceData(tx, command.companyId, command, current.id);
    await tx.saleLine.deleteMany({ where: { saleId: current.id } });
    await tx.saleSalesOrder.deleteMany({ where: { saleId: current.id } });
    const sale = await tx.sale.update({ where: { id: current.id }, data: {
      customerId: source.customerId, currencyId: command.currencyId, documentType: command.documentType,
      documentSeries: command.documentSeries?.toUpperCase() ?? null, documentNumber: command.documentNumber ?? null,
      issueDate: command.issueDate, dueDate: command.dueDate ?? null, exchangeRate: source.currency.isBase ? 1 : new Decimal(command.exchangeRate),
      discountRate: new Decimal(command.discountRate), taxRate: source.taxRate, paymentMethod: command.paymentMethod, notes: command.notes ?? null,
      salesOrders: { create: command.salesOrderIds.map((salesOrderId) => ({ salesOrderId })) }, lines: { create: source.lines },
    }, include: { lines: true } });
    await register(tx, command.companyId, command.userId, sale.id, "UPDATE", sale.status);
    return sale;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function issueSale(database: PrismaClient, command: { companyId: string; userId: string; saleId: string }) {
  return database.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM sales WHERE id = ${command.saleId}::uuid FOR UPDATE`;
    const sale = await tx.sale.findFirst({ where: { id: command.saleId, companyId: command.companyId }, include: { salesOrders: { include: { salesOrder: true } }, lines: true } });
    if (!sale) throw new SaleError("SALE_NOT_FOUND", "La venta no existe.");
    if (sale.status !== "DRAFT") throw new SaleError("SALE_INVALID_STATE", "Solo puede emitirse una venta en borrador.");
    if (!sale.documentSeries || !sale.documentNumber) throw new SaleError("SALE_DOCUMENT_REQUIRED", "Completa la serie y el número del documento antes de emitir.");
    if (sale.salesOrders.some((link) => link.salesOrder.status !== "DISPATCHED")) throw new SaleError("SALE_ORDER_NOT_DISPATCHED", "Todos los pedidos deben seguir despachados.");
    if (!saleTotals(sale.lines, sale.discountRate.toString(), sale.taxRate.toString(), sale.exchangeRate.toString()).total.greaterThan(0)) throw new SaleError("SALE_ZERO_TOTAL", "La venta debe tener un total mayor que cero antes de emitir.");
    const updated = await tx.sale.update({ where: { id: sale.id }, data: { status: "ISSUED" } });
    await register(tx, command.companyId, command.userId, sale.id, "ISSUE", updated.status, { document: `${sale.documentSeries}-${sale.documentNumber}` });
    return updated;
  });
}

export async function voidSale(database: PrismaClient, command: { companyId: string; userId: string; saleId: string }) {
  return database.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM sales WHERE id = ${command.saleId}::uuid FOR UPDATE`;
    const sale = await tx.sale.findFirst({ where: { id: command.saleId, companyId: command.companyId }, include: { payments: { select: { amount: true } } } });
    if (!sale) throw new SaleError("SALE_NOT_FOUND", "La venta no existe.");
    if (sale.status !== "ISSUED") throw new SaleError("SALE_INVALID_STATE", "Solo puede anularse una venta emitida.");
    if (sale.payments.some((payment) => new Decimal(payment.amount.toString()).greaterThan(0))) throw new SaleError("SALE_HAS_PAYMENTS", "No se puede anular una venta con pagos registrados.");
    const updated = await tx.sale.update({ where: { id: sale.id }, data: { status: "VOIDED" } });
    await register(tx, command.companyId, command.userId, sale.id, "VOID", updated.status);
    return updated;
  });
}

export async function addSalePayment(database: PrismaClient, command: { companyId: string; userId: string; saleId: string; amount: Decimal.Value; paymentDate: Date; method: SalePaymentMethod; reference?: string; notes?: string }) {
  const amount = new Decimal(command.amount);
  if (!amount.greaterThan(0)) throw new SaleError("SALE_INVALID_PAYMENT", "El pago debe ser mayor que cero.");
  return database.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM sales WHERE id = ${command.saleId}::uuid FOR UPDATE`;
    const sale = await tx.sale.findFirst({ where: { id: command.saleId, companyId: command.companyId }, include: { lines: true, payments: { select: { amount: true } } } });
    if (!sale) throw new SaleError("SALE_NOT_FOUND", "La venta no existe.");
    if (sale.status !== "ISSUED") throw new SaleError("SALE_INVALID_STATE", "Los pagos solo pueden registrarse en una venta emitida.");
    const totals = saleTotals(sale.lines, sale.discountRate.toString(), sale.taxRate.toString(), sale.exchangeRate.toString());
    const before = paymentSummary(totals.total, sale.payments);
    if (amount.greaterThan(before.balance)) throw new SaleError("SALE_PAYMENT_EXCEEDS_BALANCE", "El pago supera el saldo pendiente.");
    const payment = await tx.salePayment.create({ data: { saleId: sale.id, amount, paymentDate: command.paymentDate, method: command.method, reference: command.reference, notes: command.notes, createdById: command.userId } });
    const after = paymentSummary(totals.total, [...sale.payments, { amount }]);
    await tx.sale.update({ where: { id: sale.id }, data: { paymentStatus: after.status } });
    await register(tx, command.companyId, command.userId, sale.id, "PAYMENT", sale.status, { paymentId: payment.id, amount: amount.toString(), paymentStatus: after.status });
    return { payment, paymentStatus: after.status, paid: after.paid.toString(), balance: after.balance.toString() };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
