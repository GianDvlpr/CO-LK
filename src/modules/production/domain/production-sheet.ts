import { z } from "zod";
import Decimal from "decimal.js";

const optionalText = z.string().trim().max(150).optional().or(z.literal(""));

const variantSnapshotSchema = z.object({
  productVariantId: z.uuid().optional(),
  sku: z.string().trim().max(100).optional().or(z.literal("")),
  size: z.string().trim().min(1, "La talla es obligatoria.").max(30),
  color: z.string().trim().max(80).optional().or(z.literal("")),
});

export const sizeProgramSchema = z.array(variantSnapshotSchema.extend({
  requestedPairs: z.coerce.number().positive("Los pares deben ser mayores que cero."),
  producedPairs: z.coerce.number().min(0).optional(),
})).max(80).default([]);

export const dailyProductionSchema = z.array(variantSnapshotSchema.extend({
  date: z.coerce.date(),
  quantity: z.coerce.number().min(0),
  observations: z.string().trim().max(300).optional().or(z.literal("")),
})).max(200).default([]);

export const productionSheetSchema = z.object({
  machineEquipment: optionalText,
  operatorName: optionalText,
  modelLogo: optionalText,
  materialLoad: optionalText,
  seriesLot: optionalText,
  processType: z.enum(["PRENSA", "INYECTORA", "AMBOS", "NINGUNO"]).optional(),
  mold: optionalText,
  brandColor: optionalText,
  pressNumber: optionalText,
  pressLoad: optionalText,
  injectorNumber: optionalText,
  curve: optionalText,
  sizeProgram: sizeProgramSchema,
  dailyProduction: dailyProductionSchema,
});

export type ProductionSheetInput = z.infer<typeof productionSheetSchema>;

export function serializeProductionSheet(input: ProductionSheetInput) {
  return {
    ...input,
    dailyProduction: input.dailyProduction.map((entry) => ({
      ...entry,
      date: entry.date.toISOString().slice(0, 10),
    })),
  };
}

function variantKey(item: { productVariantId?: string; size: string; color?: string }) {
  return item.productVariantId ?? `${item.size}:${item.color || "SIN-COLOR"}`.toLocaleUpperCase();
}

export function validateProductionSheetTotals(input: Pick<ProductionSheetInput, "sizeProgram" | "dailyProduction">, plannedQuantity: Decimal.Value) {
  const planned = new Decimal(plannedQuantity);
  const programmed = input.sizeProgram.reduce((total, item) => total.add(item.requestedPairs), new Decimal(0));
  if (!programmed.isZero() && !programmed.equals(planned)) return `La programación por talla y color debe sumar ${planned.toString()} pares.`;
  const limits = new Map<string, Decimal>();
  for (const item of input.sizeProgram) {
    const key = variantKey(item);
    if (limits.has(key)) return `La combinación ${item.size} / ${item.color || "sin color"} está repetida en la programación.`;
    limits.set(key, new Decimal(item.requestedPairs));
  }
  const produced = new Map<string, Decimal>();
  for (const entry of input.dailyProduction) {
    const key = variantKey(entry);
    if (limits.size > 0 && !limits.has(key)) return `La combinación ${entry.size} / ${entry.color || "sin color"} del registro diario no existe en la programación.`;
    produced.set(key, (produced.get(key) ?? new Decimal(0)).add(entry.quantity));
  }
  for (const [variant, quantity] of produced) {
    const limit = limits.get(variant);
    const scheduled = input.sizeProgram.find((item) => variantKey(item) === variant);
    if (limit && quantity.greaterThan(limit)) return `La producción acumulada de ${scheduled?.size ?? "la talla"} / ${scheduled?.color || "sin color"} supera los pares programados.`;
  }
  return null;
}
