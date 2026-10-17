import { z } from "zod";
import Decimal from "decimal.js";

const optionalText = z.string().trim().max(150).optional().or(z.literal(""));

const variantSnapshotSchema = z.object({
  productVariantId: z.uuid(),
  sku: z.string().trim().max(100).optional().or(z.literal("")),
  size: z.string().trim().min(1, "La talla es obligatoria.").max(30),
  color: z.string().trim().max(120).optional().or(z.literal("")),
});

export const sizeProgramSchema = z.array(variantSnapshotSchema.extend({
  requestedPairs: z.coerce.number().int().positive("Los pares deben ser mayores que cero."),
  producedPairs: z.coerce.number().int().min(0).optional(),
})).min(1, "Agrega al menos una talla.").max(80);

const turnQuantitySchema = variantSnapshotSchema.pick({ productVariantId: true, sku: true, size: true }).extend({
  quantity: z.coerce.number().int().min(0),
});

export const productionTurnSchema = z.object({
  date: z.coerce.date(),
  quantities: z.array(turnQuantitySchema).min(1).max(80),
  observations: z.string().trim().max(500).optional().or(z.literal("")),
});

export const productionComponentSchema = z.object({
  itemId: z.uuid(),
  componentType: z.enum(["CERCO_VIRA", "INSERTO_PUNTA", "INSERTO_TALON", "OTRO"]),
  quantity: z.coerce.number().positive("La cantidad del componente debe ser mayor que cero."),
  colorDetail: z.string().trim().max(150).optional().or(z.literal("")),
});

const legacyDailyProductionSchema = z.array(variantSnapshotSchema.extend({
  date: z.coerce.date(),
  quantity: z.coerce.number().min(0),
  observations: z.string().trim().max(300).optional().or(z.literal("")),
})).max(200).default([]);

export const productionSheetSchema = z.object({
  operatorName: optionalText,
  modelLogo: optionalText,
  brandColor: optionalText,
  productionTurns: z.array(productionTurnSchema).max(100).default([]),
  sizeProgram: sizeProgramSchema,
  components: z.array(productionComponentSchema).max(12).default([]),
  // Campos heredados que permiten abrir órdenes creadas con el formato anterior.
  machineEquipment: optionalText,
  materialLoad: optionalText,
  seriesLot: optionalText,
  processType: z.enum(["PRENSA", "INYECTORA", "AMBOS", "NINGUNO"]).optional(),
  mold: optionalText,
  pressNumber: optionalText,
  pressLoad: optionalText,
  injectorNumber: optionalText,
  curve: optionalText,
  dailyProduction: legacyDailyProductionSchema,
});

export type ProductionSheetInput = z.infer<typeof productionSheetSchema>;

export function serializeProductionSheet(input: ProductionSheetInput) {
  return {
    ...input,
    productionTurns: input.productionTurns.map((turn) => ({
      ...turn,
      date: turn.date.toISOString().slice(0, 10),
    })),
    dailyProduction: input.dailyProduction.map((entry) => ({
      ...entry,
      date: entry.date.toISOString().slice(0, 10),
    })),
  };
}

export function validateProductionSheetTotals(
  input: Pick<ProductionSheetInput, "sizeProgram" | "productionTurns" | "components">,
  plannedQuantity?: Decimal.Value,
) {
  const programmed = input.sizeProgram.reduce((total, item) => total.add(item.requestedPairs), new Decimal(0));
  if (!programmed.greaterThan(0)) return "La programación debe incluir al menos un par.";
  if (plannedQuantity !== undefined && !programmed.equals(new Decimal(plannedQuantity))) return `La programación por talla debe sumar ${new Decimal(plannedQuantity).toString()} pares.`;

  const limits = new Map<string, Decimal>();
  const sizes = new Set<string>();
  for (const item of input.sizeProgram) {
    if (limits.has(item.productVariantId)) return `La variante ${item.sku || item.size} está repetida en la programación.`;
    const sizeKey = item.size.trim().toLocaleUpperCase();
    if (sizes.has(sizeKey)) return `La talla ${item.size} está repetida en la programación.`;
    sizes.add(sizeKey);
    limits.set(item.productVariantId, new Decimal(item.requestedPairs));
  }

  const produced = new Map<string, Decimal>();
  for (const turn of input.productionTurns) {
    const seen = new Set<string>();
    for (const entry of turn.quantities) {
      if (seen.has(entry.productVariantId)) return `La talla ${entry.size} está repetida dentro de un turno.`;
      seen.add(entry.productVariantId);
      if (!limits.has(entry.productVariantId)) return `La talla ${entry.size} del turno no existe en la programación.`;
      produced.set(entry.productVariantId, (produced.get(entry.productVariantId) ?? new Decimal(0)).add(entry.quantity));
    }
  }
  for (const [variantId, quantity] of produced) {
    const limit = limits.get(variantId)!;
    if (quantity.greaterThan(limit)) {
      const scheduled = input.sizeProgram.find((item) => item.productVariantId === variantId);
      return `La producción acumulada de la talla ${scheduled?.size ?? "seleccionada"} supera los pares programados.`;
    }
  }

  const componentTypes = input.components.map((item) => item.componentType);
  if (new Set(componentTypes).size !== componentTypes.length) return "No repitas el mismo tipo de componente integrado.";
  return null;
}
