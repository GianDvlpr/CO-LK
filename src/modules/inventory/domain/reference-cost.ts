import Decimal from "decimal.js";
import { DEFAULT_IGV_RATE } from "@/modules/purchases/domain/calculate-purchase-line";

export type ReferenceCostInput = {
  netPrice: Decimal.Value;
  taxRate?: Decimal.Value | null;
};

export type ReferenceCostValues = {
  referenceNetPrice: string | null;
  referenceTaxRate: string | null;
};

export function calculateReferenceTotalCost(input: ReferenceCostInput): Decimal {
  const netPrice = new Decimal(input.netPrice);
  if (!netPrice.isFinite() || netPrice.isNegative()) throw new Error("netPrice debe ser mayor o igual a cero.");
  const taxRate = new Decimal(input.taxRate ?? DEFAULT_IGV_RATE);
  if (!taxRate.isFinite() || taxRate.isNegative() || taxRate.greaterThan(100)) throw new Error("taxRate debe estar entre 0 y 100.");
  return netPrice.mul(new Decimal(1).add(taxRate.div(100))).toDecimalPlaces(6);
}

function isBlank(value: Decimal.Value | null | undefined) {
  return value === null || value === undefined || String(value).trim() === "";
}

export function normalizeReferenceCost(netPrice: Decimal.Value | null | undefined, taxRate: Decimal.Value | null | undefined, defaultRate: Decimal.Value = DEFAULT_IGV_RATE): ReferenceCostValues {
  if (isBlank(netPrice)) return { referenceNetPrice: null, referenceTaxRate: null };
  const net = new Decimal(netPrice as Decimal.Value);
  if (!net.isFinite() || net.isNegative()) throw new Error("referenceNetPrice debe ser mayor o igual a cero.");
  const rate = isBlank(taxRate) ? new Decimal(defaultRate) : new Decimal(taxRate as Decimal.Value);
  if (!rate.isFinite() || rate.isNegative() || rate.greaterThan(100)) throw new Error("referenceTaxRate debe estar entre 0 y 100.");
  return { referenceNetPrice: net.toString(), referenceTaxRate: rate.toString() };
}
