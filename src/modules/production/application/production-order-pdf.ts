import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  componentNames, componentRows, formatDate, productionTurns, programEntries, salesOrderReferences, skuPattern,
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

  cell(page, font, bold, { x: margin, top, width, height: 20, text: `LK INNOVACION DE SUELAS PARA CALZADO  |  ORDEN DE PRODUCCIÓN  |  FECHA DE EMISIÓN: ${formatDate(order.createdAt)}`, dark: true, size: 8 });
  top -= 20;
  const half = width / 2;
  const labelWidth = 92;
  const info: [string, string, string, string][] = [
    ["N.° OP", order.number, "Máquina", order.machine ? `${order.machine.code} · ${order.machine.name}` : ""],
    ["Operario", order.operatorName ?? "", "Matriz", order.productVariant.product.matrixCode],
    ["Fecha programada", formatDate(order.plannedAt), "Material", order.materialItem ? `${order.materialItem.code} · ${order.materialItem.name}` : ""],
    ["Referencias de pedido", salesOrderReferences(order), "Color principal C1", order.productVariant.color.name],
    ["SKU", skuPattern(order), "Color secundario C2", order.productVariant.secondaryColor?.name ?? ""],
    ["Logo / marca", order.modelLogo ?? "", "Color de marca", order.brandColor ?? ""],
  ];
  info.forEach(([leftLabel, leftValue, rightLabel, rightValue], index) => {
    cell(page, font, bold, { x: margin, top, width: labelWidth, height: 16, text: leftLabel, label: true, size: 7.2 });
    cell(page, font, bold, { x: margin + labelWidth, top, width: half - labelWidth, height: 16, text: leftValue, highlight: index === 0 || index === 1, size: 7.2 });
    cell(page, font, bold, { x: margin + half, top, width: labelWidth, height: 16, text: rightLabel, label: true, size: 7.2 });
    cell(page, font, bold, { x: margin + half + labelWidth, top, width: half - labelWidth, height: 16, text: rightValue, highlight: index === 0 || index === 1, size: 7.2 });
    top -= 16;
  });
  top -= 5;

  top = section(page, bold, top, "COMPONENTES INTEGRADOS EN LA MISMA OPERACIÓN DE PRENSADO", margin, width);
  const componentWidths = [76, 250, width - 326];
  ["Componente", "Código / tipo / cantidad", "Color / detalle"].forEach((text, index) => cell(page, font, bold, { x: margin + componentWidths.slice(0, index).reduce((sum, value) => sum + value, 0), top, width: componentWidths[index], height: 14, text, label: true }));
  top -= 14;
  componentRows(order).forEach((row) => {
    cell(page, font, bold, { x: margin, top, width: componentWidths[0], height: 15, text: row.label, label: true, size: 7.2 });
    cell(page, font, bold, { x: margin + componentWidths[0], top, width: componentWidths[1], height: 15, text: row.code, size: 7.2 });
    cell(page, font, bold, { x: margin + componentWidths[0] + componentWidths[1], top, width: componentWidths[2], height: 15, text: row.detail, size: 7.2 });
    top -= 15;
  });
  top -= 5;

  top = section(page, bold, top, "PROGRAMACIÓN Y CONTROL DE PARES POR TALLA", margin, width);
  const program = programEntries(order.sizeProgram);
  const turns = productionTurns(order.productionTurns);
  const firstColumn = 100;
  const totalColumn = 42;
  const expectedColumn = 64;
  const sizeWidth = program.length ? (width - firstColumn - totalColumn - expectedColumn) / program.length : width - firstColumn - totalColumn - expectedColumn;
  const drawProgramRow = (label: string, values: (string | number)[], total: string | number, expected: string | number, rowHeight: number, isHeader = false, isPlanned = false) => {
    cell(page, font, bold, { x: margin, top, width: firstColumn, height: rowHeight, text: label, label: true });
    values.forEach((value, index) => cell(page, font, bold, { x: margin + firstColumn + sizeWidth * index, top, width: sizeWidth, height: rowHeight, text: String(value ?? ""), label: isHeader, highlight: isPlanned, center: true, size: isHeader ? 6 : 7 }));
    cell(page, font, bold, { x: margin + width - totalColumn - expectedColumn, top, width: totalColumn, height: rowHeight, text: String(total), label: isHeader, center: true, size: isHeader ? 6 : 7 });
    cell(page, font, bold, { x: margin + width - expectedColumn, top, width: expectedColumn, height: rowHeight, text: String(expected), label: isHeader, center: true, size: isHeader ? 5.5 : 6.5 });
    top -= rowHeight;
  };
  const expectedTotal = program.reduce((sum, item) => sum + Number(item.requestedPairs), 0);
  drawProgramRow("Talla", program.map((item) => item.size), "TOTAL", "TOTAL ESPERADO", 14, true);
  drawProgramRow("A fabricar", program.map((item) => item.requestedPairs), expectedTotal, expectedTotal, 14, false, true);
  const visibleTurns = Math.max(3, Math.min(8, turns.length));
  const observationsHeight = 16;
  const available = Math.max(42, top - margin - observationsHeight);
  const turnHeight = Math.max(9, Math.min(13, available / visibleTurns));
  for (let index = 0; index < visibleTurns; index += 1) {
    const turn = turns[index];
    const values = program.map((item) => turn?.quantities.find((quantity) => quantity.productVariantId === item.productVariantId)?.quantity || "");
    const total = values.reduce<number>((sum, value) => sum + Number(value || 0), 0) || "";
    drawProgramRow(turn ? `Turno ${index + 1} · ${formatDate(turn.date)}` : `Turno ${index + 1}`, values, total, "", turnHeight);
  }
  const observations = turns.slice(0, 8).map((turn) => turn.observations).filter(Boolean).join(" | ");
  cell(page, font, bold, { x: margin, top, width, height: 16, text: `Observaciones / incidencias: ${observations}${turns.length > 8 ? " · Continúa en la página siguiente" : ""}`, label: true, size: 5.8 });

  for (let offset = 8; offset < turns.length; offset += 14) {
    const continuation = document.addPage(A5_LANDSCAPE);
    let continuationTop = pageHeight - margin;
    cell(continuation, font, bold, { x: margin, top: continuationTop, width, height: 20, text: `ORDEN DE PRODUCCIÓN ${order.number}  |  CONTROL DE TURNOS`, dark: true, size: 8 });
    continuationTop -= 25;
    continuationTop = section(continuation, bold, continuationTop, "CONTINUACIÓN DE PROGRAMACIÓN Y CONTROL DE PARES POR TALLA", margin, width);
    const continuationRow = (label: string, values: (string | number)[], total: string | number, expected: string | number, rowHeight: number, header = false) => {
      cell(continuation, font, bold, { x: margin, top: continuationTop, width: firstColumn, height: rowHeight, text: label, label: true });
      values.forEach((value, index) => cell(continuation, font, bold, { x: margin + firstColumn + sizeWidth * index, top: continuationTop, width: sizeWidth, height: rowHeight, text: String(value ?? ""), label: header, center: true, size: header ? 6 : 7 }));
      cell(continuation, font, bold, { x: margin + width - totalColumn - expectedColumn, top: continuationTop, width: totalColumn, height: rowHeight, text: String(total), label: header, center: true, size: header ? 6 : 7 });
      cell(continuation, font, bold, { x: margin + width - expectedColumn, top: continuationTop, width: expectedColumn, height: rowHeight, text: String(expected), label: header, center: true, size: header ? 5.5 : 6.5 });
      continuationTop -= rowHeight;
    };
    continuationRow("Talla", program.map((item) => item.size), "TOTAL", "TOTAL ESPERADO", 16, true);
    turns.slice(offset, offset + 14).forEach((turn, index) => {
      const values = program.map((item) => turn.quantities.find((quantity) => quantity.productVariantId === item.productVariantId)?.quantity || "");
      continuationRow(`Turno ${offset + index + 1} · ${formatDate(turn.date)}`, values, values.reduce<number>((sum, value) => sum + Number(value || 0), 0) || "", "", 20);
    });
    const continuationObservations = turns.slice(offset, offset + 14).map((turn, index) => turn.observations ? `T${offset + index + 1}: ${turn.observations}` : "").filter(Boolean).join(" | ");
    cell(continuation, font, bold, { x: margin, top: continuationTop, width, height: 16, text: `Observaciones / incidencias: ${continuationObservations}`, label: true, size: 5.8 });
  }

  document.setTitle(`Orden de producción ${order.number}`);
  document.setAuthor("LK INNOVACION");
  return document.save();
}

