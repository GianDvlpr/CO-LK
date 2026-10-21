import Decimal from "decimal.js";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const A5_LANDSCAPE: [number, number] = [595.28, 419.53];
const navy = rgb(23 / 255, 56 / 255, 77 / 255);
const light = rgb(232 / 255, 240 / 255, 244 / 255);
const white = rgb(1, 1, 1);
const grid = rgb(113 / 255, 135 / 255, 149 / 255);
const muted = rgb(82 / 255, 100 / 255, 109 / 255);

export type PickPackDocumentData = {
  number: string;
  status: string;
  priority: string;
  carrier: string | null;
  shippingDocument: string | null;
  notes: string | null;
  createdAt: Date;
  warehouse: { code: string; name: string };
  salesOrder: { number: string; requestedAt: Date; promisedAt: Date | null; customer: { name: string } };
  lines: {
    id: string;
    warehouseLocation: string | null;
    lotCode: string | null;
    requestedQuantity: unknown;
    pickedQuantity: unknown;
    packedQuantity: unknown;
    incidentType: string | null;
    incidentReason: string | null;
    notes: string | null;
    salesOrderLine: { productVariant: { sku: string; product: { name: string }; size: { name: string }; color: { name: string } } };
  }[];
  packages: { id: string; packageNumber: number; packageType: string | null; weight: unknown; length: unknown; width: unknown; height: unknown; notes: string | null }[];
};

const date = new Intl.DateTimeFormat("es-PE", { dateStyle: "short" });

function fitText(font: PDFFont, text: string, size: number, maxWidth: number) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let value = text;
  while (value.length > 1 && font.widthOfTextAtSize(`${value}…`, size) > maxWidth) value = value.slice(0, -1);
  return `${value}…`;
}

function cell(page: PDFPage, font: PDFFont, bold: PDFFont, inputValue: { x: number; top: number; width: number; height: number; text?: string; label?: boolean; dark?: boolean; center?: boolean; size?: number }) {
  const { x, top, width, height } = inputValue;
  page.drawRectangle({ x, y: top - height, width, height, color: inputValue.dark ? navy : inputValue.label ? light : white, borderColor: grid, borderWidth: 0.55 });
  const selectedFont = inputValue.label || inputValue.dark ? bold : font;
  const size = inputValue.size ?? 6.2;
  const text = fitText(selectedFont, inputValue.text ?? "", size, width - 5);
  const textWidth = selectedFont.widthOfTextAtSize(text, size);
  page.drawText(text, { x: inputValue.center ? x + Math.max(2.5, (width - textWidth) / 2) : x + 2.5, y: top - height + (height - size) / 2 + 1, size, font: selectedFont, color: inputValue.dark ? white : navy });
}

function section(page: PDFPage, bold: PDFFont, top: number, text: string, left: number, width: number) {
  cell(page, bold, bold, { x: left, top, width, height: 14, text, dark: true, size: 6.6 });
  return top - 14;
}

const products = [
  { label: "SKU", width: 62 },
  { label: "Producto", width: 118 },
  { label: "Talla", width: 26 },
  { label: "Color", width: 38 },
  { label: "Ubicación", width: 44 },
  { label: "Lote", width: 40 },
  { label: "Solic.", width: 26 },
  { label: "Recog.", width: 26 },
  { label: "Empac.", width: 26 },
  { label: "Incidencia / observación", width: 0 },
];
const rowHeight = 12.5;
const firstPageRows = 8;
const continuationRows = 14;

