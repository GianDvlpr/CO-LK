export type CropOffset = { x: number; y: number };
export type ImageSize = { width: number; height: number };

export function coverScale(image: ImageSize, viewportSize: number) {
  if (image.width <= 0 || image.height <= 0 || viewportSize <= 0) throw new Error("Las dimensiones del recorte no son válidas.");
  return Math.max(viewportSize / image.width, viewportSize / image.height);
}

export function cropDisplaySize(image: ImageSize, viewportSize: number, zoom: number): ImageSize {
  const scale = coverScale(image, viewportSize) * Math.max(1, zoom);
  return { width: image.width * scale, height: image.height * scale };
}

export function clampCropOffset(offset: CropOffset, image: ImageSize, viewportSize: number, zoom: number): CropOffset {
  const display = cropDisplaySize(image, viewportSize, zoom);
  const limitX = Math.max(0, (display.width - viewportSize) / 2);
  const limitY = Math.max(0, (display.height - viewportSize) / 2);
  return {
    x: limitX === 0 ? 0 : Math.min(limitX, Math.max(-limitX, offset.x)),
    y: limitY === 0 ? 0 : Math.min(limitY, Math.max(-limitY, offset.y)),
  };
}

export function sourceCropRect(image: ImageSize, viewportSize: number, zoom: number, offset: CropOffset) {
  const display = cropDisplaySize(image, viewportSize, zoom);
  const bounded = clampCropOffset(offset, image, viewportSize, zoom);
  const left = (viewportSize - display.width) / 2 + bounded.x;
  const top = (viewportSize - display.height) / 2 + bounded.y;
  return {
    x: Math.max(0, (-left * image.width) / display.width),
    y: Math.max(0, (-top * image.height) / display.height),
    width: (viewportSize * image.width) / display.width,
    height: (viewportSize * image.height) / display.height,
  };
}
