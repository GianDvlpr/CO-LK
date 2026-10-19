import { describe, expect, it } from "vitest";
import { calculatePurchaseUnitCost } from "@/modules/purchases/domain/calculate-purchase-unit-cost";

describe("costo unitario de compra", () => {
  it("valoriza en soles con IGV incluido", () => {
    expect(calculatePurchaseUnitCost({ pricePerBaseUnit: 3, taxRate: 18, exchangeRate: 1 }).toString()).toBe("3.54");
  });

  it("convierte a soles cuando la compra está en otra moneda", () => {
    expect(calculatePurchaseUnitCost({ pricePerBaseUnit: 4.5, taxRate: 18, exchangeRate: 3.75 }).toString()).toBe("19.9125");
  });

  it("usa 18 % por defecto y permite tasa cero", () => {
    expect(calculatePurchaseUnitCost({ pricePerBaseUnit: 10, exchangeRate: 1 }).toString()).toBe("11.8");
    expect(calculatePurchaseUnitCost({ pricePerBaseUnit: 10, taxRate: 0, exchangeRate: 1 }).toString()).toBe("10");
  });

  it("rechaza valores inválidos", () => {
    expect(() => calculatePurchaseUnitCost({ pricePerBaseUnit: -1, taxRate: 18, exchangeRate: 1 })).toThrow();
    expect(() => calculatePurchaseUnitCost({ pricePerBaseUnit: 10, taxRate: 101, exchangeRate: 1 })).toThrow();
    expect(() => calculatePurchaseUnitCost({ pricePerBaseUnit: 10, taxRate: 18, exchangeRate: 0 })).toThrow();
  });
});
