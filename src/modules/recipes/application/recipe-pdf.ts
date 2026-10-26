import Decimal from "decimal.js";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { sanitizeWinAnsi } from "@/lib/pdf/winansi";

const A5_LANDSCAPE: [number, number] = [595.28, 419.53];
const navy = rgb(23 / 255, 56 / 255, 77 / 255);
const light = rgb(232 / 255, 240 / 255, 244 / 255);
const white = rgb(1, 1, 1);
const grid = rgb(113 / 255, 135 / 255, 149 / 255);
const muted = rgb(82 / 255, 100 / 255, 109 / 255);

const limaDate = new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Lima" });
const statusLabels: Record<string, string> = { DRAFT: "Borrador", ACTIVE: "Activa", INACTIVE: "Inactiva" };

export type RecipeDocumentData = {
  code: string;
  name: string;
  status: string;
  product: { code: string; name: string } | null;
  outputItem: { code: string; name: string; unit: { symbol: string } } | null;
  versions: {
    version: number;
    yieldQuantity: unknown;
    calculatedCost: unknown | null;
    manualCost: unknown | null;
    notes: string | null;
    isActive: boolean;
    createdAt: Date;
    ingredients: { id: string; quantity: unknown; item: { code: string; name: string; unit: { symbol: string } } }[];
  }[];
};

function fitText(font: PDFFont, text: string, size: number, maxWidth: number) {
  const safe = sanitizeWinAnsi(text);
  if (font.widthOfTextAtSize(safe, size) <= maxWidth) return safe;
  let value = safe;
  while (value.length > 1 && font.widthOfTextAtSize(`${value}…`, size) > maxWidth) value = value.slice(0, -1);
  return `${value}…`;
}

function cell(page: PDFPage, font: PDFFont, bold: PDFFont, inputValue: { x: number; top: number; width: number; height: number; text?: string; label?: boolean; dark?: boolean; center?: boolean; size?: number }) {
  const { x, top, width, height } = inputValue;
  page.drawRectangle({ x, y: top - height, width, height, color: inputValue.dark ? navy : inputValue.label ? light : white, borderColor: grid, borderWidth: 0.55 });
  const selectedFont = inputValue.label || inputValue.dark ? bold : font;
  const size = inputValue.size ?? 6.4;
  const text = fitText(selectedFont, inputValue.text ?? "", size, width - 6);
  const textWidth = selectedFont.widthOfTextAtSize(text, size);
  page.drawText(text, { x: inputValue.center ? x + Math.max(3, (width - textWidth) / 2) : x + 3, y: top - height + (height - size) / 2 + 1, size, font: selectedFont, color: inputValue.dark ? white : navy });
}

const ingredientWidths = [90, 321.28, 90, 70];
const ingredientRowHeight = 14;
const firstPageRows = 14;
const continuationRows = 20;

