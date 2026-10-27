import Decimal from "decimal.js";

export const BASE_COST_CURRENCY = "PEN";

export type ItemCostInput = { referenceNetPrice: Decimal.Value | null };

// Costo unitario del insumo: precio de referencia neto (sin IGV) en su moneda.
export function resolveItemUnitCost(item: ItemCostInput): Decimal {
  if (item.referenceNetPrice === null || item.referenceNetPrice === undefined) return new Decimal(0);
  const net = new Decimal(item.referenceNetPrice);
  if (!net.isFinite() || net.isNegative() || !net.greaterThan(0)) return new Decimal(0);
  return net.toDecimalPlaces(6);
}

export type RecipeCostIngredient = { quantity: Decimal.Value; unitCost: Decimal.Value; currencyCode: string };

// Suma el costo en la moneda común de los insumos. Si hay monedas distintas, convierte
// a la moneda base (PEN) con las tasas vigentes; los insumos sin tasa aportan cero.
export function calculateRecipeCost(ingredients: RecipeCostIngredient[], rates: Map<string, Decimal>) {
  const currencies = new Set<string>();
  for (const ingredient of ingredients) {
    const cost = new Decimal(ingredient.quantity).mul(new Decimal(ingredient.unitCost));
    if (!cost.greaterThan(0)) continue;
    currencies.add(ingredient.currencyCode);
  }
  const singleCurrency = currencies.size === 1 ? [...currencies][0] : null;
  const target = singleCurrency ?? BASE_COST_CURRENCY;
  const missingRates = new Set<string>();
  let amount = new Decimal(0);

  for (const ingredient of ingredients) {
    const cost = new Decimal(ingredient.quantity).mul(new Decimal(ingredient.unitCost));
    if (!cost.greaterThan(0)) continue;
    if (ingredient.currencyCode === target) { amount = amount.add(cost); continue; }
    const rate = rates.get(ingredient.currencyCode);
    if (!rate) { missingRates.add(ingredient.currencyCode); continue; }
    amount = amount.add(cost.mul(rate));
  }

  return { amount: amount.toDecimalPlaces(6), currency: target, missingRates: [...missingRates] };
}
