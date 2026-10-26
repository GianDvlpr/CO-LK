import { describe, expect, it } from "vitest";
import { calculateRecipeCost, resolveItemUnitCost } from "@/modules/recipes/domain/recipe-cost";

describe("costo unitario de ítem", () => {
  it("usa el promedio ponderado del stock disponible", () => {
    const cost = resolveItemUnitCost({
      balances: [
        { onHandQuantity: "10", averageUnitCost: "4" },
        { onHandQuantity: "30", averageUnitCost: "6" },
      ],
      referenceNetPrice: "100",
      referenceTaxRate: "18",
    });
    expect(cost.toFixed(2)).toBe("5.50");
  });

  it("usa el costo de referencia con IGV cuando no hay stock", () => {
    const cost = resolveItemUnitCost({ balances: [], referenceNetPrice: "10", referenceTaxRate: "18" });
    expect(cost.toFixed(2)).toBe("11.80");
  });

  it("devuelve cero cuando no hay stock ni referencia", () => {
    expect(resolveItemUnitCost({ balances: [], referenceNetPrice: null, referenceTaxRate: null }).toFixed(2)).toBe("0.00");
    expect(resolveItemUnitCost({ balances: [{ onHandQuantity: "0", averageUnitCost: "5" }], referenceNetPrice: null, referenceTaxRate: null }).toFixed(2)).toBe("0.00");
  });
});

describe("costo calculado de la receta", () => {
  it("suma cantidad por costo unitario de cada ingrediente", () => {
    const cost = calculateRecipeCost([
      { quantity: "2", unitCost: "5.5" },
      { quantity: "1.5", unitCost: "10" },
    ]);
    expect(cost.toFixed(2)).toBe("26.00");
  });

  it("devuelve cero sin ingredientes", () => {
    expect(calculateRecipeCost([]).toFixed(2)).toBe("0.00");
  });
});
