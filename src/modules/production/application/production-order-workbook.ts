import ExcelJS from "exceljs";
import {
  componentRows, formatDate, productionTurns, programEntries, skuPattern, statusLabel,
  type ProductionOrderDocumentData,
} from "@/modules/production/application/production-order-document";

const NAVY = "FF17384D";
const LIGHT = "FFE8F0F4";
const INPUT = "FFFFF1AD";
const WHITE = "FFFFFFFF";
const GRID = "FF718795";

export async function buildProductionOrderWorkbook(order: ProductionOrderDocumentData) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "LK INNOVACION";
  const program = programEntries(order.sizeProgram);
  const turns = productionTurns(order.productionTurns);
  const columnCount = Math.max(10, program.length + 2);
  const totalColumn = columnCount;
  const sheet = workbook.addWorksheet("Orden de producción", {
    pageSetup: {
      orientation: "landscape", paperSize: 11, fitToPage: true, fitToWidth: 1, fitToHeight: 1,
      margins: { left: 0.15, right: 0.15, top: 0.2, bottom: 0.2, header: 0, footer: 0 },
      horizontalCentered: true, verticalCentered: true,
    },
    properties: { defaultRowHeight: 15 },
  });
  const lastColumn = sheet.getColumn(totalColumn).letter;
  sheet.views = [{ showGridLines: false }];
  sheet.pageSetup.printArea = `A1:${lastColumn}${25 + Math.max(3, turns.length)}`;
  sheet.getColumn(1).width = 20;
  for (let column = 2; column <= totalColumn; column += 1) sheet.getColumn(column).width = column === totalColumn ? 11 : 10;

  const thin = { style: "thin", color: { argb: GRID } } as const;
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const rangeStyle = (row: number, from = 1, to = totalColumn) => {
    for (let column = from; column <= to; column += 1) {
      const cell = sheet.getCell(row, column);
      cell.border = border;
      cell.font = { name: "Arial", size: 8, color: { argb: NAVY }, ...cell.font };
      cell.alignment = { vertical: "middle", wrapText: true, ...cell.alignment };
    }
  };
  const fill = (cell: ExcelJS.Cell, color: string) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } }; };
  const section = (row: number, title: string) => {
    sheet.mergeCells(row, 1, row, totalColumn);
    const cell = sheet.getCell(row, 1);
    cell.value = title;
    cell.font = { name: "Arial", size: 9, bold: true, color: { argb: WHITE } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    fill(cell, NAVY); cell.border = border; sheet.getRow(row).height = 18;
  };

  sheet.mergeCells(1, 1, 1, totalColumn);
  const title = sheet.getCell(1, 1);
  title.value = "LK INNOVACION DE SUELAS PARA CALZADO  |  ORDEN DE PRODUCCIÓN  |  A5";
  title.font = { name: "Arial", size: 10, bold: true, color: { argb: WHITE } };
  title.alignment = { vertical: "middle", horizontal: "left" };
  fill(title, NAVY); title.border = border; sheet.getRow(1).height = 22;

  const leftEnd = Math.floor(totalColumn / 2);
  const rightStart = leftEnd + 1;
  const leftValueStart = 3;
  const rightValueStart = rightStart + 2;
  const info: [string, ExcelJS.CellValue, string, ExcelJS.CellValue][] = [
    ["N.° OP", order.number, "Máquina", order.machine ? `${order.machine.code} · ${order.machine.name}` : ""],
    ["Estado", statusLabel(order.status), "Serie / modelo", `${order.productVariant.product.code} · ${order.productVariant.product.name}`],
    ["Prioridad", order.priority, "Matriz", order.productVariant.product.matrixCode],
    ["Operario", order.operatorName ?? "", "Material", order.materialItem ? `${order.materialItem.code} · ${order.materialItem.name}` : ""],
    ["Fecha de emisión", order.createdAt, "Color principal C1", order.productVariant.color.name],
    ["Fecha programada", order.plannedAt ?? "", "Color secundario C2", order.productVariant.secondaryColor?.name ?? ""],
    ["Referencia de pedido", order.salesOrder?.number ?? "", "Logo / marca", order.modelLogo ?? ""],
    ["SKU", skuPattern(order), "Color de marca", order.brandColor ?? ""],
  ];
  info.forEach(([leftLabel, leftValue, rightLabel, rightValue], index) => {
    const row = index + 2;
    sheet.mergeCells(row, 1, row, 2);
    sheet.mergeCells(row, leftValueStart, row, leftEnd);
    sheet.mergeCells(row, rightStart, row, rightStart + 1);
    sheet.mergeCells(row, rightValueStart, row, totalColumn);
    sheet.getCell(row, 1).value = leftLabel; sheet.getCell(row, rightStart).value = rightLabel;
    sheet.getCell(row, leftValueStart).value = leftValue; sheet.getCell(row, rightValueStart).value = rightValue;
    [sheet.getCell(row, 1), sheet.getCell(row, rightStart)].forEach((cell) => { cell.font = { name: "Arial", size: 8, bold: true, color: { argb: NAVY } }; fill(cell, LIGHT); });
    if (index === 0 || index === 2) { fill(sheet.getCell(row, leftValueStart), INPUT); fill(sheet.getCell(row, rightValueStart), INPUT); }
    if (leftValue instanceof Date) sheet.getCell(row, leftValueStart).numFmt = "dd/mm/yyyy";
    if (rightValue instanceof Date) sheet.getCell(row, rightValueStart).numFmt = "dd/mm/yyyy";
    rangeStyle(row); sheet.getRow(row).height = 16;
  });

  section(11, "COMPONENTES INTEGRADOS EN LA MISMA OPERACIÓN DE PRENSADO");
  const componentCodeStart = Math.max(3, Math.floor(totalColumn * 0.3));
  const detailStart = Math.max(componentCodeStart + 2, Math.floor(totalColumn * 0.64));
  sheet.mergeCells(12, 1, 12, componentCodeStart - 1);
  sheet.mergeCells(12, componentCodeStart, 12, detailStart - 1);
  sheet.mergeCells(12, detailStart, 12, totalColumn);
  sheet.getCell(12, 1).value = "Componente"; sheet.getCell(12, componentCodeStart).value = "Código / tipo / cantidad"; sheet.getCell(12, detailStart).value = "Color / detalle";
  [1, componentCodeStart, detailStart].forEach((column) => { const cell = sheet.getCell(12, column); cell.font = { name: "Arial", size: 8, bold: true, color: { argb: NAVY } }; fill(cell, LIGHT); });
  rangeStyle(12);
  componentRows(order).forEach((item, index) => {
    const row = 13 + index;
    sheet.mergeCells(row, 1, row, componentCodeStart - 1);
    sheet.mergeCells(row, componentCodeStart, row, detailStart - 1);
    sheet.mergeCells(row, detailStart, row, totalColumn);
    sheet.getCell(row, 1).value = item.label; sheet.getCell(row, 1).font = { name: "Arial", size: 8, bold: true, color: { argb: NAVY } }; fill(sheet.getCell(row, 1), LIGHT);
    sheet.getCell(row, componentCodeStart).value = item.code; sheet.getCell(row, detailStart).value = item.detail;
    rangeStyle(row); sheet.getRow(row).height = 16;
  });

  const programSectionRow = 20;
  section(programSectionRow, "PROGRAMACIÓN Y CONTROL DE PARES POR TALLA");
  const headerRow = programSectionRow + 1;
  sheet.getCell(headerRow, 1).value = "Talla";
  program.forEach((item, index) => { sheet.getCell(headerRow, index + 2).value = item.size; });
  sheet.getCell(headerRow, totalColumn).value = "TOTAL";
  const plannedRow = headerRow + 1;
  sheet.getCell(plannedRow, 1).value = "A fabricar";
  program.forEach((item, index) => { sheet.getCell(plannedRow, index + 2).value = item.requestedPairs; fill(sheet.getCell(plannedRow, index + 2), INPUT); });
  sheet.getCell(plannedRow, totalColumn).value = { formula: `SUM(B${plannedRow}:${sheet.getColumn(totalColumn - 1).letter}${plannedRow})` };
  const turnRows = Math.max(3, turns.length);
  for (let index = 0; index < turnRows; index += 1) {
    const row = plannedRow + index + 1;
    const turn = turns[index];
    sheet.getCell(row, 1).value = turn ? `Turno ${index + 1} · ${formatDate(turn.date)}` : `Turno ${index + 1}`;
    program.forEach((item, sizeIndex) => { sheet.getCell(row, sizeIndex + 2).value = turn?.quantities.find((quantity) => quantity.productVariantId === item.productVariantId)?.quantity || ""; });
    sheet.getCell(row, totalColumn).value = { formula: `SUM(B${row}:${sheet.getColumn(totalColumn - 1).letter}${row})` };
    rangeStyle(row);
  }
  [headerRow, plannedRow].forEach((row) => { rangeStyle(row); for (let column = 1; column <= totalColumn; column += 1) { const cell = sheet.getCell(row, column); cell.font = { name: "Arial", size: 8, bold: true, color: { argb: NAVY } }; if (row === headerRow) fill(cell, LIGHT); cell.alignment = { horizontal: "center", vertical: "middle" }; } });
  const observationRow = plannedRow + turnRows + 1;
  sheet.mergeCells(observationRow, 1, observationRow, totalColumn);
  sheet.getCell(observationRow, 1).value = `Observaciones / incidencias: ${turns.map((turn) => turn.observations).filter(Boolean).join(" | ")}`;
  sheet.getCell(observationRow, 1).font = { name: "Arial", size: 8, bold: true, color: { argb: NAVY } };
  fill(sheet.getCell(observationRow, 1), LIGHT); sheet.getCell(observationRow, 1).border = border; sheet.getRow(observationRow).height = 22;
  return workbook;
}
