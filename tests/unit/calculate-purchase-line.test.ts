import { describe, expect, it } from "vitest";
import { calculatePurchaseLine } from "@/modules/purchases/domain/calculate-purchase-line";

describe("calculatePurchaseLine", () => {
  it("calcula cantidad base, subtotal, IGV y total", () => {
    const amounts = calculatePurchaseLine({ presentationQuantity: 25, contentPerUnit: 20, pricePerBaseUnit: "3.50" });
    expect(amounts.receivedQuantity.toString()).toBe("500");
    expect(amounts.subtotal.toString()).toBe("1750");
    expect(amounts.taxAmount.toString()).toBe("315");
    expect(amounts.total.toString()).toBe("2065");
  });

  it("rechaza cantidades no positivas", () => {
    expect(() => calculatePurchaseLine({ presentationQuantity: 0, contentPerUnit: 20, pricePerBaseUnit: 3.5 })).toThrow(
      "presentationQuantity debe ser mayor que cero",
    );
  });
});
