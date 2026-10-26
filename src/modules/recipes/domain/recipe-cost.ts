import Decimal from "decimal.js";

export type ItemCostBalance = { onHandQuantity: Decimal.Value; averageUnitCost: Decimal.Value };
export type ItemCostInput = {
  balances: ItemCostBalance[];
  referenceNetPrice: Decimal.Value | null;
  referenceTaxRate: Decimal.Value | null;
};

// Costo unitario de un ítem: promedio ponderado del stock disponible y, si no hay
// stock, el costo de referencia con IGV. Sin datos, cero.
export function resolveItemUnitCost(item: ItemCostInput): Decimal {
  let quantity = new Decimal(0);
  let value = new Decimal(0);
  for (const balance of item.balances) {
    const onHand = new Decimal(balance.onHandQuantity);
    if (!onHand.greaterThan(0)) continue;
    quantity = quantity.add(onHand);
    value = value.add(onHand.mul(new Decimal(balance.averageUnitCost)));
  }
  if (quantity.greaterThan(0)) return value.div(quantity).toDecimalPlaces(6);

  if (item.referenceNetPrice !== null && item.referenceNetPrice !== undefined) {
    const net = new Decimal(item.referenceNetPrice);
    const taxRate = item.referenceTaxRate !== null && item.referenceTaxRate !== undefined ? new Decimal(item.referenceTaxRate) : new Decimal(0);
    const total = net.mul(new Decimal(1).add(taxRate.div(100)));
    if (total.greaterThan(0)) return total.toDecimalPlaces(6);
  }
  return new Decimal(0);
}

export function calculateRecipeCost(ingredients: { quantity: Decimal.Value; unitCost: Decimal.Value }[]): Decimal {
  return ingredients
    .reduce((total, ingredient) => total.add(new Decimal(ingredient.quantity).mul(new Decimal(ingredient.unitCost))), new Decimal(0))
    .toDecimalPlaces(6);
}
