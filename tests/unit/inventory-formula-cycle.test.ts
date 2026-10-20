import { describe, expect, it } from "vitest";
import { createsInventoryFormulaCycle } from "@/modules/inventory/domain/inventory-formula-cycle";

describe("createsInventoryFormulaCycle", () => {
  it("acepta una cadena de insumos sin retorno", () => {
    expect(createsInventoryFormulaCycle([{ outputItemId: "B", ingredientItemIds: ["A"] }], "C", ["B"])).toBe(false);
  });

  it("rechaza ciclos directos e indirectos", () => {
    expect(createsInventoryFormulaCycle([], "A", ["A"])).toBe(true);
    expect(createsInventoryFormulaCycle([
      { outputItemId: "B", ingredientItemIds: ["A"] },
      { outputItemId: "C", ingredientItemIds: ["B"] },
    ], "A", ["C"])).toBe(true);
  });
});
