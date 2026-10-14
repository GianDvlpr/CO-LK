import { describe, expect, it } from "vitest";
import { calculateMovingAverage } from "@/modules/inventory/domain/calculate-moving-average";

describe("calculateMovingAverage", () => {
  it("calcula costo promedio móvil y valor de inventario", () => {
    const result = calculateMovingAverage({ currentQuantity: 100, currentValue: 400, incomingQuantity: 50, incomingUnitCost: 7 });
    expect(result.onHandQuantity.toString()).toBe("150");
    expect(result.movementValue.toString()).toBe("350");
    expect(result.inventoryValue.toString()).toBe("750");
    expect(result.averageUnitCost.toString()).toBe("5");
  });

  it("rechaza una entrada sin cantidad positiva", () => {
    expect(() => calculateMovingAverage({ currentQuantity: 0, currentValue: 0, incomingQuantity: 0, incomingUnitCost: 4 })).toThrow(
      "cantidad positiva",
    );
  });
});
