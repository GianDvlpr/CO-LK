import Decimal from "decimal.js";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { sanitizeWinAnsi } from "@/lib/pdf/winansi";
import { paymentSummary, saleTotals } from "@/modules/sales/domain/sale-calculations";

const A4: [number, number] = [595.28, 841.89];
const navy = rgb(23 / 255, 56 / 255, 77 / 255);
const light = rgb(232 / 255, 240 / 255, 244 / 255);
const grid = rgb(130 / 255, 146 / 255, 155 / 255);
const white = rgb(1, 1, 1);

type SalePdfData = {
  number: string; status: string; paymentStatus: string; documentType: string; documentSeries: string | null; documentNumber: string | null;
  issueDate: Date; dueDate: Date | null; exchangeRate: unknown; discountRate: unknown; taxRate: unknown; paymentMethod: string; notes: string | null;
  company: { name: string; taxId: string | null };
  customer: { code: string; name: string; taxId: string | null; fiscalAddress: string | null };
  currency: { code: string; symbol: string; isBase: boolean };
  salesOrders: { salesOrder: { number: string } }[];
  lines: { quantity: unknown; unitPrice: unknown; productVariant: { sku: string; product: { name: string }; size: { name: string }; color: { name: string }; secondaryColor: { name: string } | null } }[];
  payments: { amount: unknown; paymentDate: Date; method: string; reference: string | null }[];
};

const date = new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const documentLabels: Record<string, string> = { INVOICE: "Factura", RECEIPT: "Boleta", SALE_NOTE: "Nota de venta", OTHER: "Otro" };
const paymentLabels: Record<string, string> = { CASH: "Efectivo", TRANSFER: "Transferencia", CARD: "Tarjeta", CREDIT: "Crédito", OTHER: "Otro" };

function fit(font: PDFFont, text: string, size: number, width: number) {
  const safe = sanitizeWinAnsi(text);
  if (font.widthOfTextAtSize(safe, size) <= width) return safe;
  let value = safe;
  while (value.length > 1 && font.widthOfTextAtSize(`${value}…`, size) > width) value = value.slice(0, -1);
  return `${value}…`;
}

function cell(page: PDFPage, font: PDFFont, bold: PDFFont, input: { x: number; top: number; width: number; height: number; text: string; header?: boolean; label?: boolean; align?: "left" | "right" | "center"; size?: number }) {
  page.drawRectangle({ x: input.x, y: input.top - input.height, width: input.width, height: input.height, color: input.header ? navy : input.label ? light : white, borderColor: grid, borderWidth: 0.55 });
  const selected = input.header || input.label ? bold : font;
  const size = input.size ?? 8;
  const text = fit(selected, input.text, size, input.width - 8);
  const textWidth = selected.widthOfTextAtSize(text, size);
  const x = input.align === "right" ? input.x + input.width - textWidth - 4 : input.align === "center" ? input.x + (input.width - textWidth) / 2 : input.x + 4;
  page.drawText(text, { x, y: input.top - input.height + (input.height - size) / 2 + 1, size, font: selected, color: input.header ? white : navy });
}

