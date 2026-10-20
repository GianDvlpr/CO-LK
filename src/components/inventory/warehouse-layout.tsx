"use client";

import { EditOutlined, HolderOutlined, PlusOutlined } from "@ant-design/icons";
import { DndContext, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Empty, Form, Input, Modal, Select, Space, Tag, Typography } from "antd";
import { useState, type CSSProperties } from "react";
import { toast } from "sonner";

type Sector = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  layoutOrder: number;
  layoutWidth: number;
  layoutColor: string;
  _count: { defaultInventoryItems: number; balances: number };
};
type SectorForm = { code: string; name: string; description?: string; layoutWidth: number; layoutColor: string };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo completar la operación.");
  return payload.data;
}

function SectorBlock({ sector, canManage, onEdit }: { sector: Sector; canManage: boolean; onEdit: (sector: Sector) => void }) {
  const { attributes, listeners, setNodeRef: setDragRef, setActivatorNodeRef, transform: dragTransform, isDragging } = useDraggable({ id: sector.id, disabled: !canManage });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: sector.id, disabled: !canManage });
  const setRef = (node: HTMLElement | null) => { setDragRef(node); setDropRef(node); };
  const transform = dragTransform ? `translate3d(${dragTransform.x}px, ${dragTransform.y}px, 0)` : undefined;
  return <article
    ref={setRef}
    className={`warehouse-sector warehouse-sector-width-${sector.layoutWidth}${isDragging ? " is-dragging" : ""}${isOver ? " is-over" : ""}`}
    style={{ "--sector-color": sector.layoutColor, transform } as CSSProperties}
  >
    <div className="warehouse-sector-accent" />
    <div className="warehouse-sector-header">
      <div><Tag color={sector.layoutColor}>{sector.code}</Tag><Typography.Text strong>{sector.name}</Typography.Text></div>
      <Space size={4}>
        {canManage ? <Button type="text" size="small" icon={<EditOutlined />} aria-label={`Editar ${sector.name}`} onClick={() => onEdit(sector)} /> : null}
        {canManage ? <button ref={setActivatorNodeRef} type="button" className="warehouse-sector-drag-handle" aria-label={`Mover ${sector.name}`} title="Mantén presionado y arrastra" {...attributes} {...listeners}><HolderOutlined aria-hidden /></button> : null}
      </Space>
    </div>
    {sector.description ? <Typography.Paragraph className="warehouse-sector-description" ellipsis={{ rows: 2 }}>{sector.description}</Typography.Paragraph> : null}
    <div className="warehouse-sector-stats"><span><strong>{sector._count.defaultInventoryItems}</strong> ítems asignados</span><span><strong>{sector._count.balances}</strong> posiciones con stock</span></div>
  </article>;
}

export function WarehouseLayout({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [localSectors, setLocalSectors] = useState<Sector[] | null>(null);
  const [editing, setEditing] = useState<Sector | null>();
  const [form] = Form.useForm<SectorForm>();
  const query = useQuery({ queryKey: ["warehouse-layout"], queryFn: () => api<{ sectors: Sector[] }>("/api/v1/inventory/layout") });
  const sectors = localSectors ?? query.data?.sectors ?? [];
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );
  const refresh = async () => { await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["warehouse-layout"] }),
    queryClient.invalidateQueries({ queryKey: ["inventory-options"] }),
    queryClient.invalidateQueries({ queryKey: ["catalogs"] }),
  ]); };
  const create = useMutation({
    mutationFn: (values: SectorForm) => api("/api/v1/inventory/layout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values) }),
    onSuccess: async () => { toast.success("Sector agregado al plano."); setEditing(undefined); form.resetFields(); await refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const update = useMutation({
    mutationFn: (payload: { sectors: Partial<Sector>[] }) => api("/api/v1/inventory/layout", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }),
    onSuccess: async (_data, variables) => { if (variables.sectors.some((sector) => sector.name)) { toast.success("Sector actualizado."); setEditing(undefined); form.resetFields(); } await refresh(); setLocalSectors(null); },
    onError: async (error) => { toast.error(error.message); setLocalSectors(null); await query.refetch(); },
  });
  const openCreate = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ layoutWidth: 1, layoutColor: "#1677ff" }); };
  const openEdit = (sector: Sector) => { setEditing(sector); form.setFieldsValue({ code: sector.code, name: sector.name, description: sector.description ?? undefined, layoutWidth: sector.layoutWidth, layoutColor: sector.layoutColor }); };
  const submit = (values: SectorForm) => editing
    ? update.mutate({ sectors: [{ id: editing.id, name: values.name, description: values.description ?? null, layoutWidth: values.layoutWidth, layoutColor: values.layoutColor }] })
    : create.mutate(values);
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const source = sectors.findIndex((sector) => sector.id === active.id);
    const target = sectors.findIndex((sector) => sector.id === over.id);
    if (source < 0 || target < 0) return;
    const next = [...sectors];
    const [moved] = next.splice(source, 1);
    next.splice(target, 0, moved);
    const ordered = next.map((sector, layoutOrder) => ({ ...sector, layoutOrder }));
    setLocalSectors(ordered);
    update.mutate({ sectors: ordered.map(({ id, layoutOrder }) => ({ id, layoutOrder })) });
  };

  return <Card
    className="section-card warehouse-layout-card"
    title={<Space><span>Plano de sectores</span><Tag>{sectors.length} sectores</Tag>{canManage ? <Tag color="blue">Arrastra para ordenar</Tag> : null}</Space>}
    extra={canManage ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nuevo sector</Button> : null}
    loading={query.isLoading}
  >
    {sectors.length ? <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="warehouse-layout-board">
        {sectors.map((sector) => <SectorBlock key={sector.id} sector={sector} canManage={canManage} onEdit={openEdit} />)}
      </div>
    </DndContext> : <Empty description="Aún no hay sectores registrados" />}
    <Modal title={editing ? "Editar sector" : "Nuevo sector"} open={editing !== undefined} onCancel={() => setEditing(undefined)} onOk={() => form.submit()} okText={editing ? "Guardar" : "Agregar al plano"} confirmLoading={create.isPending || update.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={submit}>
        <div className="modal-form-grid modal-form-grid-2">
          <Form.Item name="code" label="Código" rules={[{ required: true }]}><Input disabled={Boolean(editing)} maxLength={50} placeholder="Ejemplo: MP-A" /></Form.Item>
          <Form.Item name="name" label="Nombre del sector" rules={[{ required: true }]}><Input maxLength={150} placeholder="Materia prima A" /></Form.Item>
          <Form.Item name="layoutWidth" label="Ancho visual" rules={[{ required: true }]}><Select options={[{ value: 1, label: "Pequeño · 1 bloque" }, { value: 2, label: "Mediano · 2 bloques" }, { value: 3, label: "Grande · 3 bloques" }]} /></Form.Item>
          <Form.Item name="layoutColor" label="Color" rules={[{ required: true }]}><Input type="color" style={{ height: 40, padding: 4 }} /></Form.Item>
          <Form.Item className="form-span-all" name="description" label="Descripción"><Input.TextArea rows={2} maxLength={300} placeholder="Uso, ubicación física o indicaciones del sector" /></Form.Item>
        </div>
      </Form>
    </Modal>
  </Card>;
}
