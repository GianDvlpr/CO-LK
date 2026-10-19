import { describe, expect, it } from "vitest";
import { calculateReferenceTotalCost, normalizeReferenceCost } from "@/modules/inventory/domain/reference-cost";

describe("costo de referencia del ítem", () => {
  it("agrega el IGV al precio neto de referencia", () => {
    expect(calculateReferenceTotalCost({ netPrice: "4.5", taxRate: 18 }).toString()).toBe("5.31");
  });

  it("usa 18 % cuando no se informa la tasa", () => {
    expect(calculateReferenceTotalCost({ netPrice: 10 }).toString()).toBe("11.8");
  });

  it("admite una tasa de IGV de cero", () => {
    expect(calculateReferenceTotalCost({ netPrice: 10, taxRate: 0 }).toString()).toBe("10");
  });

  it("rechaza precios netos negativos y tasas fuera de rango", () => {
    expect(() => calculateReferenceTotalCost({ netPrice: -1, taxRate: 18 })).toThrow();
    expect(() => calculateReferenceTotalCost({ netPrice: 10, taxRate: 101 })).toThrow();
  });
});

describe("normalización del costo de referencia", () => {
  it("convierte los campos vacíos en ausencia de referencia", () => {
    expect(normalizeReferenceCost("", null)).toEqual({ referenceNetPrice: null, referenceTaxRate: null });
    expect(normalizeReferenceCost(null, undefined)).toEqual({ referenceNetPrice: null, referenceTaxRate: null });
  });

  it("usa 18 % cuando hay precio neto y no se informa tasa", () => {
    expect(normalizeReferenceCost("4.5", null)).toEqual({ referenceNetPrice: "4.5", referenceTaxRate: "18" });
  });

  it("rechaza precios negativos y tasas inválidas", () => {
    expect(() => normalizeReferenceCost("-1", "18")).toThrow();
    expect(() => normalizeReferenceCost("4.5", "101")).toThrow();
    expect(() => normalizeReferenceCost("4.5", "-1")).toThrow();
  });
});
