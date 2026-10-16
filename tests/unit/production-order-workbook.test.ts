import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildProductionOrderWorkbook } from "@/modules/production/application/production-order-workbook";
import { validateProductionSheetTotals } from "@/modules/production/domain/production-sheet";

describe("ficha de orden de producción", () => {
  it("genera un Excel con curvas por talla y color y solo el bloque técnico elegido", async () => {
    const workbook = await buildProductionOrderWorkbook({
      number: "OP-001", plannedAt: new Date("2026-10-14T12:00:00Z"), machineEquipment: "Equipo 1", operatorName: "Ana",
      modelLogo: "Modelo A", materialLoad: "PVC", seriesLot: "L-01", processType: "PRENSA", mold: "M-01", brandColor: "Azul",
      pressNumber: "P-02", pressLoad: "20 kg", injectorNumber: null, curve: null,
      sizeProgram: [{ sku: "A-38-A", size: "38", color: "Azul", requestedPairs: 6 }, { sku: "A-39-A", size: "39", color: "Azul", requestedPairs: 4 }, { sku: "A-38-R", size: "38", color: "Rojo", requestedPairs: 10 }],
      dailyProduction: [{ date: "2026-10-14", size: "38", color: "Azul", quantity: 4, observations: "Inicio" }],
      productVariant: { product: { name: "Zapatilla" }, size: { name: "38" }, color: { name: "Azul" } },
    });
    const buffer = await workbook.xlsx.writeBuffer();
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(buffer);
    const sheet = reopened.getWorksheet("Orden de producción");
    expect(sheet?.getCell("A1").value).toBe("ORDEN DE PRODUCCIÓN");
    expect(sheet?.getCell("C10").value).toBe("38");
    expect(sheet?.getCell("C11").value).toBe(6);
    expect(sheet?.getCell("B17").value).toBe("Azul");
    expect(sheet?.getCell("C17").value).toBe(4);
    const values = sheet?.getSheetValues().flat(2).filter(Boolean) ?? [];
    expect(values).toContain("Prensa");
    expect(values).not.toContain("Inyectora");
  });

  it("omite por completo los datos técnicos cuando se elige Ninguno", async () => {
    const workbook = await buildProductionOrderWorkbook({
      number: "OP-002", plannedAt: null, machineEquipment: null, operatorName: null, modelLogo: null, materialLoad: null, seriesLot: null,
      processType: "NINGUNO", mold: null, brandColor: "Negro", pressNumber: null, pressLoad: null, injectorNumber: null, curve: null,
      sizeProgram: [{ size: "40", color: "Negro", requestedPairs: 12 }], dailyProduction: [],
      productVariant: { product: { name: "Suela" }, size: { name: "40" }, color: { name: "Negro" } },
    });
    const values = workbook.getWorksheet("Orden de producción")?.getSheetValues().flat(2).filter(Boolean) ?? [];
    expect(values).not.toContain("3. DATOS ESPECÍFICOS DEL PROCESO");
  });

  it("rechaza una programación que no coincide con el plan", () => {
    const issue = validateProductionSheetTotals({ sizeProgram: [{ size: "38", color: "Negro", requestedPairs: 9 }], dailyProduction: [] }, 10);
    expect(issue).toContain("debe sumar 10");
  });

  it("permite la misma talla en colores distintos y controla cada curva", () => {
    const input = { sizeProgram: [{ size: "38", color: "Negro", requestedPairs: 5 }, { size: "38", color: "Blanco", requestedPairs: 5 }], dailyProduction: [{ date: new Date(), size: "38", color: "Negro", quantity: 6 }] };
    expect(validateProductionSheetTotals(input, 10)).toContain("supera los pares programados");
  });
});
