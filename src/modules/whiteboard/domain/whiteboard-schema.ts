import { z } from "zod";

const coordinate = z.number().finite().min(-100_000).max(100_000);
const dimension = z.number().finite().min(40).max(10_000);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "El color no es válido.");
export const whiteboardIdSchema = z.string().uuid("La pizarra seleccionada no es válida.");
const baseElement = z.object({
  id: z.string().uuid(),
  x: coordinate,
  y: coordinate,
  width: dimension,
  height: dimension,
});

export const whiteboardElementSchema = z.discriminatedUnion("type", [
  baseElement.extend({
    type: z.literal("note"),
    text: z.string().max(3_000),
    color,
  }),
  baseElement.extend({
    type: z.literal("image"),
    assetId: z.string().uuid(),
  }),
  baseElement.extend({
    type: z.literal("drawing"),
    color,
    strokeWidth: z.number().finite().min(1).max(24),
    points: z.array(z.object({ x: coordinate, y: coordinate })).min(2).max(5_000),
  }),
]);

export const whiteboardContentSchema = z.object({
  version: z.literal(1),
  elements: z.array(whiteboardElementSchema).max(500),
});

export const whiteboardTitleSchema = z.string().trim().min(1, "Escribe un nombre para la pizarra.").max(120, "El nombre no puede superar 120 caracteres.");

export const createWhiteboardSchema = z.object({
  title: whiteboardTitleSchema,
  content: whiteboardContentSchema.optional(),
});

export const updateWhiteboardSchema = z.object({
  id: whiteboardIdSchema.optional(),
  title: whiteboardTitleSchema.optional(),
  revision: z.number().int().min(0),
  content: whiteboardContentSchema,
});

export const exportWhiteboardSchema = z.object({ id: whiteboardIdSchema });

export type WhiteboardElement = z.infer<typeof whiteboardElementSchema>;
export type WhiteboardContent = z.infer<typeof whiteboardContentSchema>;

export function emptyWhiteboardContent(): WhiteboardContent {
  return { version: 1, elements: [] };
}

export function referencedAssetIds(content: WhiteboardContent) {
  return [...new Set(content.elements.filter((element) => element.type === "image").map((element) => element.assetId))];
}
