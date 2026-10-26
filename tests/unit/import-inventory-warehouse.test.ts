import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { applyImport } from "@/modules/imports/application/confirm-import";

describe("inventory import warehouse assignment", () => {
  it("asigna PRINCIPAL a una materia prima existente que todavía no tiene sector", async () => {
    const update = vi.fn(async ({ data }) => ({ id: "item-1", code: "MP-000001", lotTrackingMode: "NONE", ...data }));
    const upsert = vi.fn(async () => ({ id: "warehouse-principal", code: "PRINCIPAL", active: true }));
    const tx = {
      supplier: { findMany: vi.fn(async () => [{ id: "supplier-1", name: "Proveedor Uno" }]) },
      currency: { findMany: vi.fn(async () => [{ id: "currency-1", code: "PEN", name: "Sol" }]) },
      company: { findUniqueOrThrow: vi.fn(async () => ({ igvRate: { toString: () => "18" } })) },
      inventoryItem: {
        findUnique: vi.fn(async () => ({
          id: "item-1", code: "MP-000001", defaultWarehouseId: null,
          defaultPresentationType: null, defaultPresentationContent: null,
          supplierProductCode: null, referenceNetPrice: null, referenceTaxRate: null,
        })),
        update,
      },
      unitOfMeasure: { findUnique: vi.fn(async () => ({ id: "unit-1", code: "KG" })) },
      warehouse: { upsert },
    } as unknown as Prisma.TransactionClient;

    const result = await applyImport(tx, "inventory", {
      "Almacén": [{
        rowNumber: 2,
        values: {
          codigo: "MP-000001", nombre: "PVC", tipo_item: "MATERIA_PRIMA",
          proveedor_nombre: "Proveedor Uno", moneda: "PEN", unidad_base: "KG",
          modo_lote: "NONE", stock_minimo: "0", activo: "SI", almacen_codigo: "",
        },
      }],
    }, "company-1", "user-1", "job-1", "CREATE_UPDATE");

    expect(result).toEqual({ createdRecords: 1, skippedRecords: 0 });
    expect(upsert).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ defaultWarehouseId: "warehouse-principal" }),
    }));
  });
});
