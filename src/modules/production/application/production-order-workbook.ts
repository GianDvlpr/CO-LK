import ExcelJS from "exceljs";

type SizeProgramEntry = { size: string; requestedPairs: number };
type DailyEntry = { date: string; size: string; quantity: number; observations?: string };

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

export async function buildProductionOrderWorkbook(order: ProductionOrderWorkbookData) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "LK INNOVACION";
  const sheet = workbook.addWorksheet("Orden de producción", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1, paperSize: 9, margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.1, footer: 0.1 } } });
  sheet.views = [{ showGridLines: false }];
  const program = sizes(order.sizeProgram);
  const log = daily(order.dailyProduction);
  const sizeNames = Array.from(new Set([...program.map((item) => item.size), ...log.map((item) => item.size)]));
  if (sizeNames.length === 0) sizeNames.push(order.productVariant.size.name);
  const sizeColumnCount = Math.max(7, sizeNames.length);
  const totalColumn = 2 + sizeColumnCount;
  const observationColumn = totalColumn + 1;
  const lastColumn = sheet.getColumn(observationColumn).letter;
  const blue = "FF9ED4F6";
  const navy = "FF06145B";
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

  const info = [
    ["N.° de orden", order.number, "Fecha", order.plannedAt ?? "", "Tipo de proceso", order.processType === "PRENSA" ? "Prensa" : order.processType === "INYECTORA" ? "Inyectora" : ""],
    ["Máquina / Equipo", order.machineEquipment ?? "", "Operario", order.operatorName ?? "", "Matriz", order.mold ?? ""],
    ["Modelo / Logo", order.modelLogo ?? order.productVariant.product.name, "Material / Carga", order.materialLoad ?? "", "Color de marca", order.brandColor ?? order.productVariant.color.name],
    ["Serie / Lote", order.seriesLot ?? "", "Producto", order.productVariant.product.name, "Variante", `${order.productVariant.size.name} / ${order.productVariant.color.name}`],
  ];
  info.forEach((row, index) => {
    const target = sheet.getRow(4 + index);
    row.forEach((value, column) => { target.getCell(column + 1).value = value; });
    for (let column = 1; column <= 6; column += 1) {
      target.getCell(column).border = box;
      target.getCell(column).alignment = { vertical: "middle", wrapText: true };
      if (column % 2 === 1) target.getCell(column).font = { bold: true, color: { argb: navy } };
    }
  });
  if (order.plannedAt) sheet.getCell("D4").numFmt = "dd/mm/yyyy";

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

  section(9, "1. PROGRAMACIÓN POR TALLA");
  sheet.getCell("A10").value = "Talla";
  sheet.getCell("A11").value = "Pares solicitados";
  for (let index = 0; index < sizeColumnCount; index += 1) {
    const column = 2 + index;
    const size = sizeNames[index];
    sheet.getCell(10, column).value = size ?? "";
    sheet.getCell(11, column).value = size ? program.find((item) => item.size === size)?.requestedPairs ?? 0 : "";
  }
  sheet.getCell(10, totalColumn).value = "Total";
  sheet.getCell(11, totalColumn).value = { formula: `SUM(B11:${sheet.getColumn(totalColumn - 1).letter}11)` };
  sheet.mergeCells(10, observationColumn, 11, observationColumn);
  sheet.getCell(10, observationColumn).value = "";

  section(13, "2. REGISTRO DIARIO DE PRODUCCIÓN");
  sheet.getCell(14, 1).value = "Fecha";
  sizeNames.forEach((size, index) => { sheet.getCell(14, 2 + index).value = size; });
  sheet.getCell(14, totalColumn).value = "Total";
  sheet.getCell(14, observationColumn).value = "Observaciones";
  const groups = new Map<string, DailyEntry[]>();
  log.forEach((entry) => groups.set(entry.date, [...(groups.get(entry.date) ?? []), entry]));
  const dailyRows = Math.max(6, groups.size);
  Array.from(groups.entries()).forEach(([date, entries], rowIndex) => {
    const row = 15 + rowIndex;
    sheet.getCell(row, 1).value = new Date(`${date}T12:00:00`);
    sheet.getCell(row, 1).numFmt = "dd/mm/yyyy";
    sizeNames.forEach((size, index) => { sheet.getCell(row, 2 + index).value = entries.filter((entry) => entry.size === size).reduce((sum, entry) => sum + Number(entry.quantity), 0); });
    sheet.getCell(row, totalColumn).value = { formula: `SUM(B${row}:${sheet.getColumn(totalColumn - 1).letter}${row})` };
    sheet.getCell(row, observationColumn).value = Array.from(new Set(entries.map((entry) => entry.observations).filter(Boolean))).join("; ");
  });

  const processRow = 16 + dailyRows;
  section(processRow, "3. DATOS ESPECÍFICOS DEL PROCESO");
  const half = Math.floor(observationColumn / 2);
  sheet.mergeCells(processRow + 1, 1, processRow + 1, half);
  sheet.mergeCells(processRow + 1, half + 1, processRow + 1, observationColumn);
  sheet.getCell(processRow + 1, 1).value = "A) Si aplica a Prensa";
  sheet.getCell(processRow + 1, half + 1).value = "B) Si aplica a Inyectora";
  sheet.getCell(processRow + 2, 1).value = `Prensa N.°: ${order.pressNumber ?? ""}`;
  sheet.getCell(processRow + 3, 1).value = `Carga: ${order.pressLoad ?? ""}`;
  sheet.getCell(processRow + 2, half + 1).value = `Inyectora N.°: ${order.injectorNumber ?? ""}`;
  sheet.getCell(processRow + 3, half + 1).value = `Curva: ${order.curve ?? ""}`;
  sheet.mergeCells(processRow + 2, 1, processRow + 2, half);
  sheet.mergeCells(processRow + 3, 1, processRow + 3, half);
  sheet.mergeCells(processRow + 2, half + 1, processRow + 2, observationColumn);
  sheet.mergeCells(processRow + 3, half + 1, processRow + 3, observationColumn);

  for (let row = 9; row <= processRow + 3; row += 1) {
    for (let column = 1; column <= observationColumn; column += 1) {
      const cell = sheet.getCell(row, column);
      cell.border = box;
      cell.alignment = { horizontal: row === 13 || row === processRow ? "center" : column === observationColumn ? "left" : "center", vertical: "middle", wrapText: true };
    }
  }
  [10, 14, processRow + 1].forEach((row) => {
    sheet.getRow(row).font = { bold: true, color: { argb: navy } };
    sheet.getRow(row).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD8EEFC" } };
  });
  sheet.getColumn(1).width = 18;
  for (let column = 2; column < totalColumn; column += 1) sheet.getColumn(column).width = 11;
  sheet.getColumn(totalColumn).width = 12;
  sheet.getColumn(observationColumn).width = 28;
  sheet.pageSetup.printArea = `A1:${lastColumn}${processRow + 3}`;
  sheet.headerFooter.oddFooter = `&L${order.number}&RPágina &P de &N`;
  return workbook;
}
