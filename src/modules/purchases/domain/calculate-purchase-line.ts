import Decimal from "decimal.js";

export const DEFAULT_IGV_RATE = new Decimal(18);

export type PurchaseLineAmountsInput = {
  presentationQuantity: Decimal.Value;
  contentPerUnit: Decimal.Value;
  pricePerBaseUnit: Decimal.Value;
  taxRate?: Decimal.Value;
};

export function calculatePurchaseLine(input: PurchaseLineAmountsInput) {
  const positive = (value: Decimal.Value, field: string) => {
    const decimal = new Decimal(value);
    if (!decimal.greaterThan(0)) throw new Error(`${field} debe ser mayor que cero.`);
    return decimal;
  };

  const presentationQuantity = positive(input.presentationQuantity, "presentationQuantity");
  const contentPerUnit = positive(input.contentPerUnit, "contentPerUnit");
  const pricePerBaseUnit = positive(input.pricePerBaseUnit, "pricePerBaseUnit");
  const taxRate = new Decimal(input.taxRate ?? DEFAULT_IGV_RATE);
  if (taxRate.isNegative() || taxRate.greaterThan(100)) throw new Error("taxRate debe estar entre 0 y 100.");

  const receivedQuantity = presentationQuantity.mul(contentPerUnit).toDecimalPlaces(6);
  const subtotal = receivedQuantity.mul(pricePerBaseUnit).toDecimalPlaces(4);
  const taxAmount = subtotal.mul(taxRate).div(100).toDecimalPlaces(4);
  const total = subtotal.add(taxAmount).toDecimalPlaces(4);

  return { receivedQuantity, subtotal, taxAmount, total };
}
