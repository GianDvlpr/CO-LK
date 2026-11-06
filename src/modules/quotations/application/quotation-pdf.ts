import Decimal from "decimal.js";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { sanitizeWinAnsi } from "@/lib/pdf/winansi";
import { quotationTotals } from "@/modules/quotations/domain/quotation-calculations";

const A4: [number, number] = [595.28, 841.89];
const navy = rgb(23 / 255, 56 / 255, 77 / 255);
const light = rgb(232 / 255, 240 / 255, 244 / 255);
const grid = rgb(130 / 255, 146 / 255, 155 / 255);
const white = rgb(1, 1, 1);

type QuotationPdfData = {
  number: string;
  status: string;
  issueDate: Date;
  validUntil: Date;
  promisedAt: Date | null;
  exchangeRate: unknown;
  discountRate: unknown;
  taxRate: unknown;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  notes: string | null;
  company: { name: string; taxId: string | null };
  customer: { code: string; name: string; taxId: string | null; fiscalAddress: string | null };
  currency: { code: string; symbol: string; isBase: boolean };
  lines: { quantity: unknown; unitPrice: unknown; productVariant: { sku: string; product: { name: string }; size: { name: string }; color: { name: string }; secondaryColor: { name: string } | null } }[];
};

const date = new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

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

export async function buildQuotationPdf(record: QuotationPdfData) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const margin = 32;
  const width = A4[0] - margin * 2;
  let page = document.addPage(A4);
  let top = A4[1] - margin;

  const pageHeader = (continuation = false) => {
    cell(page, font, bold, { x: margin, top, width, height: 32, text: `${record.company.name.toUpperCase()}  |  COTIZACIÓN ${record.number}${continuation ? "  |  CONTINUACIÓN" : ""}`, header: true, size: 12 });
    top -= 32;
  };
  const newPage = () => { page = document.addPage(A4); top = A4[1] - margin; pageHeader(true); };
  pageHeader();

  const infoRows: [string, string, string, string][] = [
    ["Cliente", record.customer.name, "Documento", record.customer.taxId ?? "—"],
    ["Código cliente", record.customer.code, "Moneda", `${record.currency.code} (${record.currency.symbol})`],
    ["Fecha emisión", date.format(record.issueDate), "Válida hasta", date.format(record.validUntil)],
    ["Fecha de entrega", record.promisedAt ? date.format(record.promisedAt) : "Por coordinar", "Estado", record.status],
    ["Dirección fiscal", record.customer.fiscalAddress ?? "—", "Tipo de cambio", new Decimal(String(record.exchangeRate)).toFixed(4)],
  ];
  const half = width / 2;
  const labelWidth = 82;
  for (const [l1, v1, l2, v2] of infoRows) {
    cell(page, font, bold, { x: margin, top, width: labelWidth, height: 22, text: l1, label: true, size: 7 });
    cell(page, font, bold, { x: margin + labelWidth, top, width: half - labelWidth, height: 22, text: v1, size: 7.5 });
    cell(page, font, bold, { x: margin + half, top, width: labelWidth, height: 22, text: l2, label: true, size: 7 });
    cell(page, font, bold, { x: margin + half + labelWidth, top, width: half - labelWidth, height: 22, text: v2, size: 7.5 });
    top -= 22;
  }
  top -= 12;

  const columns = [72, 200, 50, 65, width - 387];
  const headings = ["SKU", "Producto / variante", "Cantidad", "P. unitario", "Importe"];
  const drawTableHeader = () => {
    columns.forEach((columnWidth, index) => cell(page, font, bold, { x: margin + columns.slice(0, index).reduce((sum, value) => sum + value, 0), top, width: columnWidth, height: 22, text: headings[index], label: true, align: index >= 2 ? "right" : "left", size: 7 }));
    top -= 22;
  };
  drawTableHeader();
  record.lines.forEach((line) => {
    if (top < 150) { newPage(); drawTableHeader(); }
    const colors = [line.productVariant.color.name, line.productVariant.secondaryColor?.name].filter(Boolean).join(" / ");
    const values = [
      line.productVariant.sku,
      `${line.productVariant.product.name} · Talla ${line.productVariant.size.name} · ${colors}`,
      new Decimal(String(line.quantity)).toFixed(2),
      `${record.currency.symbol} ${new Decimal(String(line.unitPrice)).toFixed(2)}`,
      `${record.currency.symbol} ${new Decimal(String(line.quantity)).mul(String(line.unitPrice)).toFixed(2)}`,
    ];
    columns.forEach((columnWidth, index) => cell(page, font, bold, { x: margin + columns.slice(0, index).reduce((sum, value) => sum + value, 0), top, width: columnWidth, height: 24, text: values[index], align: index >= 2 ? "right" : "left", size: 7 }));
    top -= 24;
  });

  const totals = quotationTotals(record.lines.map((line) => ({ quantity: String(line.quantity), unitPrice: String(line.unitPrice) })), String(record.discountRate), String(record.taxRate), String(record.exchangeRate));
  top -= 10;
  const totalLabelWidth = 110;
  const totalValueWidth = 100;
  const totalX = margin + width - totalLabelWidth - totalValueWidth;
  const totalRows = [
    ["Importe bruto", totals.gross],
    [`Descuento (${new Decimal(String(record.discountRate)).toFixed(2)} %)`, totals.discount.neg()],
    ["Subtotal", totals.subtotal],
    [`IGV (${new Decimal(String(record.taxRate)).toFixed(2)} %)`, totals.tax],
    ["TOTAL", totals.total],
  ] as const;
  totalRows.forEach(([label, value], index) => {
    cell(page, font, bold, { x: totalX, top, width: totalLabelWidth, height: 22, text: label, label: true, align: "right", size: 7.5 });
    cell(page, font, bold, { x: totalX + totalLabelWidth, top, width: totalValueWidth, height: 22, text: `${record.currency.symbol} ${value.toFixed(2)}`, header: index === totalRows.length - 1, align: "right", size: 8 });
    top -= 22;
  });
  if (!record.currency.isBase) {
    cell(page, font, bold, { x: totalX, top, width: totalLabelWidth, height: 22, text: "Equivalente en PEN", label: true, align: "right", size: 7 });
    cell(page, font, bold, { x: totalX + totalLabelWidth, top, width: totalValueWidth, height: 22, text: `S/ ${totals.totalPen.toFixed(2)}`, align: "right", size: 8 });
    top -= 22;
  }
  top -= 12;

  const detailRows = [
    ["Condiciones de pago", record.paymentTerms || "Por coordinar"],
    ["Condiciones de entrega", record.deliveryTerms || "Por coordinar"],
    ["Observaciones", record.notes || "Sin observaciones"],
  ];
  detailRows.forEach(([label, value]) => {
    if (top < 70) newPage();
    cell(page, font, bold, { x: margin, top, width: 112, height: 28, text: label, label: true, size: 7 });
    cell(page, font, bold, { x: margin + 112, top, width: width - 112, height: 28, text: value, size: 7.5 });
    top -= 28;
  });

  document.setTitle(`Cotización ${record.number}`);
  document.setAuthor(record.company.name);
  return document.save();
}
