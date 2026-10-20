export type ProductionOrderDocumentData = {
  number: string;
  status: string;
  priority: number;
  createdAt: Date;
  plannedAt: Date | null;
  operatorName: string | null;
  modelLogo: string | null;
  brandColor: string | null;
  sizeProgram: unknown;
  productionTurns: unknown;
  machine: { code: string; name: string } | null;
  productVariant: {
    sku: string;
    product: { code: string; matrixCode: string; name: string };
    size: { name: string };
    color: { code: string; name: string };
    secondaryColor: { code: string; name: string } | null;
  };
  recipeVersion: { recipe: { code: string; name: string } };
  secondaryRecipeVersion: { recipe: { code: string; name: string } } | null;
  salesOrders: { salesOrder: { number: string } }[];
  materialItem: { code: string; name: string } | null;
  components: { componentType: string; quantity: unknown; colorDetail: string | null; item: { code: string; name: string; unit: { symbol: string } } }[];
};

export type DocumentProgramEntry = { productVariantId?: string; sku?: string; size: string; requestedPairs: number };
export type DocumentTurn = { date: string; quantities: { productVariantId: string; size: string; quantity: number }[]; observations?: string };

export function programEntries(value: unknown): DocumentProgramEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is DocumentProgramEntry => Boolean(item && typeof item === "object" && "size" in item && "requestedPairs" in item));
}

export function productionTurns(value: unknown): DocumentTurn[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is DocumentTurn => Boolean(item && typeof item === "object" && "date" in item && "quantities" in item && Array.isArray(item.quantities)));
}

export function statusLabel(status: string) {
  if (status === "DRAFT" || status === "RELEASED") return "PENDIENTE";
  if (status === "IN_PROGRESS") return "EN CURSO";
  if (status === "COMPLETED") return "FINALIZADA";
  return "CANCELADA";
}

export function skuPattern(order: ProductionOrderDocumentData) {
  const program = programEntries(order.sizeProgram);
  if (program.length === 1 && program[0].sku) return program[0].sku;
  return [order.productVariant.product.matrixCode, order.productVariant.color.code, order.productVariant.secondaryColor?.code, "{TALLA}"].filter(Boolean).join("-");
}

export function salesOrderReferences(order: ProductionOrderDocumentData) {
  return order.salesOrders.map((link) => link.salesOrder.number).join(", ");
}

export const componentNames: Record<string, string> = {
  CERCO_VIRA: "Cerco / vira",
  INSERTO_PUNTA: "Inserto punta",
  INSERTO_TALON: "Inserto talón",
  OTRO: "Otro detalle",
};

export function componentRows(order: ProductionOrderDocumentData) {
  const rows = ["CERCO_VIRA", "INSERTO_PUNTA", "INSERTO_TALON", "OTRO"].map((type) => {
    const component = order.components.find((item) => item.componentType === type);
    return {
      label: componentNames[type],
      code: component ? `${component.item.code} · ${component.item.name} · ${String(component.quantity)} ${component.item.unit.symbol}` : "",
      detail: component?.colorDetail ?? "",
    };
  });
  rows.push(
    { label: "Formulación C1", code: `${order.recipeVersion.recipe.code} · ${order.recipeVersion.recipe.name}`, detail: order.productVariant.color.name },
    { label: "Formulación C2", code: order.secondaryRecipeVersion ? `${order.secondaryRecipeVersion.recipe.code} · ${order.secondaryRecipeVersion.recipe.name}` : "", detail: order.productVariant.secondaryColor?.name ?? "" },
  );
  return rows;
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(`${value.slice(0, 10)}T12:00:00`) : value;
  return new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Lima" }).format(date);
}