export async function buildBlankProductionOrderPdf() {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const page = document.addPage(A5_LANDSCAPE);
  const [pageWidth, pageHeight] = A5_LANDSCAPE;
  const margin = 12;
  const width = pageWidth - margin * 2;
  let top = pageHeight - margin;

  cell(page, font, bold, { x: margin, top, width, height: 20, text: "LK INNOVACION DE SUELAS PARA CALZADO  |  ORDEN DE PRODUCCIÓN  |  FECHA DE EMISIÓN: ____/____/________", dark: true, size: 8 });
  top -= 20;
  const half = width / 2;
  const labelWidth = 92;
  const info: [string, string][] = [
    ["N.° OP", "Máquina"],
    ["Operario", "Matriz"],
    ["Fecha programada", "Material"],
    ["Referencias de pedido", "Color principal C1"],
    ["SKU", "Color secundario C2"],
    ["Logo / marca", "Color de marca"],
  ];
  info.forEach(([leftLabel, rightLabel]) => {
    cell(page, font, bold, { x: margin, top, width: labelWidth, height: 16, text: leftLabel, label: true, size: 7.2 });
    cell(page, font, bold, { x: margin + labelWidth, top, width: half - labelWidth, height: 16, text: "", size: 7.2 });
    cell(page, font, bold, { x: margin + half, top, width: labelWidth, height: 16, text: rightLabel, label: true, size: 7.2 });
    cell(page, font, bold, { x: margin + half + labelWidth, top, width: half - labelWidth, height: 16, text: "", size: 7.2 });
    top -= 16;
  });
  top -= 5;

  top = section(page, bold, top, "COMPONENTES INTEGRADOS EN LA MISMA OPERACIÓN DE PRENSADO", margin, width);
  const componentWidths = [76, 250, width - 326];
  ["Componente", "Código / tipo / cantidad", "Color / detalle"].forEach((text, index) => cell(page, font, bold, { x: margin + componentWidths.slice(0, index).reduce((sum, value) => sum + value, 0), top, width: componentWidths[index], height: 14, text, label: true }));
  top -= 14;
  [...Object.values(componentNames), "Formulación C1", "Formulación C2"].forEach((label) => {
    cell(page, font, bold, { x: margin, top, width: componentWidths[0], height: 15, text: label, label: true, size: 7.2 });
    cell(page, font, bold, { x: margin + componentWidths[0], top, width: componentWidths[1], height: 15, text: "", size: 7.2 });
    cell(page, font, bold, { x: margin + componentWidths[0] + componentWidths[1], top, width: componentWidths[2], height: 15, text: "", size: 7.2 });
    top -= 15;
  });
  top -= 5;

  top = section(page, bold, top, "PROGRAMACIÓN Y CONTROL DE PARES POR TALLA", margin, width);
  const sizeCount = 6;
  const firstColumn = 100;
  const totalColumn = 42;
  const expectedColumn = 64;
  const sizeWidth = (width - firstColumn - totalColumn - expectedColumn) / sizeCount;
  const emptyValues = Array.from({ length: sizeCount }, () => "");
  const drawBlankRow = (label: string, values: string[], total: string, expected: string, rowHeight: number, header = false) => {
    cell(page, font, bold, { x: margin, top, width: firstColumn, height: rowHeight, text: label, label: true });
    values.forEach((value, index) => cell(page, font, bold, { x: margin + firstColumn + sizeWidth * index, top, width: sizeWidth, height: rowHeight, text: value, label: header, center: true, size: header ? 6 : 7 }));
    cell(page, font, bold, { x: margin + width - totalColumn - expectedColumn, top, width: totalColumn, height: rowHeight, text: total, label: header, center: true, size: header ? 6 : 7 });
    cell(page, font, bold, { x: margin + width - expectedColumn, top, width: expectedColumn, height: rowHeight, text: expected, label: header, center: true, size: header ? 5.5 : 6.5 });
    top -= rowHeight;
  };
  drawBlankRow("Talla", emptyValues, "TOTAL", "TOTAL ESPERADO", 14, true);
  drawBlankRow("A fabricar", emptyValues, "", "", 15);
  for (let index = 0; index < 5; index += 1) drawBlankRow(`Turno ${index + 1}`, emptyValues, "", "", 15);
  cell(page, font, bold, { x: margin, top, width, height: 16, text: "Observaciones / incidencias: ", label: true, size: 5.8 });

  document.setTitle("Formato de orden de producción en blanco");
  document.setAuthor("LK INNOVACION");
  return document.save();
}
