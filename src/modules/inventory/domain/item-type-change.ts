export const INVENTORY_ITEM_TYPES = ["RAW_MATERIAL", "INTERMEDIATE", "WASTE", "FINISHED_PRODUCT"] as const;

// Reclasificar entre materia prima, insumo elaborado y merma está permitido.
// Los productos terminados provienen de Productos y no se cambian desde Almacén.
export function itemTypeChangeIssue(current: string, next: string): { code: string; message: string } | null {
  if (current === next) return null;
  if (current === "FINISHED_PRODUCT" || next === "FINISHED_PRODUCT") {
    return { code: "INVENTORY_FINISHED_TYPE_LOCKED", message: "Los productos terminados se gestionan desde Productos; no puedes cambiar su tipo desde Almacén." };
  }
  return null;
}
