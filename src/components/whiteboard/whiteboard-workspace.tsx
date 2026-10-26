"use client";

import {
  ClearOutlined,
  DeleteOutlined,
  DownloadOutlined,
  DragOutlined,
  FolderOpenOutlined,
  HighlightOutlined,
  PictureOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  ScissorOutlined,
} from "@ant-design/icons";
import {
  Background,
  Controls,
  MiniMap,
  NodeResizer,
  ReactFlow,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Empty, Input, Modal, Select, Space, Tag, Tooltip, Upload, Typography } from "antd";
import dayjs from "dayjs";
import Image from "next/image";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";
import { ModuleHeadingIntro } from "@/components/common/module-heading-intro";
import { downloadWhiteboardPng } from "@/components/whiteboard/whiteboard-export";
import type { WhiteboardContent, WhiteboardElement } from "@/modules/whiteboard/domain/whiteboard-schema";
import { drawingIntersectsEraser, whiteboardContentFingerprint } from "@/modules/whiteboard/domain/whiteboard-tools";
import { useUiStore } from "@/stores/ui-store";

type WhiteboardAsset = { id: string; secureUrl: string; fileName: string; mimeType: string; sizeBytes: number; width?: number | null; height?: number | null };
type WhiteboardResponse = { id: string | null; title: string; revision: number; content: WhiteboardContent; assets: WhiteboardAsset[]; createdAt?: string | null; updatedAt: string | null; updatedBy: { name: string; username: string } | null };
type WhiteboardSummary = { id: string; title: string; revision: number; createdAt: string; updatedAt: string; updatedBy: { name: string; username: string } };
type UploadResponse = { asset: WhiteboardAsset; boardId: string; revision: number };
type Tool = "select" | "draw" | "erase";
type BoardNodeData = { element: WhiteboardElement; asset?: WhiteboardAsset; canManage: boolean };
type BoardNode = Node<BoardNodeData, "board">;
type BoardActions = {
  updateNote: (id: string, text: string, persist: boolean) => void;
  resize: (id: string, width: number, height: number) => void;
  remove: (id: string) => void;
};

const BoardActionsContext = createContext<BoardActions | null>(null);
const exportFingerprintEvent = "lk-whiteboard-export";

function subscribeToExportFingerprint(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(exportFingerprintEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(exportFingerprintEvent, callback);
  };
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error?.message ?? "No se pudo completar la operación.") as Error & { code?: string };
    error.code = payload?.error?.code;
    throw error;
  }
  return payload.data;
}

