import type { WhiteboardElement } from "@/modules/whiteboard/domain/whiteboard-schema";

export type WhiteboardExportBounds = { x: number; y: number; width: number; height: number };

export function calculateWhiteboardExportBounds(elements: WhiteboardElement[], padding = 48): WhiteboardExportBounds {
  if (!elements.length) return { x: 0, y: 0, width: 1200, height: 800 };
  const minX = Math.min(...elements.map((element) => element.x)) - padding;
  const minY = Math.min(...elements.map((element) => element.y)) - padding;
  const maxX = Math.max(...elements.map((element) => element.x + element.width)) + padding;
  const maxY = Math.max(...elements.map((element) => element.y + element.height)) + padding;
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

export function calculateWhiteboardExportScale(bounds: WhiteboardExportBounds, maxEdge = 4096, preferredScale = 2) {
  return Math.min(preferredScale, maxEdge / bounds.width, maxEdge / bounds.height);
}
