import { describe, expect, it } from "vitest";
import { buildDailyActivity, sumInventoryByType, sumInventoryByWarehouse, topConsumedMaterials } from "@/modules/dashboard/domain/analytics-series";

describe("actividad diaria de analítica", () => {
  it("cuenta por día UTC y rellena los días sin actividad", () => {
    const series = buildDailyActivity({
      from: new Date("2026-10-01T00:00:00.000Z"),
      toExclusive: new Date("2026-10-04T00:00:00.000Z"),
      purchases: [new Date("2026-10-01T10:00:00.000Z"), new Date("2026-10-03T08:00:00.000Z")],
      orders: [new Date("2026-10-02T12:00:00.000Z")],
      production: [],
    });

    expect(series).toEqual([
      { date: "2026-10-01", purchases: 1, orders: 0, production: 0 },
      { date: "2026-10-02", purchases: 0, orders: 1, production: 0 },
      { date: "2026-10-03", purchases: 1, orders: 0, production: 0 },
    ]);
  });

  it("ignora fechas fuera del rango", () => {
    const series = buildDailyActivity({
      from: new Date("2026-10-02T00:00:00.000Z"),
      toExclusive: new Date("2026-10-03T00:00:00.000Z"),
      purchases: [new Date("2026-10-01T10:00:00.000Z"), new Date("2026-10-04T10:00:00.000Z")],
      orders: [],
      production: [],
    });

    expect(series).toEqual([{ date: "2026-10-02", purchases: 0, orders: 0, production: 0 }]);
  });
});

describe("inventario por tipo y almacén", () => {
  it("suma el valor por tipo y completa los tipos sin valor en cero", () => {
    expect(sumInventoryByType([
      { type: "RAW_MATERIAL", value: 100 },
      { type: "RAW_MATERIAL", value: 50 },
      { type: "FINISHED_PRODUCT", value: 20 },
    ])).toEqual({ RAW_MATERIAL: 150, INTERMEDIATE: 0, WASTE: 0, FINISHED_PRODUCT: 20 });
  });

  it("agrupa por almacén y ordena por valor descendente", () => {
    expect(sumInventoryByWarehouse([
      { code: "SEC-A", name: "Sector A", value: 10 },
      { code: "PRINCIPAL", name: "Principal", value: 50 },
      { code: "SEC-A", name: "Sector A", value: 15 },
    ])).toEqual([
      { code: "PRINCIPAL", name: "Principal", value: 50 },
      { code: "SEC-A", name: "Sector A", value: 25 },
    ]);
  });
});

describe("materiales consumidos", () => {
  it("suma cantidades por material y devuelve el top ordenado", () => {
    expect(topConsumedMaterials([
      { code: "MP-1", name: "PVC", unit: "KG", quantity: 10 },
      { code: "MP-2", name: "TR", unit: "KG", quantity: 25 },
      { code: "MP-1", name: "PVC", unit: "KG", quantity: 5 },
    ], 2)).toEqual([
      { code: "MP-2", name: "TR", unit: "KG", quantity: 25 },
      { code: "MP-1", name: "PVC", unit: "KG", quantity: 15 },
    ]);
  });
});
