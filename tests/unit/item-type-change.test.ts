import { describe, expect, it } from "vitest";
import { itemTypeChangeIssue } from "@/modules/inventory/domain/item-type-change";

describe("cambio de tipo de ítem de almacén", () => {
  it("permite reclasificar entre materia prima, insumo elaborado y merma", () => {
    expect(itemTypeChangeIssue("RAW_MATERIAL", "INTERMEDIATE")).toBeNull();
    expect(itemTypeChangeIssue("INTERMEDIATE", "WASTE")).toBeNull();
    expect(itemTypeChangeIssue("WASTE", "RAW_MATERIAL")).toBeNull();
  });

  it("no cambia nada cuando el tipo es el mismo", () => {
    expect(itemTypeChangeIssue("RAW_MATERIAL", "RAW_MATERIAL")).toBeNull();
  });

  it("bloquea cambios hacia o desde producto terminado", () => {
    expect(itemTypeChangeIssue("RAW_MATERIAL", "FINISHED_PRODUCT")?.code).toBe("INVENTORY_FINISHED_TYPE_LOCKED");
    expect(itemTypeChangeIssue("FINISHED_PRODUCT", "INTERMEDIATE")?.code).toBe("INVENTORY_FINISHED_TYPE_LOCKED");
  });
});
