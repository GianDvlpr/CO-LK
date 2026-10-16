import ExcelJS from "exceljs";

type SizeProgramEntry = { productVariantId?: string; sku?: string; size: string; color?: string; requestedPairs: number; producedPairs?: number };
type DailyEntry = { date: string; productVariantId?: string; sku?: string; size: string; color?: string; quantity: number; observations?: string };

export type ProductionOrderWorkbookData = {
  number: string;
  plannedAt: Date | null;
  machineEquipment: string | null;
  operatorName: string | null;
  modelLogo: string | null;
  materialLoad: string | null;
  seriesLot: string | null;
  processType: string | null;
  mold: string | null;
  brandColor: string | null;
  pressNumber: string | null;
  pressLoad: string | null;
  injectorNumber: string | null;
  curve: string | null;
  sizeProgram: unknown;
  dailyProduction: unknown;
  productVariant: { product: { name: string }; size: { name: string }; color: { name: string } };
};

function sizes(value: unknown): SizeProgramEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is SizeProgramEntry => Boolean(item && typeof item === "object" && "size" in item && "requestedPairs" in item));
}

function daily(value: unknown): DailyEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is DailyEntry => Boolean(item && typeof item === "object" && "date" in item && "size" in item && "quantity" in item));
}

function processLabel(processType: string | null) {
  if (processType === "PRENSA") return "Prensa";
  if (processType === "INYECTORA") return "Inyectora";
  if (processType === "AMBOS") return "Prensa e inyectora";
  return "Sin bloque técnico";
}

