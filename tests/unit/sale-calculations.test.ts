import { describe, expect, it } from "vitest";
import { paymentSummary, saleTotals } from "@/modules/sales/domain/sale-calculations";

describe("saleTotals", () => {
  it("calcula descuento, IGV y conversión monetaria con decimales", () => {
    const result = saleTotals([{ quantity: "5", unitPrice: "18.80" }], "5", "18", "3.75");
    expect(result.gross.toFixed(2)).toBe("94.00");
    expect(result.discount.toFixed(2)).toBe("4.70");
    expect(result.subtotal.toFixed(2)).toBe("89.30");
    expect(result.tax.toFixed(2)).toBe("16.07");
    expect(result.total.toFixed(2)).toBe("105.37");
    expect(result.totalPen.toFixed(2)).toBe("395.14");
  });
});

describe("paymentSummary", () => {
  it("distingue pagos pendientes, parciales y completos", () => {
    expect(paymentSummary("100", []).status).toBe("PENDING");
    expect(paymentSummary("100", [{ amount: "40" }])).toMatchObject({ status: "PARTIAL" });
    expect(paymentSummary("100", [{ amount: "40" }, { amount: "60" }])).toMatchObject({ status: "PAID" });
  });
});