function pathForPoints(points: { x: number; y: number }[]) {
  return points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

function BoardNodeView({ data, selected }: NodeProps<BoardNode>) {
  const actions = useContext(BoardActionsContext);
  const { element, asset, canManage } = data;
  if (element.type === "drawing") {
    return <svg className="whiteboard-stroke" viewBox={`0 0 ${element.width} ${element.height}`} aria-label="Dibujo">
      <path d={pathForPoints(element.points)} fill="none" stroke={element.color} strokeWidth={element.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>;
  }

  return <article className={`whiteboard-node whiteboard-${element.type}${selected ? " is-selected" : ""}`} style={element.type === "note" ? { backgroundColor: element.color } : undefined}>
    {canManage && actions ? <NodeResizer
      isVisible={selected}
      minWidth={element.type === "image" ? 120 : 160}
      minHeight={element.type === "image" ? 90 : 100}
      keepAspectRatio={element.type === "image"}
      onResizeEnd={(_event, params) => actions.resize(element.id, Math.round(params.width), Math.round(params.height))}
    /> : null}
    <div className="whiteboard-node-handle">
      <span>{element.type === "note" ? "Nota" : asset?.fileName ?? "Imagen"}</span>
      {canManage && actions ? <Button className="nodrag" type="text" size="small" danger icon={<DeleteOutlined />} aria-label="Eliminar elemento" onClick={() => actions.remove(element.id)} /> : null}
    </div>
    {element.type === "note" ? <textarea
      className="nodrag nowheel"
      value={element.text}
      readOnly={!canManage}
      maxLength={3_000}
      aria-label="Contenido de la nota"
      placeholder="Escribe una anotación…"
      onChange={(event) => actions?.updateNote(element.id, event.target.value, false)}
      onBlur={(event) => actions?.updateNote(element.id, event.target.value, true)}
    /> : asset ? <div className="whiteboard-image-content"><Image src={asset.secureUrl} alt={asset.fileName} fill unoptimized sizes="(max-width: 760px) 80vw, 440px" draggable={false} /></div> : <div className="whiteboard-missing-image">Imagen no disponible</div>}
  </article>;
}

const nodeTypes = { board: BoardNodeView };

export function WhiteboardWorkspace({ canManage, cloudinaryConfigured }: { canManage: boolean; cloudinaryConfigured: boolean }) {
  const queryClient = useQueryClient();
  const themeMode = useUiStore((state) => state.themeMode);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const whiteboardQueryKey = useMemo(() => ["whiteboard", selectedBoardId ?? "latest"] as const, [selectedBoardId]);
  const query = useQuery({
    queryKey: whiteboardQueryKey,
    queryFn: () => api<WhiteboardResponse>(`/api/v1/whiteboard${selectedBoardId ? `?id=${encodeURIComponent(selectedBoardId)}` : ""}`),
  });
  const boardsQuery = useQuery({ queryKey: ["whiteboards"], queryFn: () => api<WhiteboardSummary[]>("/api/v1/whiteboard/list") });
  const canEdit = canManage && !query.isLoading;
  const [elements, setElements] = useState<WhiteboardElement[]>([]);
  const [assets, setAssets] = useState<WhiteboardAsset[]>([]);
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [nameModalMode, setNameModalMode] = useState<"save" | "new" | null>(null);
  const [boardName, setBoardName] = useState("");
  const [namingBoard, setNamingBoard] = useState(false);
  const [tool, setTool] = useState<Tool>("select");
  const [drawColor, setDrawColor] = useState("#1f2937");
  const [noteColor, setNoteColor] = useState("#fff3a3");
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<BoardNode>([]);
  const flowRef = useRef<ReactFlowInstance<BoardNode, Edge> | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const revisionRef = useRef(0);
  const boardIdRef = useRef<string | null>(null);
  const elementsRef = useRef<WhiteboardElement[]>([]);
  const assetsRef = useRef<WhiteboardAsset[]>([]);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const drawingRef = useRef<{ screen: { x: number; y: number }[]; flow: { x: number; y: number }[] } | null>(null);
  const erasingRef = useRef<{ changed: boolean } | null>(null);
  const [draftPoints, setDraftPoints] = useState<{ x: number; y: number }[]>([]);

  /* La consulta es la fuente externa que hidrata el documento local editable. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!query.data || saving) return;
    boardIdRef.current = query.data.id;
    revisionRef.current = query.data.revision;
    elementsRef.current = query.data.content.elements;
    assetsRef.current = query.data.assets;
    setRevision(query.data.revision);
    setElements(query.data.content.elements);
    setAssets(query.data.assets);
  }, [query.data, saving]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const exportStorageKey = query.data?.id ? `lk-whiteboard-export:${query.data.id}` : null;
  const getExportFingerprint = useCallback(() => exportStorageKey ? window.localStorage.getItem(exportStorageKey) : null, [exportStorageKey]);
  const lastExportedFingerprint = useSyncExternalStore(subscribeToExportFingerprint, getExportFingerprint, () => null);

  const contentFingerprint = useMemo(() => whiteboardContentFingerprint(elements), [elements]);
  const hasExportableChanges = elements.length > 0 && contentFingerprint !== lastExportedFingerprint;

  const assetMap = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  useEffect(() => {
    setNodes(elements.map((element) => ({
      id: element.id,
      type: "board",
      position: { x: element.x, y: element.y },
      data: { element, asset: element.type === "image" ? assetMap.get(element.assetId) : undefined, canManage: canEdit },
      draggable: canEdit && element.type !== "drawing" && tool === "select",
      selectable: element.type !== "drawing",
      style: { width: element.width, height: element.height },
      zIndex: element.type === "drawing" ? 0 : 1,
    })));
  }, [assetMap, canEdit, elements, setNodes, tool]);

  const persist = useCallback((next: WhiteboardElement[], title?: string) => {
    const operation = saveQueueRef.current.then(async () => {
      setSaving(true);
      try {
        const board = await api<WhiteboardResponse>("/api/v1/whiteboard", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: boardIdRef.current ?? undefined, title, revision: revisionRef.current, content: { version: 1, elements: next } }),
        });
        boardIdRef.current = board.id;
        revisionRef.current = board.revision;
        assetsRef.current = board.assets;
        setRevision(board.revision);
        setAssets(board.assets);
        queryClient.setQueryData(whiteboardQueryKey, board);
        if (board.id) {
          queryClient.setQueryData(["whiteboard", board.id], board);
          setSelectedBoardId(board.id);
        }
        void queryClient.invalidateQueries({ queryKey: ["whiteboards"] });
        return board;
      } catch (error) {
        const typed = error as Error & { code?: string };
        toast.error(typed.message);
        if (typed.code === "WHITEBOARD_CONFLICT") await queryClient.invalidateQueries({ queryKey: ["whiteboard"] });
        throw error;
      } finally {
        setSaving(false);
      }
    });
    saveQueueRef.current = operation.then(() => undefined, () => undefined);
    return operation;
  }, [queryClient, whiteboardQueryKey]);

  const replaceElements = useCallback((next: WhiteboardElement[], shouldPersist = true) => {
    elementsRef.current = next;
    setElements(next);
    if (shouldPersist) void persist(next).catch(() => undefined);
  }, [persist]);

  const updateElement = useCallback((id: string, changes: Partial<WhiteboardElement>, shouldPersist = true) => {
    const next = elementsRef.current.map((element) => element.id === id ? ({ ...element, ...changes } as WhiteboardElement) : element);
    replaceElements(next, shouldPersist);
  }, [replaceElements]);

  const removeElement = useCallback((id: string) => {
    const removed = elementsRef.current.find((element) => element.id === id);
    const next = elementsRef.current.filter((element) => element.id !== id);
    replaceElements(next);
    setSelectedId(null);
    if (removed?.type === "image") {
      saveQueueRef.current = saveQueueRef.current.then(async () => {
        await api(`/api/v1/whiteboard/assets/${removed.assetId}`, { method: "DELETE" });
        const nextAssets = assetsRef.current.filter((asset) => asset.id !== removed.assetId);
        assetsRef.current = nextAssets;
        setAssets(nextAssets);
      }).catch((error: Error) => { toast.error(error.message); });
    }
  }, [replaceElements]);

  const actions = useMemo<BoardActions>(() => ({
    updateNote: (id, text, shouldPersist) => updateElement(id, { text }, shouldPersist),
    resize: (id, width, height) => updateElement(id, { width, height }),
    remove: removeElement,
  }), [removeElement, updateElement]);

  const centerPosition = useCallback(() => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || !flowRef.current) return { x: 100, y: 100 };
    return flowRef.current.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  }, []);

  const addNote = () => {
    const center = centerPosition();
    const element: WhiteboardElement = { id: crypto.randomUUID(), type: "note", x: center.x - 120, y: center.y - 80, width: 240, height: 170, text: "", color: noteColor };
    replaceElements([...elementsRef.current, element]);
    setSelectedId(element.id);
    setTool("select");
  };

  const uploadImage = useCallback(async (file: File, position?: { x: number; y: number }) => {
    if (!cloudinaryConfigured) return toast.error("Cloudinary no está configurado para cargar imágenes.");
    if (!file.type.startsWith("image/")) return toast.error("Selecciona una imagen JPEG, PNG o WebP.");
    const form = new FormData();
    form.append("file", file);
    if (boardIdRef.current) form.append("whiteboardId", boardIdRef.current);
    setSaving(true);
    try {
      const result = await api<UploadResponse>("/api/v1/whiteboard/assets", { method: "POST", body: form });
      boardIdRef.current = result.boardId;
      revisionRef.current = result.revision;
      setRevision(result.revision);
      const nextAssets = [...assetsRef.current, result.asset];
      assetsRef.current = nextAssets;
      setAssets(nextAssets);
      const center = position ?? centerPosition();
      const naturalWidth = result.asset.width ?? 640;
      const naturalHeight = result.asset.height ?? 480;
      const width = Math.min(440, Math.max(180, naturalWidth));
      const height = Math.max(120, Math.round(width * naturalHeight / naturalWidth));
      const element: WhiteboardElement = { id: crypto.randomUUID(), type: "image", assetId: result.asset.id, x: center.x - width / 2, y: center.y - height / 2, width, height };
      replaceElements([...elementsRef.current, element]);
      setSelectedId(element.id);
      setTool("select");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }, [centerPosition, cloudinaryConfigured, replaceElements]);

  useEffect(() => {
    if (!canEdit) return;
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, [contenteditable='true']")) return;
      const file = [...(event.clipboardData?.files ?? [])].find((item) => item.type.startsWith("image/"))
        ?? [...(event.clipboardData?.items ?? [])].find((item) => item.kind === "file" && item.type.startsWith("image/"))?.getAsFile();
      if (!file) return;
      event.preventDefault();
      void uploadImage(file);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [canEdit, uploadImage]);

  const startDrawing = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!flowRef.current || !surfaceRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = surfaceRef.current.getBoundingClientRect();
    const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const flow = flowRef.current.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    drawingRef.current = { screen: [screen], flow: [flow] };
    setDraftPoints([screen]);
  };

  const continueDrawing = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drawing = drawingRef.current;
    if (!drawing || !flowRef.current || !surfaceRef.current) return;
    const rect = surfaceRef.current.getBoundingClientRect();
    const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const previous = drawing.screen.at(-1);
    if (previous && Math.hypot(screen.x - previous.x, screen.y - previous.y) < 2) return;
    drawing.screen.push(screen);
    drawing.flow.push(flowRef.current.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    setDraftPoints([...drawing.screen]);
  };

  const finishDrawing = () => {
    const drawing = drawingRef.current;
    drawingRef.current = null;
    setDraftPoints([]);
    if (!drawing || drawing.flow.length < 2) return;
    const padding = strokeWidth + 4;
    const minX = Math.min(...drawing.flow.map((point) => point.x)) - padding;
    const minY = Math.min(...drawing.flow.map((point) => point.y)) - padding;
    const maxX = Math.max(...drawing.flow.map((point) => point.x)) + padding;
    const maxY = Math.max(...drawing.flow.map((point) => point.y)) + padding;
    const element: WhiteboardElement = {
      id: crypto.randomUUID(), type: "drawing", x: minX, y: minY,
      width: Math.max(40, maxX - minX), height: Math.max(40, maxY - minY), color: drawColor, strokeWidth,
      points: drawing.flow.map((point) => ({ x: point.x - minX, y: point.y - minY })),
    };
    replaceElements([...elementsRef.current, element]);
  };

  const eraseAtPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!flowRef.current) return;
    const point = flowRef.current.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const radius = 12 / flowRef.current.getZoom();
    const next = elementsRef.current.filter((element) => (
      element.type !== "drawing" || !drawingIntersectsEraser(element, point, radius)
    ));
    if (next.length === elementsRef.current.length) return;
    if (erasingRef.current) erasingRef.current.changed = true;
    replaceElements(next, false);
  };

  const startErasing = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    erasingRef.current = { changed: false };
    eraseAtPointer(event);
  };

  const continueErasing = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (erasingRef.current) eraseAtPointer(event);
  };

  const finishErasing = () => {
    const erasing = erasingRef.current;
    erasingRef.current = null;
    if (erasing?.changed) void persist(elementsRef.current).catch(() => undefined);
  };

  const clearBoard = () => Modal.confirm({
    title: "¿Limpiar toda la pizarra?",
    content: "Se eliminarán notas, dibujos e imágenes. Esta acción no se puede deshacer.",
    okText: "Limpiar",
    cancelText: "Cancelar",
    okButtonProps: { danger: true },
    onOk: async () => {
      const imageIds = elementsRef.current.filter((element) => element.type === "image").map((element) => element.assetId);
      replaceElements([]);
      setSelectedId(null);
      saveQueueRef.current = saveQueueRef.current.then(async () => {
        await Promise.all(imageIds.map((id) => api(`/api/v1/whiteboard/assets/${id}`, { method: "DELETE" }).catch(() => undefined)));
        assetsRef.current = [];
        setAssets([]);
      });
    },
  });

  const openBoard = async (id: string) => {
    if (id === boardIdRef.current) return;
    await saveQueueRef.current;
    boardIdRef.current = id;
    revisionRef.current = 0;
    elementsRef.current = [];
    assetsRef.current = [];
    setSelectedBoardId(id);
    setRevision(0);
    setElements([]);
    setAssets([]);
    setSelectedId(null);
    setTool("select");
  };

  const openNameModal = (mode: "save" | "new") => {
    setNameModalMode(mode);
    setBoardName(mode === "save" ? (query.data?.title ?? "Pizarra sin título") : "");
  };

  const confirmBoardName = async () => {
    const title = boardName.trim();
    if (!title) return toast.error("Escribe un nombre para la pizarra.");
    setNamingBoard(true);
    try {
      if (nameModalMode === "new") {
        await saveQueueRef.current;
        const board = await api<WhiteboardResponse>("/api/v1/whiteboard", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title }),
        });
        boardIdRef.current = board.id;
        revisionRef.current = board.revision;
        elementsRef.current = board.content.elements;
        assetsRef.current = board.assets;
        if (board.id) queryClient.setQueryData(["whiteboard", board.id], board);
        setSelectedBoardId(board.id);
        setRevision(board.revision);
        setElements(board.content.elements);
        setAssets(board.assets);
        setSelectedId(null);
        setTool("select");
        toast.success("Nueva pizarra creada.");
      } else {
        await persist(elementsRef.current, title);
        toast.success("Pizarra guardada.");
      }
      await queryClient.invalidateQueries({ queryKey: ["whiteboards"] });
      setNameModalMode(null);
    } catch (error) {
      if (nameModalMode === "new") toast.error((error as Error).message);
    } finally {
      setNamingBoard(false);
    }
  };

  const exportBoard = async () => {
    setExporting(true);
    try {
      if (!boardIdRef.current) throw new Error("Guarda la pizarra antes de exportarla.");
      const exportedElements = elementsRef.current;
      const exportedAssets = assetsRef.current;
      await downloadWhiteboardPng(exportedElements, exportedAssets);
      await api("/api/v1/whiteboard/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: boardIdRef.current }),
      }).catch(() => undefined);
      const exportedFingerprint = whiteboardContentFingerprint(exportedElements);
      if (exportStorageKey) {
        window.localStorage.setItem(exportStorageKey, exportedFingerprint);
        window.dispatchEvent(new Event(exportFingerprintEvent));
      }
      toast.success("Pizarra exportada como imagen PNG.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const lastUpdated = query.data?.updatedAt ? `Actualizada ${dayjs(query.data.updatedAt).format("DD/MM/YYYY HH:mm")} por ${query.data.updatedBy?.name ?? "el equipo"}` : "Pizarra nueva";

  return <div className="whiteboard-workspace">
    <div className="page-heading">
      <ModuleHeadingIntro title="Pizarra" eyebrow="Colaboración" description="Espacio compartido para notas, dibujos, imágenes y capturas. Los cambios se guardan para toda la empresa." color="blue" />
      <Space wrap className="module-actions">
        <Tag color={saving ? "processing" : "success"}>{saving ? "Guardando…" : `Guardado · v${revision}`}</Tag>
        <Tooltip title="Recargar últimos cambios"><Button icon={<ReloadOutlined />} aria-label="Recargar" loading={query.isFetching} onClick={() => query.refetch()} /></Tooltip>
      </Space>
    </div>

    {!canManage ? <Alert type="info" showIcon message="Tienes acceso de lectura. Solicita el permiso para editar la pizarra." /> : null}
    {!cloudinaryConfigured ? <Alert type="warning" showIcon message="Cloudinary no está configurado; las notas y dibujos funcionan, pero no se pueden cargar imágenes." /> : null}

    <section className="whiteboard-panel">
      <div className="whiteboard-library-bar">
        <div className="whiteboard-library-select">
          <FolderOpenOutlined aria-hidden="true" />
          <Select
            aria-label="Pizarras guardadas"
            value={query.data?.id ?? selectedBoardId ?? undefined}
            placeholder={boardsQuery.isLoading ? "Cargando pizarras…" : "Selecciona una pizarra"}
            loading={boardsQuery.isLoading}
            disabled={saving}
            showSearch
            optionFilterProp="label"
            options={(boardsQuery.data ?? []).map((board) => ({ value: board.id, label: board.title }))}
            onChange={(id) => { void openBoard(id); }}
          />
        </div>
        <Space wrap size={8}>
          <Button icon={<SaveOutlined />} disabled={!canEdit || saving} onClick={() => openNameModal("save")}>Guardar</Button>
          <Button type="primary" icon={<PlusOutlined />} disabled={!canEdit || saving} onClick={() => openNameModal("new")}>Nueva pizarra</Button>
        </Space>
      </div>
      <div className="whiteboard-toolbar" role="toolbar" aria-label="Herramientas de pizarra">
        <Space wrap size={8}>
          <Tooltip title="Seleccionar, mover y navegar por la pizarra">
            <Button shape="circle" type={tool === "select" ? "primary" : "default"} icon={<DragOutlined />} disabled={!canEdit} aria-label="Seleccionar, mover y navegar" onClick={() => setTool("select")} />
          </Tooltip>
          <Button type={tool === "draw" ? "primary" : "default"} icon={<HighlightOutlined />} disabled={!canEdit} onClick={() => setTool("draw")}>Dibujar</Button>
          <Tooltip title="Borrar trazos completos">
            <Button type={tool === "erase" ? "primary" : "default"} icon={<ScissorOutlined />} disabled={!canEdit} onClick={() => setTool("erase")}>Borrador</Button>
          </Tooltip>
          <Button icon={<span className="whiteboard-note-icon" style={{ background: noteColor }} />} disabled={!canEdit} onClick={addNote}>Nueva nota</Button>
          <Upload accept="image/jpeg,image/png,image/webp" showUploadList={false} disabled={!canEdit || !cloudinaryConfigured || saving} beforeUpload={(file) => { void uploadImage(file as File); return Upload.LIST_IGNORE; }}>
            <Button icon={<PictureOutlined />} disabled={!canEdit || !cloudinaryConfigured}>Imagen</Button>
          </Upload>
          <label className="whiteboard-color-control">Trazo <input type="color" value={drawColor} disabled={!canEdit} onChange={(event) => setDrawColor(event.target.value)} /></label>
          <Select aria-label="Grosor del trazo" value={strokeWidth} disabled={!canEdit} onChange={setStrokeWidth} options={[2, 4, 6, 10, 16].map((value) => ({ value, label: `${value} px` }))} style={{ width: 82 }} />
          <label className="whiteboard-color-control">Nota <input type="color" value={noteColor} disabled={!canEdit} onChange={(event) => setNoteColor(event.target.value)} /></label>
        </Space>
        <Space wrap size={8}>
          <Tooltip title={!elements.length ? "Agrega contenido para exportar" : !hasExportableChanges ? "No hay cambios desde la última descarga" : "Descargar la pizarra completa"}>
            <Button icon={<DownloadOutlined />} loading={exporting} disabled={!hasExportableChanges || saving} onClick={() => void exportBoard()}>Exportar PNG</Button>
          </Tooltip>
          {selectedId && canEdit ? <Button danger icon={<DeleteOutlined />} onClick={() => removeElement(selectedId)}>Eliminar selección</Button> : null}
          {elements.length && canEdit ? <Button danger icon={<ClearOutlined />} onClick={clearBoard}>Limpiar</Button> : null}
        </Space>
      </div>
      <div className="whiteboard-meta"><Typography.Text type="secondary">{lastUpdated}</Typography.Text><Typography.Text type="secondary">Puedes pegar una captura con Ctrl+V o arrastrar una imagen al lienzo.</Typography.Text></div>

      <div
        ref={surfaceRef}
        className={`whiteboard-surface${tool === "draw" ? " is-drawing" : tool === "erase" ? " is-erasing" : ""}`}
        onDragOver={(event) => { if (canEdit) event.preventDefault(); }}
        onDrop={(event) => {
          if (!canEdit || !flowRef.current) return;
          event.preventDefault();
          const file = [...event.dataTransfer.files].find((item) => item.type.startsWith("image/"));
          if (file) void uploadImage(file, flowRef.current.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
        }}
      >
        {query.isError ? <div className="whiteboard-state"><Alert type="error" showIcon message="No se pudo cargar la pizarra" action={<Button onClick={() => query.refetch()}>Reintentar</Button>} /></div> : query.isLoading ? <div className="whiteboard-state">Cargando pizarra…</div> : !elements.length && !canManage ? <div className="whiteboard-state"><Empty description="La pizarra todavía está vacía" /></div> : null}
        <BoardActionsContext.Provider value={actions}>
          <ReactFlow<BoardNode, Edge>
            colorMode={themeMode}
            nodes={nodes}
            edges={[]}
            nodeTypes={nodeTypes}
            onInit={(instance) => { flowRef.current = instance; }}
            onNodesChange={onNodesChange}
            onNodeDragStop={(_event, node) => updateElement(node.id, { x: Math.round(node.position.x), y: Math.round(node.position.y) })}
            onSelectionChange={({ nodes: selected }) => setSelectedId(selected[0]?.id ?? null)}
            onPaneClick={() => setSelectedId(null)}
            nodesConnectable={false}
            nodesDraggable={canEdit && tool === "select"}
            elementsSelectable={tool === "select"}
            deleteKeyCode={null}
            panOnDrag={tool === "select"}
            fitView={elements.length > 0}
            fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
            minZoom={0.2}
            maxZoom={2}
          >
            <Background gap={24} size={1.5} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeColor={(node) => {
              const element = (node.data as BoardNodeData).element;
              return element.type === "note" ? element.color : element.type === "image" ? "#2563eb" : "#475569";
            }} />
          </ReactFlow>
        </BoardActionsContext.Provider>
        {tool === "draw" && canEdit ? <div className="whiteboard-draw-overlay" onPointerDown={startDrawing} onPointerMove={continueDrawing} onPointerUp={finishDrawing} onPointerCancel={finishDrawing}>
          <svg aria-hidden="true"><path d={pathForPoints(draftPoints)} fill="none" stroke={drawColor} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div> : null}
        {tool === "erase" && canEdit ? <div className="whiteboard-draw-overlay is-eraser" aria-label="Borrador de trazos" onPointerDown={startErasing} onPointerMove={continueErasing} onPointerUp={finishErasing} onPointerCancel={finishErasing} /> : null}
      </div>
    </section>
    <Modal
      title={nameModalMode === "new" ? "Nueva pizarra" : "Guardar pizarra"}
      open={nameModalMode !== null}
      okText={nameModalMode === "new" ? "Crear y abrir" : "Guardar"}
      cancelText="Cancelar"
      confirmLoading={namingBoard}
      okButtonProps={{ disabled: !boardName.trim() }}
      onOk={() => { void confirmBoardName(); }}
      onCancel={() => { if (!namingBoard) setNameModalMode(null); }}
      destroyOnHidden
    >
      <label className="whiteboard-name-field">
        <span>Nombre de la pizarra</span>
        <Input value={boardName} maxLength={120} autoFocus placeholder="Ej. Plan semanal de producción" onChange={(event) => setBoardName(event.target.value)} onPressEnter={() => { if (boardName.trim()) void confirmBoardName(); }} />
      </label>
    </Modal>
  </div>;
}