export async function buildRecipePdf(recipe: RecipeDocumentData) {
  const version = recipe.versions[0];
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const [pageWidth, pageHeight] = A5_LANDSCAPE;
  const margin = 12;
  const width = pageWidth - margin * 2;
  let page = document.addPage(A5_LANDSCAPE);
  let top = pageHeight - margin;

  const drawHeader = (text: string) => {
    cell(page, font, bold, { x: margin, top, width, height: 20, text, dark: true, size: 8 });
    top -= 20;
  };
  const drawTableHeader = () => {
    ["Código", "Material / insumo", "Cantidad estándar", "Unidad"].forEach((label, index) => {
      const x = margin + ingredientWidths.slice(0, index).reduce((sum, value) => sum + value, 0);
      cell(page, font, bold, { x, top, width: ingredientWidths[index], height: 14, text: label, label: true, center: index >= 2, size: 5.8 });
    });
    top -= 14;
  };

  drawHeader(`LK INNOVACION DE SUELAS PARA CALZADO  |  RECETA  |  ${recipe.code}`);

  const half = width / 2;
  const labelWidth = 92;
  const yieldQuantity = new Decimal(String(version.yieldQuantity));
  const yieldLabel = recipe.product ? `${yieldQuantity.toFixed(0)} pares` : `${yieldQuantity.toFixed(3)} ${recipe.outputItem?.unit.symbol ?? "und."}`;
  const destination = recipe.product
    ? `Producción · ${recipe.product.code} · ${recipe.product.name}`
    : recipe.outputItem
      ? `Almacén · ${recipe.outputItem.code} · ${recipe.outputItem.name}`
      : "—";
  const info: [string, string, string, string][] = [
    ["Nombre", recipe.name, "Estado", statusLabels[recipe.status] ?? recipe.status],
    ["Destino", destination, "Rendimiento", yieldLabel],
    ["Versión", `${version.version} · ${version.isActive ? "activa" : "borrador"}`, "Fecha de emisión", limaDate.format(version.createdAt)],
    ["Costo calculado", `S/ ${new Decimal(String(version.calculatedCost ?? 0)).toFixed(2)}`, "Costo manual", version.manualCost === null || version.manualCost === undefined ? "—" : `S/ ${new Decimal(String(version.manualCost)).toFixed(2)}`],
  ];
  info.forEach(([leftLabel, leftValue, rightLabel, rightValue]) => {
    cell(page, font, bold, { x: margin, top, width: labelWidth, height: 14, text: leftLabel, label: true, size: 6 });
    cell(page, font, bold, { x: margin + labelWidth, top, width: half - labelWidth, height: 14, text: leftValue, size: 6.4 });
    cell(page, font, bold, { x: margin + half, top, width: labelWidth, height: 14, text: rightLabel, label: true, size: 6 });
    cell(page, font, bold, { x: margin + half + labelWidth, top, width: half - labelWidth, height: 14, text: rightValue, size: 6.4 });
    top -= 14;
  });
  top -= 5;

  cell(page, bold, bold, { x: margin, top, width, height: 14, text: "INGREDIENTES", dark: true, size: 6.6 });
  top -= 14;
  drawTableHeader();

  const ingredients = version.ingredients;
  const drawIngredient = (ingredient: RecipeDocumentData["versions"][number]["ingredients"][number]) => {
    const values = [ingredient.item.code, ingredient.item.name, new Decimal(String(ingredient.quantity)).toFixed(3), ingredient.item.unit.symbol];
    values.forEach((value, index) => {
      const x = margin + ingredientWidths.slice(0, index).reduce((sum, current) => sum + current, 0);
      cell(page, font, bold, { x, top, width: ingredientWidths[index], height: ingredientRowHeight, text: value, center: index >= 2, size: 6.2 });
    });
    top -= ingredientRowHeight;
  };

  ingredients.slice(0, firstPageRows).forEach(drawIngredient);
  let index = Math.min(ingredients.length, firstPageRows);
  while (index < ingredients.length) {
    page = document.addPage(A5_LANDSCAPE);
    top = pageHeight - margin;
    drawHeader(`RECETA ${recipe.code}  |  CONTINUACIÓN`);
    cell(page, bold, bold, { x: margin, top, width, height: 14, text: "INGREDIENTES", dark: true, size: 6.6 });
    top -= 14;
    drawTableHeader();
    const chunk = ingredients.slice(index, index + continuationRows);
    chunk.forEach(drawIngredient);
    index += chunk.length;
  }

  if (top - 26 - 12 < margin) {
    page = document.addPage(A5_LANDSCAPE);
    top = pageHeight - margin;
    drawHeader(`RECETA ${recipe.code}  |  CONTINUACIÓN`);
  }
  cell(page, font, bold, { x: margin, top, width, height: 26, text: `Notas de versión: ${version.notes || "Sin notas."}`, label: true, size: 6 });
  top -= 26;
  page.drawText("La receta no incluye merma teórica; la merma real se registra al ejecutar el destino.", { x: margin, y: Math.max(margin, top - 6), size: 5.2, font, color: muted });

  document.setTitle(`Receta ${recipe.code} · versión ${version.version}`);
  document.setAuthor("LK INNOVACION");
  return document.save();
}
