import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildProductionOrderPdf } from "@/modules/production/application/production-order-pdf";
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

  it("genera un PDF A5 descargable", async () => {
    const pdf = await buildProductionOrderPdf(documentData);
    expect(new TextDecoder().decode(pdf.slice(0, 4))).toBe("%PDF");
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
