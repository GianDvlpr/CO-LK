import Decimal from "decimal.js";

type MovingAverageInput = {
  currentQuantity: Decimal.Value;
  currentValue: Decimal.Value;
  incomingQuantity: Decimal.Value;
  incomingUnitCost: Decimal.Value;
};

export function calculateMovingAverage(input: MovingAverageInput) {
  const currentQuantity = new Decimal(input.currentQuantity);
  const currentValue = new Decimal(input.currentValue);
  const incomingQuantity = new Decimal(input.incomingQuantity);
  const incomingUnitCost = new Decimal(input.incomingUnitCost);

  if (currentQuantity.isNegative() || currentValue.isNegative()) {
    throw new Error("El saldo actual no puede ser negativo.");
  }
  if (!incomingQuantity.greaterThan(0) || incomingUnitCost.isNegative()) {
    throw new Error("La entrada debe tener cantidad positiva y costo no negativo.");
  }

  const onHandQuantity = currentQuantity.add(incomingQuantity).toDecimalPlaces(6);
  const movementValue = incomingQuantity.mul(incomingUnitCost).toDecimalPlaces(4);
  const inventoryValue = currentValue.add(movementValue).toDecimalPlaces(4);
  const averageUnitCost = inventoryValue.div(onHandQuantity).toDecimalPlaces(6);

  return { onHandQuantity, movementValue, inventoryValue, averageUnitCost };
}
