import { describe, expect, it } from "vitest";
import { drawingIntersectsEraser, whiteboardContentFingerprint } from "@/modules/whiteboard/domain/whiteboard-tools";
import type { WhiteboardElement } from "@/modules/whiteboard/domain/whiteboard-schema";

const drawing: Extract<WhiteboardElement, { type: "drawing" }> = {
  id: "06866ee7-b67b-42ca-ad29-2b845c37f50c",
  type: "drawing",
  x: 100,
  y: 50,
  width: 120,
  height: 80,
  color: "#111827",
  strokeWidth: 4,
  points: [{ x: 10, y: 10 }, { x: 90, y: 60 }],
};

describe("herramientas de pizarra", () => {
  it("detecta el borrador cerca de un segmento y descarta puntos lejanos", () => {
    expect(drawingIntersectsEraser(drawing, { x: 150, y: 85 }, 8)).toBe(true);
    expect(drawingIntersectsEraser(drawing, { x: 210, y: 55 }, 8)).toBe(false);
  });

  it("cambia la huella únicamente cuando cambia el contenido", () => {
    const initial = [drawing];
    const same = [{ ...drawing, points: drawing.points.map((point) => ({ ...point })) }];
    const changed = [{ ...drawing, color: "#ff0000" }];
    expect(whiteboardContentFingerprint(initial)).toBe(whiteboardContentFingerprint(same));
    expect(whiteboardContentFingerprint(initial)).not.toBe(whiteboardContentFingerprint(changed));
  });
});
