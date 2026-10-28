import { describe, expect, it } from "vitest";
import { calculateProductionOutputCost } from "@/modules/production/domain/production-cost";

describe("calculateProductionOutputCost", () => {
  it("capitaliza materiales y las cuatro tarifas productivas", () => {
    const result = calculateProductionOutputCost({ materialCost: 400, laborCost: 80, energyCost: 35, waterCost: 5, machineryCost: 30, outputQuantity: 50 });
    expect(result.totalCost.toString()).toBe("550");
    expect(result.unitCost.toString()).toBe("11");
  });

  it("mantiene precisión decimal para salidas parciales", () => {
    const result = calculateProductionOutputCost({ materialCost: "123.4567", laborCost: "10.25", outputQuantity: "17.5" });
    expect(result.totalCost.toString()).toBe("133.7067");
    expect(result.unitCost.toString()).toBe("7.640383");
  });

  it("rechaza cantidades de salida nulas", () => {
    expect(() => calculateProductionOutputCost({ materialCost: 10, outputQuantity: 0 })).toThrow("mayor que cero");
  });
});
