import type { WhiteboardElement } from "@/modules/whiteboard/domain/whiteboard-schema";
import { calculateWhiteboardExportBounds, calculateWhiteboardExportScale } from "@/modules/whiteboard/domain/whiteboard-export";

export type WhiteboardExportAsset = { id: string; secureUrl: string; fileName: string };

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.roundRect(x, y, width, height, safeRadius);
}

function splitLongWord(context: CanvasRenderingContext2D, word: string, maxWidth: number) {
  const pieces: string[] = [];
  let piece = "";
  for (const character of word) {
    if (piece && context.measureText(piece + character).width > maxWidth) {
      pieces.push(piece);
      piece = character;
    } else piece += character;
  }
  if (piece) pieces.push(piece);
  return pieces;
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph) { lines.push(""); continue; }
    let line = "";
    const words = paragraph.split(/\s+/).flatMap((word) => context.measureText(word).width > maxWidth ? splitLongWord(context, word, maxWidth) : [word]);
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    if (line) lines.push(line);
  }
  return lines;
}

async function loadImage(url: string) {
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) throw new Error("No se pudo descargar una de las imágenes de la pizarra.");
  const blob = await response.blob();
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    return { source: bitmap as CanvasImageSource, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close() };
  }
  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  image.src = objectUrl;
  await image.decode();
  return { source: image as CanvasImageSource, width: image.naturalWidth, height: image.naturalHeight, cleanup: () => URL.revokeObjectURL(objectUrl) };
}

function drawContainedImage(context: CanvasRenderingContext2D, source: CanvasImageSource, sourceWidth: number, sourceHeight: number, x: number, y: number, width: number, height: number) {
  const ratio = Math.min(width / sourceWidth, height / sourceHeight);
  const targetWidth = sourceWidth * ratio;
  const targetHeight = sourceHeight * ratio;
  context.drawImage(source, x + (width - targetWidth) / 2, y + (height - targetHeight) / 2, targetWidth, targetHeight);
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen PNG.")), "image/png"));
}

export async function downloadWhiteboardPng(elements: WhiteboardElement[], assets: WhiteboardExportAsset[]) {
  const bounds = calculateWhiteboardExportBounds(elements);
  const scale = calculateWhiteboardExportScale(bounds);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bounds.width * scale));
  canvas.height = Math.max(1, Math.round(bounds.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("El navegador no permite generar la imagen.");
  context.scale(scale, scale);
  context.translate(-bounds.x, -bounds.y);

  context.fillStyle = "#f8fafc";
  context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  context.fillStyle = "#d8e1e8";
  for (let x = Math.floor(bounds.x / 24) * 24; x <= bounds.x + bounds.width; x += 24) {
    for (let y = Math.floor(bounds.y / 24) * 24; y <= bounds.y + bounds.height; y += 24) {
      context.beginPath(); context.arc(x, y, 1.15, 0, Math.PI * 2); context.fill();
    }
  }

  const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
  const orderedElements = [...elements.filter((element) => element.type === "drawing"), ...elements.filter((element) => element.type !== "drawing")];
  for (const element of orderedElements) {
    if (element.type === "drawing") {
      context.save();
      context.translate(element.x, element.y);
      context.strokeStyle = element.color;
      context.lineWidth = element.strokeWidth;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();
      element.points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
      context.stroke();
      context.restore();
      continue;
    }

    if (element.type === "image") {
      const asset = assetMap.get(element.assetId);
      if (asset) {
        try {
          const image = await loadImage(asset.secureUrl);
          drawContainedImage(context, image.source, image.width, image.height, element.x, element.y, element.width, element.height);
          image.cleanup();
        } catch {
          context.fillStyle = "#64748b";
          context.font = "500 13px Arial, sans-serif";
          context.textAlign = "center";
          context.fillText("Imagen no disponible", element.x + element.width / 2, element.y + element.height / 2);
          context.textAlign = "start";
        }
      }
      continue;
    }

    context.save();
    context.shadowColor = "rgba(15, 23, 42, 0.16)";
    context.shadowBlur = 18;
    context.shadowOffsetY = 6;
    roundedRect(context, element.x, element.y, element.width, element.height, 10);
    context.fillStyle = element.color;
    context.fill();
    context.shadowColor = "transparent";
    context.strokeStyle = "rgba(15, 23, 42, 0.18)";
    context.lineWidth = 1;
    context.stroke();
    context.clip();

    const headerHeight = 34;
    context.fillStyle = "rgba(15, 23, 42, 0.065)";
    context.fillRect(element.x, element.y, element.width, headerHeight);
    context.fillStyle = "#334155";
    context.font = "700 11px Arial, sans-serif";
    context.textBaseline = "middle";
    context.fillText("NOTA", element.x + 10, element.y + headerHeight / 2, element.width - 20);

    context.fillStyle = "#1f2937";
    context.font = "500 15px Arial, sans-serif";
    context.textBaseline = "top";
    const lineHeight = 22;
    const lines = wrapText(context, element.text, Math.max(10, element.width - 24));
    const maxLines = Math.max(0, Math.floor((element.height - headerHeight - 20) / lineHeight));
    lines.slice(0, maxLines).forEach((line, index) => context.fillText(line, element.x + 12, element.y + headerHeight + 10 + index * lineHeight));
    context.restore();
  }

  const blob = await canvasBlob(canvas);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  link.href = url;
  link.download = `pizarra-lk-${timestamp}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
