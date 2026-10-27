import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateRecipeCost, resolveItemUnitCost } from "@/modules/recipes/domain/recipe-cost";

describe("costo unitario del insumo", () => {
  it("toma el precio de referencia neto (sin IGV)", () => {
    expect(resolveItemUnitCost({ referenceNetPrice: "10" }).toFixed(2)).toBe("10.00");
  });

  it("devuelve cero cuando no hay precio de referencia", () => {
    expect(resolveItemUnitCost({ referenceNetPrice: null }).toFixed(2)).toBe("0.00");
    expect(resolveItemUnitCost({ referenceNetPrice: "0" }).toFixed(2)).toBe("0.00");
  });
});

describe("costo calculado de la receta", () => {
  it("suma en la moneda única de los insumos", () => {
    const result = calculateRecipeCost([
      { quantity: "2", unitCost: "5", currencyCode: "USD" },
      { quantity: "1", unitCost: "10", currencyCode: "USD" },
    ], new Map());
    expect(result.amount.toFixed(2)).toBe("20.00");
    expect(result.currency).toBe("USD");
  });

  it("convierte a soles cuando hay monedas distintas", () => {
    const result = calculateRecipeCost([
      { quantity: "2", unitCost: "5", currencyCode: "PEN" },
      { quantity: "1", unitCost: "10", currencyCode: "USD" },
    ], new Map([["USD", new Decimal("3.7")]]));
    expect(result.amount.toFixed(2)).toBe("47.00");
    expect(result.currency).toBe("PEN");
    expect(result.missingRates).toEqual([]);
  });

  it("marca las monedas sin tasa de cambio y no las suma", () => {
    const result = calculateRecipeCost([
      { quantity: "1", unitCost: "10", currencyCode: "USD" },
      { quantity: "1", unitCost: "10", currencyCode: "PEN" },
    ], new Map());
    expect(result.amount.toFixed(2)).toBe("10.00");
    expect(result.currency).toBe("PEN");
    expect(result.missingRates).toEqual(["USD"]);
  });

  it("devuelve cero cuando ningún insumo tiene costo", () => {
    const result = calculateRecipeCost([{ quantity: "2", unitCost: "0", currencyCode: "PEN" }], new Map());
    expect(result.amount.toFixed(2)).toBe("0.00");
    expect(result.currency).toBe("PEN");
  });
});
