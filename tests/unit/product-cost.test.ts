import { describe, expect, it } from "vitest";
import { calculateProductCost } from "@/modules/costs/domain/product-cost";

describe("calculateProductCost", () => {
  it("suma las cuatro tarifas al costo material y divide entre el rendimiento", () => {
    const result = calculateProductCost({
      materialCost: "400",
      laborTariff: "80",
      energyTariff: "20",
      waterTariff: "5",
      machineryCost: "15",
      yieldQuantity: "40",
    });

    expect(result.directCost.toString()).toBe("120");
    expect(result.batchCost.toString()).toBe("520");
    expect(result.unitCost.toString()).toBe("13");
  });

  it("rechaza costos negativos y rendimientos no positivos", () => {
    expect(() => calculateProductCost({ materialCost: 0, laborTariff: -1, energyTariff: 0, waterTariff: 0, machineryCost: 0, yieldQuantity: 1 })).toThrow("INVALID_COST");
    expect(() => calculateProductCost({ materialCost: 0, laborTariff: 0, energyTariff: 0, waterTariff: 0, machineryCost: 0, yieldQuantity: 0 })).toThrow("INVALID_YIELD");
  });
});
