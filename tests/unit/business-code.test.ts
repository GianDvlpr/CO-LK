import { describe, expect, it } from "vitest";
import { formatBusinessCode } from "@/lib/database/business-code";

describe("formatBusinessCode", () => {
  const date = new Date("2026-10-16T00:00:00.000Z");

  it.each([
    ["PURCHASE", "CMP-2026-000001"],
    ["PRODUCTION", "OP-2026-000001"],
    ["SALES_ORDER", "PED-2026-000001"],
    ["PICK_PACK", "PP-2026-000001"],
    ["INVENTORY_RAW", "MP-000001"],
    ["INVENTORY_WASTE", "MER-000001"],
    ["INVENTORY_FINISHED", "PT-000001"],
    ["INVENTORY_INTERMEDIATE", "IE-000001"],
    ["INVENTORY_FORMULA", "FIS-000001"],
    ["INVENTORY_TRANSFORMATION", "TRF-2026-000001"],
    ["RECIPE", "REC-000001"],
    ["MACHINE", "MAQ-000001"],
    ["SUPPLIER", "PROV-000001"],
    ["CUSTOMER", "CLI-000001"],
  ] as const)("genera el formato de %s", (kind, expected) => {
    expect(formatBusinessCode(kind, 1, date)).toBe(expected);
  });
});