export async function buildSalePdf(record: SalePdfData) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const margin = 32;
  const width = A4[0] - margin * 2;
  let page = document.addPage(A4);
  let top = A4[1] - margin;
  const header = (continuation = false) => { cell(page, font, bold, { x: margin, top, width, height: 32, text: `${record.company.name.toUpperCase()}  |  VENTA ${record.number}${continuation ? "  |  CONTINUACIÓN" : ""}`, header: true, size: 12 }); top -= 32; };
  const nextPage = () => { page = document.addPage(A4); top = A4[1] - margin; header(true); };
  header();

  const documentName = `${documentLabels[record.documentType] ?? record.documentType}${record.documentSeries && record.documentNumber ? ` ${record.documentSeries}-${record.documentNumber}` : ""}`;
  const info: [string, string, string, string][] = [
    ["Cliente", record.customer.name, "Documento cliente", record.customer.taxId ?? "—"],
    ["Comprobante", documentName, "Pedidos", record.salesOrders.map((item) => item.salesOrder.number).join(", ")],
    ["Fecha emisión", date.format(record.issueDate), "Vencimiento", record.dueDate ? date.format(record.dueDate) : "—"],
    ["Moneda", `${record.currency.code} (${record.currency.symbol})`, "Forma de pago", paymentLabels[record.paymentMethod] ?? record.paymentMethod],
    ["Estado", record.status, "Estado de pago", record.paymentStatus],
    ["Dirección", record.customer.fiscalAddress ?? "—", "Tipo de cambio", new Decimal(String(record.exchangeRate)).toFixed(4)],
  ];
  const half = width / 2;
  const labelWidth = 82;
  info.forEach(([leftLabel, leftValue, rightLabel, rightValue]) => {
    cell(page, font, bold, { x: margin, top, width: labelWidth, height: 22, text: leftLabel, label: true, size: 7 });
    cell(page, font, bold, { x: margin + labelWidth, top, width: half - labelWidth, height: 22, text: leftValue, size: 7.5 });
    cell(page, font, bold, { x: margin + half, top, width: labelWidth, height: 22, text: rightLabel, label: true, size: 7 });
    cell(page, font, bold, { x: margin + half + labelWidth, top, width: half - labelWidth, height: 22, text: rightValue, size: 7.5 });
    top -= 22;
  });
  top -= 12;

  const columns = [72, 200, 50, 65, width - 387];
  const titles = ["SKU", "Producto / variante", "Cantidad", "P. unitario", "Importe"];
  const tableHeader = () => { columns.forEach((columnWidth, index) => cell(page, font, bold, { x: margin + columns.slice(0, index).reduce((sum, value) => sum + value, 0), top, width: columnWidth, height: 22, text: titles[index], label: true, align: index >= 2 ? "right" : "left", size: 7 })); top -= 22; };
  tableHeader();
  record.lines.forEach((line) => {
    if (top < 170) { nextPage(); tableHeader(); }
    const colors = [line.productVariant.color.name, line.productVariant.secondaryColor?.name].filter(Boolean).join(" / ");
    const values = [line.productVariant.sku, `${line.productVariant.product.name} · Talla ${line.productVariant.size.name} · ${colors}`, new Decimal(String(line.quantity)).toFixed(2), `${record.currency.symbol} ${new Decimal(String(line.unitPrice)).toFixed(2)}`, `${record.currency.symbol} ${new Decimal(String(line.quantity)).mul(String(line.unitPrice)).toFixed(2)}`];
    columns.forEach((columnWidth, index) => cell(page, font, bold, { x: margin + columns.slice(0, index).reduce((sum, value) => sum + value, 0), top, width: columnWidth, height: 24, text: values[index], align: index >= 2 ? "right" : "left", size: 7 }));
    top -= 24;
  });

  const totals = saleTotals(record.lines.map((line) => ({ quantity: String(line.quantity), unitPrice: String(line.unitPrice) })), String(record.discountRate), String(record.taxRate), String(record.exchangeRate));
  const paid = paymentSummary(totals.total, record.payments.map((payment) => ({ amount: String(payment.amount) })));
  top -= 10;
  const totalX = margin + width - 210;
  const totalRows = [["Importe bruto", totals.gross], [`Descuento (${new Decimal(String(record.discountRate)).toFixed(2)} %)`, totals.discount.neg()], ["Subtotal", totals.subtotal], [`IGV (${new Decimal(String(record.taxRate)).toFixed(2)} %)`, totals.tax], ["TOTAL", totals.total], ["Pagado", paid.paid], ["Saldo pendiente", paid.balance]] as const;
  totalRows.forEach(([label, value], index) => { cell(page, font, bold, { x: totalX, top, width: 110, height: 22, text: label, label: true, align: "right", size: 7.5 }); cell(page, font, bold, { x: totalX + 110, top, width: 100, height: 22, text: `${record.currency.symbol} ${value.toFixed(2)}`, header: index === 4, align: "right", size: 8 }); top -= 22; });
  top -= 10;
  if (record.payments.length) {
    cell(page, font, bold, { x: margin, top, width, height: 20, text: "PAGOS REGISTRADOS", header: true, size: 8 }); top -= 20;
    record.payments.forEach((payment) => { if (top < 70) nextPage(); const value = `${date.format(payment.paymentDate)} · ${paymentLabels[payment.method] ?? payment.method} · ${record.currency.symbol} ${new Decimal(String(payment.amount)).toFixed(2)}${payment.reference ? ` · Ref. ${payment.reference}` : ""}`; cell(page, font, bold, { x: margin, top, width, height: 22, text: value, size: 7.5 }); top -= 22; });
  }
  top -= 8;
  cell(page, font, bold, { x: margin, top, width: 100, height: 28, text: "Observaciones", label: true, size: 7 });
  cell(page, font, bold, { x: margin + 100, top, width: width - 100, height: 28, text: record.notes || "Sin observaciones", size: 7.5 });

  document.setTitle(`Venta ${record.number}`);
  document.setAuthor(record.company.name);
  return document.save();
}
