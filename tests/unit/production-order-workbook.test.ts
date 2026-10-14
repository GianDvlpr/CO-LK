import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildProductionOrderWorkbook } from "@/modules/production/application/production-order-workbook";
import { validateProductionSheetTotals } from "@/modules/production/domain/production-sheet";

describe("ficha de orden de producción", () => {
  it("genera un Excel con programación y registro diario", async () => {
    const workbook = await buildProductionOrderWorkbook({
      number: "OP-001", plannedAt: new Date("2026-10-14T12:00:00Z"), machineEquipment: "Equipo 1", operatorName: "Ana",
      modelLogo: "Modelo A", materialLoad: "PVC", seriesLot: "L-01", processType: "PRENSA", mold: "M-01", brandColor: "Azul",
      pressNumber: "P-02", pressLoad: "20 kg", injectorNumber: null, curve: null,
      sizeProgram: [{ size: "38", requestedPairs: 10 }, { size: "39", requestedPairs: 10 }],
      dailyProduction: [{ date: "2026-10-14", size: "38", quantity: 4, observations: "Inicio" }],
      productVariant: { product: { name: "Zapatilla" }, size: { name: "38" }, color: { name: "Azul" } },
    });
    const buffer = await workbook.xlsx.writeBuffer();
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(buffer);
    const sheet = reopened.getWorksheet("Orden de producción");
    expect(sheet?.getCell("A1").value).toBe("ORDEN DE PRODUCCIÓN");
    expect(sheet?.getCell("B10").value).toBe("38");
    expect(sheet?.getCell("B15").value).toBe(4);
  });

  it("rechaza una programación que no coincide con el plan", () => {
    const issue = validateProductionSheetTotals({ sizeProgram: [{ size: "38", requestedPairs: 9 }], dailyProduction: [] }, 10);
    expect(issue).toContain("debe sumar 10");
  });
});
