import Decimal from "decimal.js";

export type ProductCostInput = {
  materialCost: Decimal.Value;
  laborTariff: Decimal.Value;
  energyTariff: Decimal.Value;
  waterTariff: Decimal.Value;
  machineryCost: Decimal.Value;
  yieldQuantity: Decimal.Value;
};

export function calculateProductCost(input: ProductCostInput) {
  const yieldQuantity = new Decimal(input.yieldQuantity);
  if (!yieldQuantity.isFinite() || !yieldQuantity.greaterThan(0)) {
    throw new Error("INVALID_YIELD");
  }

  const amounts = [input.materialCost, input.laborTariff, input.energyTariff, input.waterTariff, input.machineryCost]
    .map((value) => new Decimal(value));
  if (amounts.some((value) => !value.isFinite() || value.isNegative())) {
    throw new Error("INVALID_COST");
  }

  const [materialCost, laborTariff, energyTariff, waterTariff, machineryCost] = amounts;
  const directCost = laborTariff.add(energyTariff).add(waterTariff).add(machineryCost);
  const batchCost = materialCost.add(directCost);

  return {
    materialCost: materialCost.toDecimalPlaces(6),
    directCost: directCost.toDecimalPlaces(6),
    batchCost: batchCost.toDecimalPlaces(6),
    unitCost: batchCost.div(yieldQuantity).toDecimalPlaces(6),
  };
}
