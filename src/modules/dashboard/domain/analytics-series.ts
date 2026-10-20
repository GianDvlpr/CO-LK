export type ActivityPoint = { date: string; purchases: number; orders: number; production: number };

export type DailyActivityInput = {
  from: Date;
  toExclusive: Date;
  purchases: Date[];
  orders: Date[];
  production: Date[];
};

export type InventoryType = "RAW_MATERIAL" | "INTERMEDIATE" | "WASTE" | "FINISHED_PRODUCT";
export type InventoryTypeTotals = Record<InventoryType, number>;
export type WarehouseValue = { code: string; name: string; value: number };
export type ConsumedMaterial = { code: string; name: string; unit: string; quantity: number };

const dayKey = (value: Date) => value.toISOString().slice(0, 10);

function countByDay(values: Date[], from: Date, toExclusive: Date) {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (value < from || value >= toExclusive) continue;
    const key = dayKey(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function buildDailyActivity(input: DailyActivityInput): ActivityPoint[] {
  const { from, toExclusive } = input;
  if (toExclusive <= from) return [];
  const purchases = countByDay(input.purchases, from, toExclusive);
  const orders = countByDay(input.orders, from, toExclusive);
  const production = countByDay(input.production, from, toExclusive);
  const series: ActivityPoint[] = [];
  for (let cursor = new Date(from); cursor < toExclusive; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = dayKey(cursor);
    series.push({ date, purchases: purchases.get(date) ?? 0, orders: orders.get(date) ?? 0, production: production.get(date) ?? 0 });
  }
  return series;
}

export function sumInventoryByType(items: { type: InventoryType; value: number }[]): InventoryTypeTotals {
  const totals: InventoryTypeTotals = { RAW_MATERIAL: 0, INTERMEDIATE: 0, WASTE: 0, FINISHED_PRODUCT: 0 };
  for (const item of items) totals[item.type] = (totals[item.type] ?? 0) + item.value;
  return totals;
}

export function sumInventoryByWarehouse(rows: WarehouseValue[]): WarehouseValue[] {
  const grouped = new Map<string, WarehouseValue>();
  for (const row of rows) {
    const current = grouped.get(row.code) ?? { code: row.code, name: row.name, value: 0 };
    current.value += row.value;
    grouped.set(row.code, current);
  }
  return [...grouped.values()].sort((a, b) => b.value - a.value);
}

export function topConsumedMaterials(rows: ConsumedMaterial[], limit = 8): ConsumedMaterial[] {
  const grouped = new Map<string, ConsumedMaterial>();
  for (const row of rows) {
    const current = grouped.get(row.code) ?? { ...row, quantity: 0 };
    current.quantity += row.quantity;
    grouped.set(row.code, current);
  }
  return [...grouped.values()].sort((a, b) => b.quantity - a.quantity).slice(0, limit);
}
