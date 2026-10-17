import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  componentRows, formatDate, productionTurns, programEntries, skuPattern, statusLabel,
  type ProductionOrderDocumentData,
} from "@/modules/production/application/production-order-document";

const A5_LANDSCAPE: [number, number] = [595.28, 419.53];
const navy = rgb(23 / 255, 56 / 255, 77 / 255);
const light = rgb(232 / 255, 240 / 255, 244 / 255);
const input = rgb(1, 241 / 255, 173 / 255);
const white = rgb(1, 1, 1);
const grid = rgb(113 / 255, 135 / 255, 149 / 255);

function fitText(font: PDFFont, text: string, size: number, maxWidth: number) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let value = text;
  while (value.length > 1 && font.widthOfTextAtSize(`${value}…`, size) > maxWidth) value = value.slice(0, -1);
  return `${value}…`;
}

function cell(page: PDFPage, font: PDFFont, bold: PDFFont, inputValue: { x: number; top: number; width: number; height: number; text?: string; label?: boolean; dark?: boolean; highlight?: boolean; center?: boolean; size?: number }) {
  const { x, top, width, height } = inputValue;
  page.drawRectangle({ x, y: top - height, width, height, color: inputValue.dark ? navy : inputValue.label ? light : inputValue.highlight ? input : white, borderColor: grid, borderWidth: 0.55 });
  const selectedFont = inputValue.label || inputValue.dark ? bold : font;
  const size = inputValue.size ?? 6.2;
  const text = fitText(selectedFont, inputValue.text ?? "", size, width - 6);
  const textWidth = selectedFont.widthOfTextAtSize(text, size);
  page.drawText(text, { x: inputValue.center ? x + Math.max(3, (width - textWidth) / 2) : x + 3, y: top - height + (height - size) / 2 + 1, size, font: selectedFont, color: inputValue.dark ? white : navy });
}

function section(page: PDFPage, bold: PDFFont, top: number, text: string, left: number, width: number) {
  cell(page, bold, bold, { x: left, top, width, height: 16, text, dark: true, size: 7.2 });
  return top - 16;
}

