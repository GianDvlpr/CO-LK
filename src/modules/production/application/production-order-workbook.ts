import ExcelJS from "exceljs";
import {
  componentRows, formatDate, productionTurns, programEntries, salesOrderReferences, skuPattern,
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
  const columnCount = Math.max(11, program.length + 3);
  const totalColumn = columnCount - 1;
  const expectedColumn = columnCount;
  const sheet = workbook.addWorksheet("Orden de producción", {
    pageSetup: {
      orientation: "landscape", paperSize: 11, fitToPage: true, fitToWidth: 1, fitToHeight: 1,
      margins: { left: 0.15, right: 0.15, top: 0.2, bottom: 0.2, header: 0, footer: 0 },
      horizontalCentered: true, verticalCentered: true,
    },
    properties: { defaultRowHeight: 15 },
  });
  const lastColumn = sheet.getColumn(expectedColumn).letter;
  sheet.views = [{ showGridLines: false }];
  sheet.pageSetup.printArea = `A1:${lastColumn}${25 + Math.max(3, turns.length)}`;
  sheet.getColumn(1).width = 20;
  for (let column = 2; column <= columnCount; column += 1) sheet.getColumn(column).width = column === expectedColumn ? 15 : column === totalColumn ? 10 : 10;

  const thin = { style: "thin", color: { argb: GRID } } as const;
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const rangeStyle = (row: number, from = 1, to = columnCount) => {
    for (let column = from; column <= to; column += 1) {
      const cell = sheet.getCell(row, column);
      cell.border = border;
      cell.font = { name: "Arial", size: 9, color: { argb: NAVY }, ...cell.font };
      cell.alignment = { vertical: "middle", wrapText: true, ...cell.alignment };
    }
  };
  const fill = (cell: ExcelJS.Cell, color: string) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } }; };
  const section = (row: number, title: string) => {
    sheet.mergeCells(row, 1, row, columnCount);
    const cell = sheet.getCell(row, 1);
    cell.value = title;
    cell.font = { name: "Arial", size: 9, bold: true, color: { argb: WHITE } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    fill(cell, NAVY); cell.border = border; sheet.getRow(row).height = 18;
  };

  sheet.mergeCells(1, 1, 1, columnCount);
  const title = sheet.getCell(1, 1);
  title.value = `LK INNOVACION DE SUELAS PARA CALZADO  |  ORDEN DE PRODUCCIÓN  |  FECHA DE EMISIÓN: ${formatDate(order.createdAt)}`;
  title.font = { name: "Arial", size: 10, bold: true, color: { argb: WHITE } };
  title.alignment = { vertical: "middle", horizontal: "left" };
  fill(title, NAVY); title.border = border; sheet.getRow(1).height = 22;

  const leftEnd = Math.floor(columnCount / 2);
  const rightStart = leftEnd + 1;
  const leftValueStart = 3;
  const rightValueStart = rightStart + 2;
  const info: [string, ExcelJS.CellValue, string, ExcelJS.CellValue][] = [
    ["N.° OP", order.number, "Máquina", order.machine ? `${order.machine.code} · ${order.machine.name}` : ""],
    ["Operario", order.operatorName ?? "", "Matriz", order.productVariant.product.matrixCode],
    ["Fecha programada", order.plannedAt ?? "", "Material", order.materialItem ? `${order.materialItem.code} · ${order.materialItem.name}` : ""],
    ["Referencias de pedido", salesOrderReferences(order), "Color principal C1", order.productVariant.color.name],
    ["SKU", skuPattern(order), "Color secundario C2", order.productVariant.secondaryColor?.name ?? ""],
    ["Logo / marca", order.modelLogo ?? "", "Color de marca", order.brandColor ?? ""],
  ];
  info.forEach(([leftLabel, leftValue, rightLabel, rightValue], index) => {
    const row = index + 2;
    sheet.mergeCells(row, 1, row, 2);
    sheet.mergeCells(row, leftValueStart, row, leftEnd);
    sheet.mergeCells(row, rightStart, row, rightStart + 1);
    sheet.mergeCells(row, rightValueStart, row, columnCount);
    sheet.getCell(row, 1).value = leftLabel; sheet.getCell(row, rightStart).value = rightLabel;
    sheet.getCell(row, leftValueStart).value = leftValue; sheet.getCell(row, rightValueStart).value = rightValue;
    [sheet.getCell(row, 1), sheet.getCell(row, rightStart)].forEach((cell) => { cell.font = { name: "Arial", size: 8, bold: true, color: { argb: NAVY } }; fill(cell, LIGHT); });
    if (index === 0 || index === 1) { fill(sheet.getCell(row, leftValueStart), INPUT); fill(sheet.getCell(row, rightValueStart), INPUT); }
    if (leftValue instanceof Date) sheet.getCell(row, leftValueStart).numFmt = "dd/mm/yyyy";
    if (rightValue instanceof Date) sheet.getCell(row, rightValueStart).numFmt = "dd/mm/yyyy";
    rangeStyle(row); sheet.getRow(row).height = 19;
  });

  section(9, "COMPONENTES INTEGRADOS EN LA MISMA OPERACIÓN DE PRENSADO");
  const componentCodeStart = Math.max(3, Math.floor(columnCount * 0.22));
  const detailStart = Math.max(componentCodeStart + 3, Math.floor(columnCount * 0.61));
  sheet.mergeCells(10, 1, 10, componentCodeStart - 1);
  sheet.mergeCells(10, componentCodeStart, 10, detailStart - 1);
  sheet.mergeCells(10, detailStart, 10, columnCount);
  sheet.getCell(10, 1).value = "Componente"; sheet.getCell(10, componentCodeStart).value = "Código / tipo / cantidad"; sheet.getCell(10, detailStart).value = "Color / detalle";
  [1, componentCodeStart, detailStart].forEach((column) => { const cell = sheet.getCell(10, column); cell.font = { name: "Arial", size: 8, bold: true, color: { argb: NAVY } }; fill(cell, LIGHT); });
  rangeStyle(10);
  componentRows(order).forEach((item, index) => {
    const row = 11 + index;
    sheet.mergeCells(row, 1, row, componentCodeStart - 1);
    sheet.mergeCells(row, componentCodeStart, row, detailStart - 1);
    sheet.mergeCells(row, detailStart, row, columnCount);
    sheet.getCell(row, 1).value = item.label; sheet.getCell(row, 1).font = { name: "Arial", size: 8, bold: true, color: { argb: NAVY } }; fill(sheet.getCell(row, 1), LIGHT);
    sheet.getCell(row, componentCodeStart).value = item.code; sheet.getCell(row, detailStart).value = item.detail;
    rangeStyle(row); sheet.getRow(row).height = 19;
  });

  const programSectionRow = 18;
  section(programSectionRow, "PROGRAMACIÓN Y CONTROL DE PARES POR TALLA");
  const headerRow = programSectionRow + 1;
  sheet.getCell(headerRow, 1).value = "Talla";
  program.forEach((item, index) => { sheet.getCell(headerRow, index + 2).value = item.size; });
  sheet.getCell(headerRow, totalColumn).value = "TOTAL";
  sheet.getCell(headerRow, expectedColumn).value = "TOTAL ESPERADO";
  const plannedRow = headerRow + 1;
  sheet.getCell(plannedRow, 1).value = "A fabricar";
  program.forEach((item, index) => { sheet.getCell(plannedRow, index + 2).value = item.requestedPairs; fill(sheet.getCell(plannedRow, index + 2), INPUT); });
  sheet.getCell(plannedRow, totalColumn).value = { formula: `SUM(B${plannedRow}:${sheet.getColumn(totalColumn - 1).letter}${plannedRow})` };
  sheet.getCell(plannedRow, expectedColumn).value = program.reduce((sum, item) => sum + Number(item.requestedPairs), 0);
  const turnRows = Math.max(3, turns.length);
  for (let index = 0; index < turnRows; index += 1) {
    const row = plannedRow + index + 1;
    const turn = turns[index];
    sheet.getCell(row, 1).value = turn ? `Turno ${index + 1} · ${formatDate(turn.date)}` : `Turno ${index + 1}`;
    program.forEach((item, sizeIndex) => { sheet.getCell(row, sizeIndex + 2).value = turn?.quantities.find((quantity) => quantity.productVariantId === item.productVariantId)?.quantity || ""; });
    sheet.getCell(row, totalColumn).value = { formula: `SUM(B${row}:${sheet.getColumn(totalColumn - 1).letter}${row})` };
    sheet.getCell(row, expectedColumn).value = "";
    rangeStyle(row);
  }
  [headerRow, plannedRow].forEach((row) => { rangeStyle(row); for (let column = 1; column <= columnCount; column += 1) { const cell = sheet.getCell(row, column); cell.font = { name: "Arial", size: row === plannedRow && column > 1 ? 9 : 8, bold: true, color: { argb: NAVY } }; if (row === headerRow) fill(cell, LIGHT); cell.alignment = { horizontal: "center", vertical: "middle" }; } });
  const observationRow = plannedRow + turnRows + 1;
  sheet.mergeCells(observationRow, 1, observationRow, columnCount);
  sheet.getCell(observationRow, 1).value = `Observaciones / incidencias: ${turns.map((turn) => turn.observations).filter(Boolean).join(" | ")}`;
  sheet.getCell(observationRow, 1).font = { name: "Arial", size: 8, bold: true, color: { argb: NAVY } };
  fill(sheet.getCell(observationRow, 1), LIGHT); sheet.getCell(observationRow, 1).border = border; sheet.getRow(observationRow).height = 15;
  return workbook;
}
