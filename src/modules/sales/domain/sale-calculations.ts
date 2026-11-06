import Decimal from "decimal.js";

export type SaleAmountLine = { quantity: Decimal.Value; unitPrice: Decimal.Value };

export function saleTotals(lines: SaleAmountLine[], discountRate: Decimal.Value, taxRate: Decimal.Value, exchangeRate: Decimal.Value) {
  const gross = lines.reduce((sum, line) => sum.add(new Decimal(line.quantity).mul(line.unitPrice)), new Decimal(0));
  const discount = gross.mul(discountRate).div(100).toDecimalPlaces(2);
  const subtotal = gross.sub(discount).toDecimalPlaces(2);
  const tax = subtotal.mul(taxRate).div(100).toDecimalPlaces(2);
  const total = subtotal.add(tax).toDecimalPlaces(2);
  return { gross: gross.toDecimalPlaces(2), discount, subtotal, tax, total, totalPen: total.mul(exchangeRate).toDecimalPlaces(2) };
}

export function paymentSummary(total: Decimal.Value, payments: { amount: Decimal.Value }[]) {
  const paid = payments.reduce((sum, payment) => sum.add(payment.amount), new Decimal(0)).toDecimalPlaces(2);
  const balance = Decimal.max(new Decimal(total).sub(paid), 0).toDecimalPlaces(2);
  const status = paid.isZero() ? "PENDING" : balance.isZero() ? "PAID" : "PARTIAL";
  return { paid, balance, status } as const;
}
