import { describe, expect, it } from "vitest";
import { buildProductSku, normalizeMatrixCode } from "@/modules/products/domain/product-sku";

describe("SKU de productos", () => {
  it("genera SKU monocolor con matriz, color y talla", () => {
    expect(buildProductSku({ matrixCode: "I0034", primaryColorCode: "NEG", sizeCode: "39" })).toBe("I0034-NEG-39");
  });

  it("incluye C1 y C2 para una suela bicolor", () => {
    expect(buildProductSku({ matrixCode: "I0034", primaryColorCode: "NEG", secondaryColorCode: "ROJ", sizeCode: "39" })).toBe("I0034-NEG-ROJ-39");
  });

  it("normaliza el código interno de matriz", () => {
    expect(normalizeMatrixCode(" matriz í-34 ")).toBe("MATRIZ-I-34");
  });
});
