import { describe, expect, it } from "vitest";
import { effectiveQuotationStatus, quotationTotals } from "@/modules/quotations/domain/quotation-calculations";

describe("quotationTotals", () => {
  it("calcula descuento, IGV y equivalente en soles sin perder precisión", () => {
    const result = quotationTotals([
      { quantity: "12", unitPrice: "8.50" },
      { quantity: "3", unitPrice: "25.40" },
    ], "10", "18", "3.75");

    expect(result.gross.toFixed(2)).toBe("178.20");
    expect(result.discount.toFixed(2)).toBe("17.82");
    expect(result.subtotal.toFixed(2)).toBe("160.38");
    expect(result.tax.toFixed(2)).toBe("28.87");
    expect(result.total.toFixed(2)).toBe("189.25");
    expect(result.totalPen.toFixed(2)).toBe("709.69");
  });
});

describe("effectiveQuotationStatus", () => {
  it("marca vencidos únicamente los borradores o enviados fuera de vigencia", () => {
    const now = new Date("2026-11-06T15:00:00.000Z");
    expect(effectiveQuotationStatus("SENT", new Date("2026-11-05T00:00:00.000Z"), now)).toBe("EXPIRED");
    expect(effectiveQuotationStatus("APPROVED", new Date("2026-11-05T00:00:00.000Z"), now)).toBe("APPROVED");
    expect(effectiveQuotationStatus("DRAFT", new Date("2026-11-06T00:00:00.000Z"), now)).toBe("DRAFT");
  });
});