export async function buildPickPackPdf(record: PickPackDocumentData) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const [pageWidth, pageHeight] = A5_LANDSCAPE;
  const margin = 12;
  const width = pageWidth - margin * 2;
  let page = document.addPage(A5_LANDSCAPE);
  let top = pageHeight - margin;

  const productWidth = width - products.slice(0, -1).reduce((sum, column) => sum + column.width, 0);
  const widths = products.map((column) => (column.width || productWidth));
  const drawHeader = (text: string) => {
    cell(page, font, bold, { x: margin, top, width, height: 20, text, dark: true, size: 8 });
    top -= 20;
  };
  const drawProductHeader = () => {
    widths.forEach((columnWidth, index) => {
      const x = margin + widths.slice(0, index).reduce((sum, value) => sum + value, 0);
      cell(page, font, bold, { x, top, width: columnWidth, height: 14, text: products[index].label, label: true, center: index >= 2 && index <= 8, size: 5.3 });
    });
    top -= 14;
  };
  const drawProductsPage = (title: string) => {
    page = document.addPage(A5_LANDSCAPE);
    top = pageHeight - margin;
    drawHeader(title);
    top = section(page, bold, top, "PRODUCTOS", margin, width);
    drawProductHeader();
  };

  drawHeader(`LK INNOVACION DE SUELAS PARA CALZADO  |  ORDEN DE PICK & PACK  |  ${record.number}`);

  const half = width / 2;
  const labelWidth = 78;
  const info: [string, string, string, string][] = [
    ["Pedido", record.salesOrder.number, "Cliente", record.salesOrder.customer.name],
    ["Fecha pedido", date.format(record.salesOrder.requestedAt), "Fecha prometida", record.salesOrder.promisedAt ? date.format(record.salesOrder.promisedAt) : "—"],
    ["Almacén", `${record.warehouse.code} · ${record.warehouse.name}`, "Prioridad", record.priority === "URGENT" ? "URGENTE" : "NORMAL"],
    ["Transportista", record.carrier ?? "—", "Documento / guía", record.shippingDocument ?? "—"],
    ["Estado", record.status, "Fecha emisión", date.format(record.createdAt)],
  ];
  info.forEach(([leftLabel, leftValue, rightLabel, rightValue]) => {
    cell(page, font, bold, { x: margin, top, width: labelWidth, height: 14, text: leftLabel, label: true, size: 5.8 });
    cell(page, font, bold, { x: margin + labelWidth, top, width: half - labelWidth, height: 14, text: leftValue, size: 6.2 });
    cell(page, font, bold, { x: margin + half, top, width: labelWidth, height: 14, text: rightLabel, label: true, size: 5.8 });
    cell(page, font, bold, { x: margin + half + labelWidth, top, width: half - labelWidth, height: 14, text: rightValue, size: 6.2 });
    top -= 14;
  });
  top -= 4;

  top = section(page, bold, top, "PRODUCTOS", margin, width);
  drawProductHeader();

  const drawLine = (line: PickPackDocumentData["lines"][number]) => {
    const variant = line.salesOrderLine.productVariant;
    const values = [
      variant.sku,
      variant.product.name,
      variant.size.name,
      variant.color.name,
      line.warehouseLocation ?? "",
      line.lotCode ?? "",
      new Decimal(String(line.requestedQuantity)).toFixed(0),
      new Decimal(String(line.pickedQuantity)).toFixed(0),
      new Decimal(String(line.packedQuantity)).toFixed(0),
      [line.incidentType, line.incidentReason, line.notes].filter(Boolean).join(" · "),
    ];
    values.forEach((value, index) => {
      const x = margin + widths.slice(0, index).reduce((sum, current) => sum + current, 0);
      cell(page, font, bold, { x, top, width: widths[index], height: rowHeight, text: value, center: index >= 2 && index <= 8, size: 5.4 });
    });
    top -= rowHeight;
  };

  let index = 0;
  record.lines.slice(0, firstPageRows).forEach(drawLine);
  index = Math.min(record.lines.length, firstPageRows);
  while (index < record.lines.length) {
    drawProductsPage(`ORDEN DE PICK & PACK ${record.number}  |  CONTINUACIÓN`);
    const chunk = record.lines.slice(index, index + continuationRows);
    chunk.forEach(drawLine);
    index += chunk.length;
  }

  const totalRequested = record.lines.reduce((sum, line) => sum.add(String(line.requestedQuantity)), new Decimal(0));
  const totalPacked = record.lines.reduce((sum, line) => sum.add(String(line.packedQuantity)), new Decimal(0));
  cell(page, font, bold, { x: margin, top, width: widths[0] + widths[1] + widths[2] + widths[3] + widths[4] + widths[5], height: rowHeight, text: "Totales", label: true, size: 5.8 });
  cell(page, font, bold, { x: margin + widths.slice(0, 6).reduce((sum, value) => sum + value, 0), top, width: widths[6], height: rowHeight, text: totalRequested.toFixed(0), label: true, center: true, size: 5.8 });
  cell(page, font, bold, { x: margin + widths.slice(0, 7).reduce((sum, value) => sum + value, 0), top, width: widths[7], height: rowHeight, text: "", label: true });
  cell(page, font, bold, { x: margin + widths.slice(0, 8).reduce((sum, value) => sum + value, 0), top, width: widths[8], height: rowHeight, text: totalPacked.toFixed(0), label: true, center: true, size: 5.8 });
  cell(page, font, bold, { x: margin + widths.slice(0, 9).reduce((sum, value) => sum + value, 0), top, width: widths[9], height: rowHeight, text: "", label: true });
  top -= rowHeight + 4;

  top = section(page, bold, top, "PAQUETES", margin, width);
  const packageWidths = [30, 120, 60, 110, width - 320];
  packageWidths.forEach((columnWidth, columnIndex) => {
    const x = margin + packageWidths.slice(0, columnIndex).reduce((sum, value) => sum + value, 0);
    cell(page, font, bold, { x, top, width: columnWidth, height: 14, text: ["N.°", "Tipo", "Peso kg", "Dimensiones cm", "Observación"][columnIndex], label: true, center: columnIndex === 0, size: 5.3 });
  });
  top -= 14;
  if (record.packages.length) {
    record.packages.slice(0, 6).forEach((item) => {
      const dimensions = item.length && item.width && item.height ? `${item.length} × ${item.width} × ${item.height}` : "—";
      const values = [String(item.packageNumber), item.packageType ?? "—", item.weight === null || item.weight === undefined ? "—" : String(item.weight), dimensions, item.notes ?? ""];
      values.forEach((value, columnIndex) => {
        const x = margin + packageWidths.slice(0, columnIndex).reduce((sum, current) => sum + current, 0);
        cell(page, font, bold, { x, top, width: packageWidths[columnIndex], height: rowHeight, text: value, center: columnIndex === 0, size: 5.4 });
      });
      top -= rowHeight;
    });
  } else {
    cell(page, font, bold, { x: margin, top, width, height: rowHeight, text: "Sin paquetes registrados", size: 5.6 });
    top -= rowHeight;
  }
  top -= 4;

  cell(page, font, bold, { x: margin, top, width, height: 26, text: `Observaciones generales: ${record.notes || "Sin observaciones."}`, label: true, size: 5.8 });
  top -= 26;
  const footer = "Documento sin firmas. Verifica cantidades empacadas antes del despacho.";
  page.drawText(footer, { x: margin, y: Math.max(margin, top - 6), size: 5.2, font, color: muted });

  document.setTitle(`Orden de Pick & Pack ${record.number}`);
  document.setAuthor("LK INNOVACION");
  return document.save();
}