export async function buildProductionOrderPdf(order: ProductionOrderDocumentData) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const page = document.addPage(A5_LANDSCAPE);
  const [pageWidth, pageHeight] = A5_LANDSCAPE;
  const margin = 12;
  const width = pageWidth - margin * 2;
  let top = pageHeight - margin;

  cell(page, font, bold, { x: margin, top, width, height: 20, text: "LK INNOVACION DE SUELAS PARA CALZADO  |  ORDEN DE PRODUCCIÓN", dark: true, size: 8 });
  top -= 20;
  const half = width / 2;
  const labelWidth = 92;
  const info: [string, string, string, string][] = [
    ["N.° OP", order.number, "Máquina", order.machine ? `${order.machine.code} · ${order.machine.name}` : ""],
    ["Estado", statusLabel(order.status), "Serie / modelo", `${order.productVariant.product.code} · ${order.productVariant.product.name}`],
    ["Prioridad", String(order.priority), "Matriz", order.productVariant.product.matrixCode],
    ["Operario", order.operatorName ?? "", "Material", order.materialItem ? `${order.materialItem.code} · ${order.materialItem.name}` : ""],
    ["Fecha de emisión", formatDate(order.createdAt), "Color principal C1", order.productVariant.color.name],
    ["Fecha programada", formatDate(order.plannedAt), "Color secundario C2", order.productVariant.secondaryColor?.name ?? ""],
    ["Referencia de pedido", order.salesOrder?.number ?? "", "Logo / marca", order.modelLogo ?? ""],
    ["SKU", skuPattern(order), "Color de marca", order.brandColor ?? ""],
  ];
  info.forEach(([leftLabel, leftValue, rightLabel, rightValue], index) => {
    cell(page, font, bold, { x: margin, top, width: labelWidth, height: 14, text: leftLabel, label: true });
    cell(page, font, bold, { x: margin + labelWidth, top, width: half - labelWidth, height: 14, text: leftValue, highlight: index === 0 || index === 2 });
    cell(page, font, bold, { x: margin + half, top, width: labelWidth, height: 14, text: rightLabel, label: true });
    cell(page, font, bold, { x: margin + half + labelWidth, top, width: half - labelWidth, height: 14, text: rightValue, highlight: index === 0 || index === 2 });
    top -= 14;
  });
  top -= 5;

  top = section(page, bold, top, "COMPONENTES INTEGRADOS EN LA MISMA OPERACIÓN DE PRENSADO", margin, width);
  const componentWidths = [160, 220, width - 380];
  ["Componente", "Código / tipo / cantidad", "Color / detalle"].forEach((text, index) => cell(page, font, bold, { x: margin + componentWidths.slice(0, index).reduce((sum, value) => sum + value, 0), top, width: componentWidths[index], height: 14, text, label: true }));
  top -= 14;
  componentRows(order).forEach((row) => {
    cell(page, font, bold, { x: margin, top, width: componentWidths[0], height: 13, text: row.label, label: true });
    cell(page, font, bold, { x: margin + componentWidths[0], top, width: componentWidths[1], height: 13, text: row.code });
    cell(page, font, bold, { x: margin + componentWidths[0] + componentWidths[1], top, width: componentWidths[2], height: 13, text: row.detail });
    top -= 13;
  });
  top -= 5;

  top = section(page, bold, top, "PROGRAMACIÓN Y CONTROL DE PARES POR TALLA", margin, width);
  const program = programEntries(order.sizeProgram);
  const turns = productionTurns(order.productionTurns);
  const firstColumn = 100;
  const totalColumn = 45;
  const sizeWidth = program.length ? (width - firstColumn - totalColumn) / program.length : width - firstColumn - totalColumn;
  const drawProgramRow = (label: string, values: (string | number)[], total: string | number, rowHeight: number, isHeader = false, isPlanned = false) => {
    cell(page, font, bold, { x: margin, top, width: firstColumn, height: rowHeight, text: label, label: true });
    values.forEach((value, index) => cell(page, font, bold, { x: margin + firstColumn + sizeWidth * index, top, width: sizeWidth, height: rowHeight, text: String(value ?? ""), label: isHeader, highlight: isPlanned, center: true, size: 6 }));
    cell(page, font, bold, { x: margin + width - totalColumn, top, width: totalColumn, height: rowHeight, text: String(total), label: isHeader, center: true, size: 6 });
    top -= rowHeight;
  };
  drawProgramRow("Talla", program.map((item) => item.size), "TOTAL", 14, true);
  drawProgramRow("A fabricar", program.map((item) => item.requestedPairs), program.reduce((sum, item) => sum + Number(item.requestedPairs), 0), 14, false, true);
  const visibleTurns = Math.max(3, Math.min(8, turns.length));
  const available = Math.max(42, top - margin - 23);
  const turnHeight = Math.max(7, Math.min(13, available / visibleTurns));
  for (let index = 0; index < visibleTurns; index += 1) {
    const turn = turns[index];
    const values = program.map((item) => turn?.quantities.find((quantity) => quantity.productVariantId === item.productVariantId)?.quantity || "");
    const total = values.reduce<number>((sum, value) => sum + Number(value || 0), 0) || "";
    drawProgramRow(turn ? `Turno ${index + 1} · ${formatDate(turn.date)}` : `Turno ${index + 1}`, values, total, turnHeight);
  }
  const observations = turns.slice(0, 8).map((turn) => turn.observations).filter(Boolean).join(" | ");
  cell(page, font, bold, { x: margin, top, width, height: Math.max(18, top - margin), text: `Observaciones / incidencias: ${observations}${turns.length > 8 ? " · Continúa en la página siguiente" : ""}`, label: true, size: 5.8 });

  for (let offset = 8; offset < turns.length; offset += 14) {
    const continuation = document.addPage(A5_LANDSCAPE);
    let continuationTop = pageHeight - margin;
    cell(continuation, font, bold, { x: margin, top: continuationTop, width, height: 20, text: `ORDEN DE PRODUCCIÓN ${order.number}  |  CONTROL DE TURNOS`, dark: true, size: 8 });
    continuationTop -= 25;
    continuationTop = section(continuation, bold, continuationTop, "CONTINUACIÓN DE PROGRAMACIÓN Y CONTROL DE PARES POR TALLA", margin, width);
    const continuationRow = (label: string, values: (string | number)[], total: string | number, rowHeight: number, header = false) => {
      cell(continuation, font, bold, { x: margin, top: continuationTop, width: firstColumn, height: rowHeight, text: label, label: true });
      values.forEach((value, index) => cell(continuation, font, bold, { x: margin + firstColumn + sizeWidth * index, top: continuationTop, width: sizeWidth, height: rowHeight, text: String(value ?? ""), label: header, center: true, size: 6 }));
      cell(continuation, font, bold, { x: margin + width - totalColumn, top: continuationTop, width: totalColumn, height: rowHeight, text: String(total), label: header, center: true, size: 6 });
      continuationTop -= rowHeight;
    };
    continuationRow("Talla", program.map((item) => item.size), "TOTAL", 16, true);
    turns.slice(offset, offset + 14).forEach((turn, index) => {
      const values = program.map((item) => turn.quantities.find((quantity) => quantity.productVariantId === item.productVariantId)?.quantity || "");
      continuationRow(`Turno ${offset + index + 1} · ${formatDate(turn.date)}`, values, values.reduce<number>((sum, value) => sum + Number(value || 0), 0) || "", 18);
    });
    const continuationObservations = turns.slice(offset, offset + 14).map((turn, index) => turn.observations ? `T${offset + index + 1}: ${turn.observations}` : "").filter(Boolean).join(" | ");
    cell(continuation, font, bold, { x: margin, top: continuationTop, width, height: Math.max(22, continuationTop - margin), text: `Observaciones / incidencias: ${continuationObservations}`, label: true, size: 5.8 });
  }

  document.setTitle(`Orden de producción ${order.number}`);
  document.setAuthor("LK INNOVACION");
  return document.save();
}
