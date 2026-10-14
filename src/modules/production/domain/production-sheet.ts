import { z } from "zod";
import Decimal from "decimal.js";

const optionalText = z.string().trim().max(150).optional().or(z.literal(""));

export const sizeProgramSchema = z.array(z.object({
  size: z.string().trim().min(1, "La talla es obligatoria.").max(30),
  requestedPairs: z.coerce.number().positive("Los pares deben ser mayores que cero."),
})).max(20).default([]);

export const dailyProductionSchema = z.array(z.object({
  date: z.coerce.date(),
  size: z.string().trim().min(1, "La talla es obligatoria.").max(30),
  quantity: z.coerce.number().min(0),
  observations: z.string().trim().max(300).optional().or(z.literal("")),
})).max(200).default([]);

export const productionSheetSchema = z.object({
  machineEquipment: optionalText,
  operatorName: optionalText,
  modelLogo: optionalText,
  materialLoad: optionalText,
  seriesLot: optionalText,
  processType: z.enum(["PRENSA", "INYECTORA"]).optional(),
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

export function validateProductionSheetTotals(input: Pick<ProductionSheetInput, "sizeProgram" | "dailyProduction">, plannedQuantity: Decimal.Value) {
  const planned = new Decimal(plannedQuantity);
  const programmed = input.sizeProgram.reduce((total, item) => total.add(item.requestedPairs), new Decimal(0));
  if (!programmed.isZero() && !programmed.equals(planned)) return `La programación por talla debe sumar ${planned.toString()} pares.`;
  const limits = new Map<string, Decimal>();
  for (const item of input.sizeProgram) {
    const key = item.size.toLocaleUpperCase();
    if (limits.has(key)) return `La talla ${item.size} está repetida en la programación.`;
    limits.set(key, new Decimal(item.requestedPairs));
  }
  const produced = new Map<string, Decimal>();
  for (const entry of input.dailyProduction) {
    const key = entry.size.toLocaleUpperCase();
    if (limits.size > 0 && !limits.has(key)) return `La talla ${entry.size} del registro diario no existe en la programación.`;
    produced.set(key, (produced.get(key) ?? new Decimal(0)).add(entry.quantity));
  }
  for (const [size, quantity] of produced) {
    const limit = limits.get(size);
    if (limit && quantity.greaterThan(limit)) return `La producción acumulada de la talla ${size} supera los pares programados.`;
  }
  return null;
}
