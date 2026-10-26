import type { WhiteboardElement } from "@/modules/whiteboard/domain/whiteboard-schema";

type Point = { x: number; y: number };

function distanceToSegment(point: Point, start: Point, end: Point) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  if (deltaX === 0 && deltaY === 0) return Math.hypot(point.x - start.x, point.y - start.y);

  const projection = Math.max(0, Math.min(1,
    ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / (deltaX * deltaX + deltaY * deltaY),
  ));
  return Math.hypot(point.x - (start.x + projection * deltaX), point.y - (start.y + projection * deltaY));
}

export function drawingIntersectsEraser(
  element: Extract<WhiteboardElement, { type: "drawing" }>,
  point: Point,
  eraserRadius: number,
) {
  const tolerance = eraserRadius + element.strokeWidth / 2;
  if (
    point.x < element.x - tolerance
    || point.y < element.y - tolerance
    || point.x > element.x + element.width + tolerance
    || point.y > element.y + element.height + tolerance
  ) return false;

  const localPoint = { x: point.x - element.x, y: point.y - element.y };
  for (let index = 1; index < element.points.length; index += 1) {
    if (distanceToSegment(localPoint, element.points[index - 1], element.points[index]) <= tolerance) return true;
  }
  return false;
}

export function whiteboardContentFingerprint(elements: WhiteboardElement[]) {
  const content = JSON.stringify(elements);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${content.length.toString(36)}-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}
