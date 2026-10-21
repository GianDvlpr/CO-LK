import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildBlankProductionOrderPdf, buildProductionOrderPdf } from "@/modules/production/application/production-order-pdf";
import { skuPattern } from "@/modules/production/application/production-order-document";
import { buildProductionOrderWorkbook } from "@/modules/production/application/production-order-workbook";
import { validateProductionSheetTotals } from "@/modules/production/domain/production-sheet";

const documentData = {
  number: "OP-2026-000001", status: "IN_PROGRESS", priority: 1, createdAt: new Date("2026-10-14T12:00:00Z"), plannedAt: new Date("2026-10-15T12:00:00Z"),
  operatorName: "Ana", modelLogo: "LK", brandColor: "Blanco", machine: { code: "MAQ-01", name: "Prensa 1" }, salesOrders: [{ salesOrder: { number: "PED-2026-000001" } }, { salesOrder: { number: "PED-2026-000002" } }], materialItem: { code: "MP-001", name: "TR" },
  productVariant: { sku: "I0034-NEG-ROJ-38", product: { code: "PROD-2026-000001", matrixCode: "I0034", name: "Suela Urbana" }, size: { name: "38" }, color: { code: "NEG", name: "Negro" }, secondaryColor: { code: "ROJ", name: "Rojo" } },
  recipeVersion: { recipe: { code: "REC-001", name: "Formulación negra" } }, secondaryRecipeVersion: { recipe: { code: "REC-002", name: "Formulación roja" } },
  sizeProgram: [
    { productVariantId: "00000000-0000-0000-0000-000000000038", sku: "I0034-NEG-ROJ-38", size: "38", requestedPairs: 6 },
    { productVariantId: "00000000-0000-0000-0000-000000000039", sku: "I0034-NEG-ROJ-39", size: "39", requestedPairs: 4 },
  ],
  productionTurns: [{ date: "2026-10-15", quantities: [{ productVariantId: "00000000-0000-0000-0000-000000000038", size: "38", quantity: 4 }, { productVariantId: "00000000-0000-0000-0000-000000000039", size: "39", quantity: 2 }], observations: "Inicio" }],
  components: [{ componentType: "CERCO_VIRA", quantity: "10", colorDetail: "Negro", item: { code: "CMP-001", name: "Cerco", unit: { symbol: "UND" } } }],
};

describe("orden de producción A5", () => {
  it("muestra las tallas reales en el SKU cuando la orden tiene varias tallas", () => {
    expect(skuPattern(documentData)).toBe("I0034-NEG-ROJ-38, I0034-NEG-ROJ-39");
    expect(skuPattern(documentData)).not.toContain("{TALLA}");
  });

  it("muestra un solo SKU cuando la orden tiene una sola talla", () => {
    expect(skuPattern({ ...documentData, sizeProgram: [documentData.sizeProgram[0]] })).toBe("I0034-NEG-ROJ-38");
  });

  it("genera un Excel A5 con dos colores, componentes, tallas y turnos", async () => {
    const workbook = await buildProductionOrderWorkbook(documentData);
    const buffer = await workbook.xlsx.writeBuffer();
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(buffer);
    const sheet = reopened.getWorksheet("Orden de producción");
    expect(sheet?.getCell("A1").value).toContain("LK INNOVACION");
    expect(sheet?.getCell("B19").value).toBe("38");
    expect(sheet?.getCell("B20").value).toBe(6);
    expect(sheet?.getCell("B21").value).toBe(4);
    expect(sheet?.pageSetup.paperSize).toBe(11);
    const values = sheet?.getSheetValues().flat(2).filter(Boolean) ?? [];
    expect(values).toContain("Formulación C2");
    expect(values).toContain("Rojo");
    expect(values).toContain("PED-2026-000001, PED-2026-000002");
    expect(values).toContain("TOTAL ESPERADO");
    expect(values).not.toContain("Serie / modelo");
  });

  it("usa letra mayor solo en el contenido y deja las observaciones en una línea", async () => {
    const workbook = await buildProductionOrderWorkbook(documentData);
    const sheet = workbook.getWorksheet("Orden de producción");
    expect(sheet?.getCell(1, 1).font.size).toBe(10);
    expect(sheet?.getCell(9, 1).font.size).toBe(9);
    expect(sheet?.getCell(2, 1).font.size).toBe(8);
    expect(sheet?.getCell(2, 3).font.size).toBe(9);
    expect(sheet?.getRow(2).height).toBe(19);
    expect(sheet?.getRow(11).height).toBe(19);
    expect(sheet?.getCell(11, 3).font.size).toBe(9);
    expect(sheet?.getRow(24).height).toBe(15);
    expect(sheet?.getCell(24, 1).font.size).toBe(8);
  });

  it("genera un PDF A5 descargable", async () => {
    const pdf = await buildProductionOrderPdf(documentData);
    expect(new TextDecoder().decode(pdf.slice(0, 4))).toBe("%PDF");
  });

  it("genera un formato en blanco A5 de una sola página", async () => {
    const pdf = await buildBlankProductionOrderPdf();
    expect(new TextDecoder().decode(pdf.slice(0, 4))).toBe("%PDF");
    const document = await PDFDocument.load(pdf);
    expect(document.getPageCount()).toBe(1);
    const { width, height } = document.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(420);
  });

  it("rechaza una programación que no coincide con el plan", () => {
    const issue = validateProductionSheetTotals({
      sizeProgram: [{ productVariantId: "00000000-0000-0000-0000-000000000038", size: "38", requestedPairs: 9 }],
      productionTurns: [], components: [],
    }, 10);
    expect(issue).toContain("debe sumar 10");
  });

  it("controla que un turno no supere lo programado por talla", () => {
    const issue = validateProductionSheetTotals({
      sizeProgram: [{ productVariantId: "00000000-0000-0000-0000-000000000038", size: "38", requestedPairs: 5 }],
      productionTurns: [{ date: new Date(), quantities: [{ productVariantId: "00000000-0000-0000-0000-000000000038", size: "38", quantity: 6 }], observations: "" }],
      components: [],
    }, 5);
    expect(issue).toContain("supera los pares programados");
  });
});
