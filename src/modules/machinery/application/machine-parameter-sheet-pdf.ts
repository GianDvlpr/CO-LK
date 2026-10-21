import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const A4_PORTRAIT: [number, number] = [595.28, 841.89];
const navy = rgb(25 / 255, 56 / 255, 76 / 255);
const light = rgb(232 / 255, 239 / 255, 243 / 255);
const white = rgb(1, 1, 1);
const grid = rgb(135 / 255, 153 / 255, 163 / 255);
const muted = rgb(75 / 255, 85 / 255, 99 / 255);

const configurationLabels: Record<string, string> = {
  STATIC_INJECTOR: "Inyectora estática",
  ROTARY_INJECTOR: "Inyectora rotativa",
  CUSTOM: "Configuración personalizada",
};
const scopeLabels: Record<string, string> = { GENERAL: "General", STATION: "Estación", INJECTOR: "Inyector / canal", TEMPERATURE: "Temperatura" };
const date = new Intl.DateTimeFormat("es-PE", { dateStyle: "short", timeStyle: "short" });

export type MachineParameterSheetDocumentData = {
  revision: number;
  name: string;
  configurationType: string;
  application: string | null;
  material: string | null;
  notes: string | null;
  createdAt: Date;
  machine: { code: string; name: string; company: { name: string } };
  createdBy: { name: string; username: string };
  parameters: { scope: string; station: string | null; channel: string | null; groupName: string; parameter: string; value: string; unit: string | null; notes: string | null }[];
};

function fitText(font: PDFFont, text: string, size: number, maxWidth: number) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let value = text;
  while (value.length > 1 && font.widthOfTextAtSize(`${value}…`, size) > maxWidth) value = value.slice(0, -1);
  return `${value}…`;
}

function wrapText(font: PDFFont, text: string, size: number, maxWidth: number) {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const probe = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(probe, size) <= maxWidth) current = probe;
    else { if (current) lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines;
}

function cell(page: PDFPage, font: PDFFont, bold: PDFFont, inputValue: { x: number; top: number; width: number; height: number; text?: string; label?: boolean; dark?: boolean; center?: boolean; size?: number; boldText?: boolean }) {
  const { x, top, width, height } = inputValue;
  page.drawRectangle({ x, y: top - height, width, height, color: inputValue.dark ? navy : inputValue.label ? light : white, borderColor: grid, borderWidth: 0.6 });
  const selectedFont = inputValue.label || inputValue.dark || inputValue.boldText ? bold : font;
  const size = inputValue.size ?? 7;
  const text = fitText(selectedFont, inputValue.text ?? "", size, width - 6);
  const textWidth = selectedFont.widthOfTextAtSize(text, size);
  page.drawText(text, { x: inputValue.center ? x + Math.max(3, (width - textWidth) / 2) : x + 3, y: top - height + (height - size) / 2 + 1, size, font: selectedFont, color: inputValue.dark ? white : navy });
}

const columns = [210, 80, 50, 157.28, 34];