export async function buildProductionOrderWorkbook(order: ProductionOrderWorkbookData) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "LK INNOVACION";
  const sheet = workbook.addWorksheet("Orden de producción", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1, paperSize: 9, margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.1, footer: 0.1 } } });
  sheet.views = [{ showGridLines: false }];
  const program = sizes(order.sizeProgram);
  const log = daily(order.dailyProduction);
  const sizeNames = Array.from(new Set([...program.map((item) => item.size), ...log.map((item) => item.size)]));
  if (sizeNames.length === 0) sizeNames.push(order.productVariant.size.name);
  const sizeColumnCount = Math.max(5, sizeNames.length);
  const sizeStartColumn = 3;
  const totalColumn = sizeStartColumn + sizeColumnCount;
  const observationColumn = totalColumn + 1;
  const lastColumn = sheet.getColumn(observationColumn).letter;
  const blue = "FF9ED4F6";
  const navy = "FF06145B";
  const lightBlue = "FFD8EEFC";
  const border = { style: "thin", color: { argb: "FF111111" } } as const;
  const box = { top: border, left: border, bottom: border, right: border };

  sheet.mergeCells(`A1:${lastColumn}2`);
  const title = sheet.getCell("A1");
  title.value = "ORDEN DE PRODUCCIÓN";
  title.font = { name: "Arial", size: 26, bold: true, color: { argb: navy } };
  title.alignment = { horizontal: "center", vertical: "middle" };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: blue } };
  title.border = box;
  sheet.getRow(1).height = 32;
  sheet.getRow(2).height = 22;

  const infoRows: [string, ExcelJS.CellValue, string, ExcelJS.CellValue, string, ExcelJS.CellValue][] = [
    ["N.° de orden", order.number, "Fecha", order.plannedAt ?? "", "Bloques del Excel", processLabel(order.processType)],
    ["Máquina / Equipo", order.machineEquipment ?? "", "Operario", order.operatorName ?? "", "Matriz", order.mold ?? ""],
    ["Modelo / Logo", order.modelLogo ?? order.productVariant.product.name, "Material / Carga", order.materialLoad ?? "", "Colores", order.brandColor ?? order.productVariant.color.name],
    ["Serie / Lote", order.seriesLot ?? "", "Producto", order.productVariant.product.name, "Variantes", program.length ? `${program.length} talla-color` : `${order.productVariant.size.name} / ${order.productVariant.color.name}`],
  ];
  infoRows.forEach((values, index) => {
    const row = 4 + index;
    sheet.mergeCells(row, 2, row, 3);
    sheet.mergeCells(row, 5, row, 6);
    sheet.mergeCells(row, 8, row, observationColumn);
    [1, 4, 7].forEach((column, pair) => {
      const label = sheet.getCell(row, column);
      label.value = values[pair * 2];
      label.font = { bold: true, color: { argb: navy } };
      label.alignment = { vertical: "middle", wrapText: true };
    });
    [[2, values[1]], [5, values[3]], [8, values[5]]].forEach(([column, value]) => {
      const cell = sheet.getCell(row, Number(column));
      cell.value = value as ExcelJS.CellValue;
      cell.alignment = { vertical: "middle", wrapText: true };
    });
    for (let column = 1; column <= observationColumn; column += 1) sheet.getCell(row, column).border = box;
  });
  if (order.plannedAt) sheet.getCell("E4").numFmt = "dd/mm/yyyy";

  const section = (row: number, text: string) => {
    sheet.mergeCells(`A${row}:${lastColumn}${row}`);
    const cell = sheet.getCell(row, 1);
    cell.value = text;
    cell.font = { bold: true, size: 16, color: { argb: navy } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: blue } };
    cell.border = box;
    sheet.getRow(row).height = 25;
  };

  section(9, "1. PROGRAMACIÓN POR TALLA Y COLOR (CURVA)");
  const programHeaderRow = 10;
  sheet.getCell(programHeaderRow, 1).value = "Color";
  sheet.getCell(programHeaderRow, 2).value = "SKU / referencia";
  for (let index = 0; index < sizeColumnCount; index += 1) sheet.getCell(programHeaderRow, sizeStartColumn + index).value = sizeNames[index] ?? "";
  sheet.getCell(programHeaderRow, totalColumn).value = "Total pares";
  sheet.getCell(programHeaderRow, observationColumn).value = "Observación";
  const colors = Array.from(new Set(program.map((item) => item.color || "Sin color")));
  if (colors.length === 0) colors.push(order.productVariant.color.name);
  colors.forEach((color, index) => {
    const row = programHeaderRow + 1 + index;
    const entries = program.filter((item) => (item.color || "Sin color") === color);
    sheet.getCell(row, 1).value = color;
    sheet.getCell(row, 2).value = Array.from(new Set(entries.map((item) => item.sku).filter(Boolean))).join(", ");
    sizeNames.forEach((size, sizeIndex) => {
      const quantity = entries.filter((item) => item.size === size).reduce((sum, item) => sum + Number(item.requestedPairs), 0);
      sheet.getCell(row, sizeStartColumn + sizeIndex).value = quantity || "";
    });
    sheet.getCell(row, totalColumn).value = { formula: `SUM(${sheet.getColumn(sizeStartColumn).letter}${row}:${sheet.getColumn(totalColumn - 1).letter}${row})` };
    sheet.getCell(row, observationColumn).value = entries.some((item) => item.producedPairs !== undefined) ? `Producido: ${entries.reduce((sum, item) => sum + Number(item.producedPairs ?? 0), 0)}` : "";
  });
  const programTotalRow = programHeaderRow + colors.length + 1;
  sheet.mergeCells(programTotalRow, 1, programTotalRow, 2);
  sheet.getCell(programTotalRow, 1).value = "TOTAL PROGRAMADO";
  sizeNames.forEach((_size, index) => {
    const column = sizeStartColumn + index;
    sheet.getCell(programTotalRow, column).value = { formula: `SUM(${sheet.getColumn(column).letter}${programHeaderRow + 1}:${sheet.getColumn(column).letter}${programTotalRow - 1})` };
  });
  sheet.getCell(programTotalRow, totalColumn).value = { formula: `SUM(${sheet.getColumn(sizeStartColumn).letter}${programTotalRow}:${sheet.getColumn(totalColumn - 1).letter}${programTotalRow})` };

  const dailySectionRow = programTotalRow + 2;
  section(dailySectionRow, "2. REGISTRO DIARIO DE PRODUCCIÓN");
  const dailyHeaderRow = dailySectionRow + 1;
  sheet.getCell(dailyHeaderRow, 1).value = "Fecha";
  sheet.getCell(dailyHeaderRow, 2).value = "Color";
  sizeNames.forEach((size, index) => { sheet.getCell(dailyHeaderRow, sizeStartColumn + index).value = size; });
  sheet.getCell(dailyHeaderRow, totalColumn).value = "Total";
  sheet.getCell(dailyHeaderRow, observationColumn).value = "Observaciones";
  const groups = new Map<string, DailyEntry[]>();
  log.forEach((entry) => {
    const key = `${entry.date}|${entry.color || "Sin color"}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  });
  const dailyRows = Math.max(6, groups.size);
  Array.from(groups.entries()).forEach(([key, entries], rowIndex) => {
    const row = dailyHeaderRow + 1 + rowIndex;
    const [date, color] = key.split("|");
    sheet.getCell(row, 1).value = new Date(`${date}T12:00:00`);
    sheet.getCell(row, 1).numFmt = "dd/mm/yyyy";
    sheet.getCell(row, 2).value = color;
    sizeNames.forEach((size, index) => { sheet.getCell(row, sizeStartColumn + index).value = entries.filter((entry) => entry.size === size).reduce((sum, entry) => sum + Number(entry.quantity), 0) || ""; });
    sheet.getCell(row, totalColumn).value = { formula: `SUM(${sheet.getColumn(sizeStartColumn).letter}${row}:${sheet.getColumn(totalColumn - 1).letter}${row})` };
    sheet.getCell(row, observationColumn).value = Array.from(new Set(entries.map((entry) => entry.observations).filter(Boolean))).join("; ");
  });

  const showPress = order.processType === "PRENSA" || order.processType === "AMBOS";
  const showInjector = order.processType === "INYECTORA" || order.processType === "AMBOS";
  let finalRow = dailyHeaderRow + dailyRows;
  if (showPress || showInjector) {
    const processRow = finalRow + 2;
    section(processRow, "3. DATOS ESPECÍFICOS DEL PROCESO");
    const half = Math.floor(observationColumn / 2);
    if (showPress && showInjector) {
      sheet.mergeCells(processRow + 1, 1, processRow + 1, half);
      sheet.mergeCells(processRow + 1, half + 1, processRow + 1, observationColumn);
      sheet.getCell(processRow + 1, 1).value = "A) Prensa";
      sheet.getCell(processRow + 1, half + 1).value = "B) Inyectora";
      sheet.mergeCells(processRow + 2, 1, processRow + 2, half);
      sheet.mergeCells(processRow + 3, 1, processRow + 3, half);
      sheet.mergeCells(processRow + 2, half + 1, processRow + 2, observationColumn);
      sheet.mergeCells(processRow + 3, half + 1, processRow + 3, observationColumn);
      sheet.getCell(processRow + 2, 1).value = `Prensa N.°: ${order.pressNumber ?? ""}`;
      sheet.getCell(processRow + 3, 1).value = `Carga: ${order.pressLoad ?? ""}`;
      sheet.getCell(processRow + 2, half + 1).value = `Inyectora N.°: ${order.injectorNumber ?? ""}`;
      sheet.getCell(processRow + 3, half + 1).value = "Observaciones técnicas:";
    } else {
      sheet.mergeCells(processRow + 1, 1, processRow + 1, observationColumn);
      sheet.mergeCells(processRow + 2, 1, processRow + 2, observationColumn);
      sheet.mergeCells(processRow + 3, 1, processRow + 3, observationColumn);
      sheet.getCell(processRow + 1, 1).value = showPress ? "Prensa" : "Inyectora";
      sheet.getCell(processRow + 2, 1).value = showPress ? `Prensa N.°: ${order.pressNumber ?? ""}` : `Inyectora N.°: ${order.injectorNumber ?? ""}`;
      sheet.getCell(processRow + 3, 1).value = showPress ? `Carga: ${order.pressLoad ?? ""}` : "Observaciones técnicas:";
    }
    finalRow = processRow + 3;
    sheet.getRow(processRow + 1).font = { bold: true, color: { argb: navy } };
    sheet.getRow(processRow + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: lightBlue } };
  }

  for (let row = 9; row <= finalRow; row += 1) {
    for (let column = 1; column <= observationColumn; column += 1) {
      const cell = sheet.getCell(row, column);
      cell.border = box;
      cell.alignment = { horizontal: column === observationColumn ? "left" : "center", vertical: "middle", wrapText: true };
    }
  }
  [programHeaderRow, dailyHeaderRow, programTotalRow].forEach((row) => {
    sheet.getRow(row).font = { bold: true, color: { argb: navy } };
    sheet.getRow(row).fill = { type: "pattern", pattern: "solid", fgColor: { argb: lightBlue } };
  });
  sheet.getColumn(1).width = 17;
  sheet.getColumn(2).width = 22;
  for (let column = sizeStartColumn; column < totalColumn; column += 1) sheet.getColumn(column).width = 10;
  sheet.getColumn(totalColumn).width = 13;
  sheet.getColumn(observationColumn).width = 28;
  sheet.pageSetup.printArea = `A1:${lastColumn}${finalRow}`;
  sheet.headerFooter.oddFooter = `&L${order.number}&RPágina &P de &N`;
  return workbook;
}
