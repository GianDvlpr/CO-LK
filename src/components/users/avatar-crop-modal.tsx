"use client";

/* eslint-disable @next/next/no-img-element -- la vista usa un object URL local que Next/Image no debe optimizar */

import { ReloadOutlined, ZoomInOutlined } from "@ant-design/icons";
import { Button, Modal, Slider, Typography } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clampCropOffset, cropDisplaySize, sourceCropRect, type CropOffset, type ImageSize } from "@/modules/users/domain/avatar-crop";

const OUTPUT_SIZE = 512;

async function canvasToAvatarFile(canvas: HTMLCanvasElement, originalName: string) {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("No se pudo generar el recorte.")), "image/jpeg", 0.9));
  const baseName = originalName.replace(/\.[^.]+$/, "") || "avatar";
  return new File([blob], `${baseName}-recortado.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}

export function AvatarCropModal({ file, sourceUrl, open, saving, onCancel, onConfirm }: { file: File; sourceUrl: string; open: boolean; saving: boolean; onCancel: () => void; onConfirm: (file: File) => Promise<unknown> }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; origin: CropOffset } | null>(null);
  const [imageSize, setImageSize] = useState<ImageSize>({ width: 1, height: 1 });
  const [viewportSize, setViewportSize] = useState(320);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<CropOffset>({ x: 0, y: 0 });
  const [imageReady, setImageReady] = useState(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = () => setViewportSize(viewport.clientWidth || 320);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [open]);

  const displaySize = useMemo(() => cropDisplaySize(imageSize, viewportSize, zoom), [imageSize, viewportSize, zoom]);
  const boundedOffset = useMemo(() => clampCropOffset(offset, imageSize, viewportSize, zoom), [offset, imageSize, viewportSize, zoom]);
  const moveTo = useCallback((next: CropOffset) => setOffset(clampCropOffset(next, imageSize, viewportSize, zoom)), [imageSize, viewportSize, zoom]);
  const reset = () => { setZoom(1); setOffset({ x: 0, y: 0 }); };

  const confirm = async () => {
    const image = imageRef.current;
    if (!file || !image || !image.complete || !image.naturalWidth) return;
    const crop = sourceCropRect(imageSize, viewportSize, zoom, boundedOffset);
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar la imagen.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    await onConfirm(await canvasToAvatarFile(canvas, file.name));
  };

  return <Modal title="Ajustar foto de perfil" open={open} onCancel={onCancel} onOk={() => { void confirm().catch(() => undefined); }} okText="Usar este recorte" cancelText="Cancelar" confirmLoading={saving} okButtonProps={{ disabled: !imageReady }} width={560} destroyOnHidden>
    <Typography.Paragraph type="secondary">Mueve la imagen dentro del cuadrado y usa el zoom para elegir la sección que se mostrará como foto de perfil.</Typography.Paragraph>
    <div
      ref={viewportRef}
      className="avatar-crop-viewport"
      role="application"
      tabIndex={0}
      aria-label="Área de recorte cuadrada. Arrastra la imagen o usa las flechas del teclado para acomodarla."
      onPointerDown={(event) => {
        if (saving) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: boundedOffset };
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        moveTo({ x: drag.origin.x + event.clientX - drag.startX, y: drag.origin.y + event.clientY - drag.startY });
      }}
      onPointerUp={(event) => { if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null; }}
      onPointerCancel={() => { dragRef.current = null; }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 16 : 4;
        const changes: Record<string, CropOffset> = {
          ArrowLeft: { x: boundedOffset.x - step, y: boundedOffset.y }, ArrowRight: { x: boundedOffset.x + step, y: boundedOffset.y },
          ArrowUp: { x: boundedOffset.x, y: boundedOffset.y - step }, ArrowDown: { x: boundedOffset.x, y: boundedOffset.y + step },
        };
        if (changes[event.key]) { event.preventDefault(); moveTo(changes[event.key]); }
      }}
    >
      {sourceUrl ? <img
        ref={imageRef}
        src={sourceUrl}
        alt="Vista previa de la foto seleccionada"
        draggable={false}
        onLoad={(event) => { setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); setImageReady(true); setOffset({ x: 0, y: 0 }); }}
        style={{ width: displaySize.width, height: displaySize.height, left: (viewportSize - displaySize.width) / 2 + boundedOffset.x, top: (viewportSize - displaySize.height) / 2 + boundedOffset.y }}
      /> : null}
      <div className="avatar-crop-frame" aria-hidden="true" />
    </div>
    <div className="avatar-crop-controls">
      <ZoomInOutlined aria-hidden="true" />
      <Slider min={1} max={3} step={0.01} value={zoom} onChange={(value) => { setZoom(value); setOffset((current) => clampCropOffset(current, imageSize, viewportSize, value)); }} disabled={saving} aria-label="Zoom de la foto" />
      <Button icon={<ReloadOutlined />} onClick={reset} disabled={saving}>Restablecer</Button>
    </div>
    <Typography.Text type="secondary">El resultado se guardará cuadrado y optimizado a {OUTPUT_SIZE} × {OUTPUT_SIZE} px.</Typography.Text>
  </Modal>;
}