export async function buildMachineParameterSheetPdf(sheet: MachineParameterSheetDocumentData) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const [pageWidth, pageHeight] = A4_PORTRAIT;
  const margin = 32;
  const width = pageWidth - margin * 2;
  let page = document.addPage(A4_PORTRAIT);
  let top = pageHeight - margin;

  const revision = `REV. ${String(sheet.revision).padStart(2, "0")}`;
  const drawHeader = (continuation = false) => {
    const height = 32;
    page.drawRectangle({ x: margin, y: top - height, width, height, color: navy });
    const title = continuation ? "FICHA DE CONFIGURACIÓN DE MÁQUINA  |  CONTINUACIÓN" : `${sheet.machine.company.name}  |  FICHA DE CONFIGURACIÓN DE MÁQUINA`;
    page.drawText(fitText(bold, title, 9, width - 100), { x: margin + 8, y: top - height + 12, size: 9, font: bold, color: white });
    const revisionWidth = bold.widthOfTextAtSize(revision, 9);
    page.drawText(revision, { x: margin + width - revisionWidth - 8, y: top - height + 12, size: 9, font: bold, color: white });
    top -= height;
  };

  drawHeader();
  top -= 8;

  const half = width / 2;
  const labelWidth = 110;
  const info: [string, string, string, string][] = [
    ["Máquina", `${sheet.machine.code} · ${sheet.machine.name}`, "Tipo de configuración", configurationLabels[sheet.configurationType] ?? sheet.configurationType],
    ["Ficha", sheet.name, "Aplicación / producto", sheet.application ?? "—"],
    ["Material", sheet.material ?? "—", "Fecha y responsable", `${date.format(sheet.createdAt)} · ${sheet.createdBy.name || sheet.createdBy.username}`],
  ];
  info.forEach(([leftLabel, leftValue, rightLabel, rightValue]) => {
    cell(page, font, bold, { x: margin, top, width: labelWidth, height: 20, text: leftLabel, label: true, size: 6.6 });
    cell(page, font, bold, { x: margin + labelWidth, top, width: half - labelWidth, height: 20, text: leftValue, size: 7.4 });
    cell(page, font, bold, { x: margin + half, top, width: labelWidth, height: 20, text: rightLabel, label: true, size: 6.6 });
    cell(page, font, bold, { x: margin + half + labelWidth, top, width: half - labelWidth, height: 20, text: rightValue, size: 7.4 });
    top -= 20;
  });
  top -= 10;

  const groups = new Map<string, MachineParameterSheetDocumentData["parameters"]>();
  for (const parameter of sheet.parameters) {
    const key = [parameter.scope, parameter.station ?? "", parameter.channel ?? "", parameter.groupName].join("|");
    groups.set(key, [...(groups.get(key) ?? []), parameter]);
  }

  const drawTableHeader = () => {
    ["Parámetro", "Valor", "Unidad", "Observación", "Verificado"].forEach((label, index) => {
      const x = margin + columns.slice(0, index).reduce((sum, value) => sum + value, 0);
      cell(page, font, bold, { x, top, width: columns[index], height: 16, text: label, label: true, center: index === 4, size: 6.8 });
    });
    top -= 16;
  };
  const drawGroup = (context: string, parameters: MachineParameterSheetDocumentData["parameters"], first: boolean) => {
    if (!first && top - 18 - 16 - 16 < margin + 70) {
      page = document.addPage(A4_PORTRAIT);
      top = pageHeight - margin;
      drawHeader(true);
      top -= 8;
    }
    cell(page, bold, bold, { x: margin, top, width, height: 18, text: context, dark: true, size: 8 });
    top -= 18;
    drawTableHeader();
    for (const parameter of parameters) {
      if (top - 16 < margin + 90) {
        page = document.addPage(A4_PORTRAIT);
        top = pageHeight - margin;
        drawHeader(true);
        top -= 8;
        cell(page, bold, bold, { x: margin, top, width, height: 18, text: context, dark: true, size: 8 });
        top -= 18;
        drawTableHeader();
      }
      const values = [parameter.parameter, parameter.value, parameter.unit ?? "—", parameter.notes ?? "", ""];
      values.forEach((value, index) => {
        const x = margin + columns.slice(0, index).reduce((sum, current) => sum + current, 0);
        cell(page, font, bold, { x, top, width: columns[index], height: 16, text: value, center: index === 4, boldText: index === 1, size: index === 1 ? 7.6 : 6.6 });
      });
      top -= 16;
    }
    top -= 10;
  };

  Array.from(groups.entries()).forEach(([, parameters], index) => {
    const firstParameter = parameters[0];
    const context = [scopeLabels[firstParameter.scope] ?? firstParameter.scope, firstParameter.station, firstParameter.channel, firstParameter.groupName].filter(Boolean).join(" · ");
    drawGroup(context, parameters, index === 0);
  });

  if (top - 90 < margin) {
    page = document.addPage(A4_PORTRAIT);
    top = pageHeight - margin;
    drawHeader(true);
    top -= 8;
  }
  const notesHeight = 46;
  cell(page, font, bold, { x: margin, top, width, height: notesHeight, text: "", label: true });
  page.drawText("Observaciones generales", { x: margin + 4, y: top - 12, size: 6.4, font: bold, color: muted });
  const noteLines = wrapText(font, sheet.notes || "Sin observaciones.", 6.8, width - 12).slice(0, 2);
  noteLines.forEach((line, index) => page.drawText(line, { x: margin + 4, y: top - 26 - index * 9, size: 6.8, font, color: navy }));
  top -= notesHeight + 8;

  const warning = "Verificar la identificación de la máquina, estación, material, molde y condiciones de seguridad antes de aplicar estos valores. Esta ficha reproduce parámetros registrados por la empresa; no reemplaza el manual del fabricante ni la capacitación autorizada.";
  wrapText(font, warning, 6, width - 8).forEach((line, index) => page.drawText(line, { x: margin, y: top - index * 8, size: 6, font, color: muted }));

  document.setTitle(`Ficha de parámetros ${sheet.machine.code} · ${revision}`);
  document.setAuthor("LK INNOVACION");
  return document.save();
}
