import Decimal from "decimal.js";

export type QuotationAmountInput = {
  quantity: Decimal.Value;
  unitPrice: Decimal.Value;
};

export function quotationTotals(
  lines: QuotationAmountInput[],
  discountRate: Decimal.Value,
  taxRate: Decimal.Value,
  exchangeRate: Decimal.Value,
) {
  const gross = lines.reduce((sum, line) => sum.add(new Decimal(line.quantity).mul(line.unitPrice)), new Decimal(0));
  const discount = gross.mul(discountRate).div(100).toDecimalPlaces(2);
  const subtotal = gross.sub(discount).toDecimalPlaces(2);
  const tax = subtotal.mul(taxRate).div(100).toDecimalPlaces(2);
  const total = subtotal.add(tax).toDecimalPlaces(2);
  return {
    gross: gross.toDecimalPlaces(2),
    discount,
    subtotal,
    tax,
    total,
    totalPen: total.mul(exchangeRate).toDecimalPlaces(2),
  };
}

function limaDateKey(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function effectiveQuotationStatus(status: string, validUntil: Date, now = new Date()) {
  if ((status === "DRAFT" || status === "SENT") && validUntil.toISOString().slice(0, 10) < limaDateKey(now)) return "EXPIRED";
  return status;
}
