import { describe, expect, it } from "vitest";
import { calculateWhiteboardExportBounds, calculateWhiteboardExportScale } from "@/modules/whiteboard/domain/whiteboard-export";
import type { WhiteboardElement } from "@/modules/whiteboard/domain/whiteboard-schema";

describe("exportación de pizarra", () => {
  it("incluye elementos con coordenadas negativas y margen", () => {
    const elements: WhiteboardElement[] = [
      { id: crypto.randomUUID(), type: "note", x: -100, y: 20, width: 200, height: 100, text: "A", color: "#fff3a3" },
      { id: crypto.randomUUID(), type: "drawing", x: 250, y: -50, width: 50, height: 80, color: "#111827", strokeWidth: 4, points: [{ x: 0, y: 0 }, { x: 50, y: 80 }] },
    ];
    expect(calculateWhiteboardExportBounds(elements, 20)).toEqual({ x: -120, y: -70, width: 440, height: 210 });
  });

  it("reduce la escala para no exceder el tamaño máximo", () => {
    expect(calculateWhiteboardExportScale({ x: 0, y: 0, width: 3000, height: 1000 })).toBeCloseTo(4096 / 3000);
    expect(calculateWhiteboardExportScale({ x: 0, y: 0, width: 1000, height: 800 })).toBe(2);
  });
});
