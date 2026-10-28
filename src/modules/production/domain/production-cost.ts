import Decimal from "decimal.js";

export function calculateProductionOutputCost(input: {
  materialCost: Decimal.Value;
  laborCost?: Decimal.Value;
  energyCost?: Decimal.Value;
  waterCost?: Decimal.Value;
  machineryCost?: Decimal.Value;
  outputQuantity: Decimal.Value;
}) {
  const outputQuantity = new Decimal(input.outputQuantity);
  if (!outputQuantity.greaterThan(0)) throw new Error("La cantidad producida debe ser mayor que cero.");
  const costs = [input.materialCost, input.laborCost ?? 0, input.energyCost ?? 0, input.waterCost ?? 0, input.machineryCost ?? 0].map((value) => new Decimal(value));
  if (costs.some((value) => value.isNegative())) throw new Error("Los costos de producción no pueden ser negativos.");
  const totalCost = costs.reduce((total, value) => total.add(value), new Decimal(0)).toDecimalPlaces(4);
  return { totalCost, unitCost: totalCost.div(outputQuantity).toDecimalPlaces(6) };
}
