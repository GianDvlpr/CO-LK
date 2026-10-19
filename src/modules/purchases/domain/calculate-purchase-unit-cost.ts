import Decimal from "decimal.js";
import { DEFAULT_IGV_RATE } from "./calculate-purchase-line";

export type PurchaseUnitCostInput = {
  pricePerBaseUnit: Decimal.Value;
  taxRate?: Decimal.Value | null;
  exchangeRate: Decimal.Value;
};

export function calculatePurchaseUnitCost(input: PurchaseUnitCostInput): Decimal {
  const pricePerBaseUnit = new Decimal(input.pricePerBaseUnit);
  if (!pricePerBaseUnit.isFinite() || !pricePerBaseUnit.greaterThan(0)) throw new Error("pricePerBaseUnit debe ser mayor que cero.");
  const taxRate = new Decimal(input.taxRate ?? DEFAULT_IGV_RATE);
  if (!taxRate.isFinite() || taxRate.isNegative() || taxRate.greaterThan(100)) throw new Error("taxRate debe estar entre 0 y 100.");
  const exchangeRate = new Decimal(input.exchangeRate);
  if (!exchangeRate.isFinite() || !exchangeRate.greaterThan(0)) throw new Error("exchangeRate debe ser mayor que cero.");
  return pricePerBaseUnit.mul(new Decimal(1).add(taxRate.div(100))).mul(exchangeRate).toDecimalPlaces(6);
}
