import { describe, expect, it } from "vitest";
import { emptyWhiteboardContent, referencedAssetIds, whiteboardContentSchema } from "@/modules/whiteboard/domain/whiteboard-schema";

describe("whiteboardContentSchema", () => {
  it("acepta notas, imágenes y dibujos válidos", () => {
    const content = {
      version: 1,
      elements: [
        { id: crypto.randomUUID(), type: "note", x: 10, y: 20, width: 240, height: 180, text: "Revisar pedido", color: "#fff3a3" },
        { id: crypto.randomUUID(), type: "image", x: 300, y: 20, width: 320, height: 240, assetId: crypto.randomUUID() },
        { id: crypto.randomUUID(), type: "drawing", x: 0, y: 0, width: 100, height: 100, color: "#111827", strokeWidth: 4, points: [{ x: 10, y: 10 }, { x: 50, y: 50 }] },
      ],
    };
    expect(whiteboardContentSchema.safeParse(content).success).toBe(true);
  });

  it("rechaza contenido excesivo y colores inválidos", () => {
    const content = { version: 1, elements: [{ id: crypto.randomUUID(), type: "note", x: 0, y: 0, width: 200, height: 120, text: "x", color: "amarillo" }] };
    expect(whiteboardContentSchema.safeParse(content).success).toBe(false);
  });

  it("elimina duplicados al obtener referencias de imágenes", () => {
    const assetId = crypto.randomUUID();
    const base = { x: 0, y: 0, width: 200, height: 120 };
    expect(referencedAssetIds({ version: 1, elements: [
      { ...base, id: crypto.randomUUID(), type: "image", assetId },
      { ...base, id: crypto.randomUUID(), type: "image", assetId },
    ] })).toEqual([assetId]);
    expect(emptyWhiteboardContent()).toEqual({ version: 1, elements: [] });
  });
});
