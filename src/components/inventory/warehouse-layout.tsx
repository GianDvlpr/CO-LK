"use client";

import { DeleteOutlined, EditOutlined, PlusOutlined, StopOutlined } from "@ant-design/icons";
import { Background, Controls, MiniMap, ReactFlow, useNodesState, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Empty, Form, Input, Modal, Select, Space, Tag, Typography } from "antd";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type CSSProperties } from "react";
import { toast } from "sonner";

type Sector = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  layoutOrder: number;
  layoutX: number;
  layoutY: number;
  layoutWidth: number;
  layoutColor: string;
  _count: { defaultInventoryItems: number; balances: number };
};
type SectorForm = { code: string; name: string; description?: string; layoutWidth: number; layoutColor: string };
type SectorActions = { edit: (sector: Sector) => void; deactivate: (sector: Sector) => void; remove: (sector: Sector) => void };
type SectorNodeData = { sector: Sector; canManage: boolean };
type SectorNode = Node<SectorNodeData, "sector">;

const SectorActionsContext = createContext<SectorActions | null>(null);

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo completar la operación.");
  return payload.data;
}

function nodeWidth(layoutWidth: number) {
  if (layoutWidth >= 3) return 720;
  if (layoutWidth === 2) return 470;
  return 230;
}

function SectorNodeView({ data }: NodeProps<SectorNode>) {
  const actions = useContext(SectorActionsContext);
  const { sector, canManage } = data;
  return <article className="warehouse-sector" style={{ "--sector-color": sector.layoutColor } as CSSProperties}>
    <div className="warehouse-sector-accent" />
    <div className="warehouse-sector-header">
      <div><Tag color={sector.layoutColor}>{sector.code}</Tag><Typography.Text strong>{sector.name}</Typography.Text></div>
      {canManage && actions ? <Space size={2} className="nodrag">
        <Button type="text" size="small" icon={<EditOutlined />} aria-label={`Editar ${sector.name}`} onClick={() => actions.edit(sector)} />
        <Button type="text" size="small" icon={<StopOutlined />} aria-label={`Desactivar ${sector.name}`} onClick={() => actions.deactivate(sector)} />
        <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label={`Eliminar ${sector.name}`} onClick={() => actions.remove(sector)} />
      </Space> : null}
    </div>
    {sector.description ? <Typography.Paragraph className="warehouse-sector-description" ellipsis={{ rows: 2 }}>{sector.description}</Typography.Paragraph> : null}
    <div className="warehouse-sector-stats"><span><strong>{sector._count.defaultInventoryItems}</strong> ítems asignados</span><span><strong>{sector._count.balances}</strong> posiciones con stock</span></div>
  </article>;
}

const nodeTypes = { sector: SectorNodeView };

export function WarehouseLayout({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Sector | null>();
  const [form] = Form.useForm<SectorForm>();
  const query = useQuery({ queryKey: ["warehouse-layout"], queryFn: () => api<{ sectors: Sector[] }>("/api/v1/inventory/layout") });
  const sectors = useMemo(() => query.data?.sectors ?? [], [query.data]);
  const [nodes, setNodes, onNodesChange] = useNodesState<SectorNode>([]);

  const refresh = useCallback(async () => { await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["warehouse-layout"] }),
    queryClient.invalidateQueries({ queryKey: ["catalogs"] }),
    queryClient.invalidateQueries({ queryKey: ["inventory-options"] }),
    queryClient.invalidateQueries({ queryKey: ["purchase-options"] }),
    queryClient.invalidateQueries({ queryKey: ["production-options"] }),
    queryClient.invalidateQueries({ queryKey: ["recipe-options"] }),
  ]); }, [queryClient]);

  const create = useMutation({
    mutationFn: (values: SectorForm) => api("/api/v1/inventory/layout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values) }),
    onSuccess: async () => { toast.success("Sector agregado al plano."); setEditing(undefined); form.resetFields(); await refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const update = useMutation({
    mutationFn: (payload: { sectors: Partial<Sector>[] }) => api("/api/v1/inventory/layout", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }),
    onSuccess: async (_data, variables) => { if (variables.sectors.some((sector) => sector.name)) { toast.success("Sector actualizado."); setEditing(undefined); form.resetFields(); } await refresh(); },
    onError: async (error) => { toast.error(error.message); await query.refetch(); },
  });
  const archive = useMutation({
    mutationFn: (id: string) => api(`/api/v1/catalogs/WAREHOUSE/${id}/status`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active: false }) }),
    onSuccess: async () => { toast.success("Almacén desactivado."); await refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/v1/catalogs/WAREHOUSE/${id}`, { method: "DELETE" }),
    onSuccess: async () => { toast.success("Almacén eliminado."); await refresh(); },
    onError: (error) => toast.error(error.message),
  });

  const openEdit = useCallback((sector: Sector) => {
    setEditing(sector);
    form.setFieldsValue({ code: sector.code, name: sector.name, description: sector.description ?? undefined, layoutWidth: sector.layoutWidth, layoutColor: sector.layoutColor });
  }, [form]);
  const confirmDeactivate = useCallback((sector: Sector) => {
    Modal.confirm({ title: `¿Desactivar ${sector.code}?`, content: "Solo se puede desactivar si no tiene stock en mano ni reservado. Puedes reactivarlo desde Catálogos → Almacenes.", okText: "Desactivar", cancelText: "Cancelar", okButtonProps: { danger: true }, onOk: () => archive.mutateAsync(sector.id) });
  }, [archive]);
  const confirmDelete = useCallback((sector: Sector) => {
    Modal.confirm({ title: `¿Eliminar ${sector.code}?`, content: "Solo se elimina si nunca tuvo movimientos, stock ni documentos asociados.", okText: "Eliminar", cancelText: "Cancelar", okButtonProps: { danger: true }, onOk: () => remove.mutateAsync(sector.id) });
  }, [remove]);
  const actions = useMemo<SectorActions>(() => ({ edit: openEdit, deactivate: confirmDeactivate, remove: confirmDelete }), [openEdit, confirmDeactivate, confirmDelete]);

  useEffect(() => {
    setNodes(sectors.map((sector) => ({
      id: sector.id,
      type: "sector",
      position: { x: sector.layoutX, y: sector.layoutY },
      data: { sector, canManage },
      draggable: canManage,
      selectable: false,
      style: { width: nodeWidth(sector.layoutWidth) },
    })));
  }, [sectors, canManage, setNodes]);

  const openCreate = () => { setEditing(null); form.resetFields(); form.setFieldsValue({ layoutWidth: 1, layoutColor: "#1677ff" }); };
  const submit = (values: SectorForm) => editing
    ? update.mutate({ sectors: [{ id: editing.id, name: values.name, description: values.description ?? null, layoutWidth: values.layoutWidth, layoutColor: values.layoutColor }] })
    : create.mutate(values);

  return <Card
    className="section-card warehouse-layout-card"
    title={<Space><span>Mapa de sectores</span><Tag>{sectors.length} sectores</Tag>{canManage ? <Tag color="blue">Arrastra para ubicar</Tag> : null}</Space>}
    extra={canManage ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nuevo sector</Button> : null}
    loading={query.isLoading}
  >
    {sectors.length ? <SectorActionsContext.Provider value={actions}>
      <div className="warehouse-map">
        <ReactFlow
          nodes={nodes}
          edges={[]}
          onNodesChange={onNodesChange}
          onNodeDragStop={(_event, node) => { if (canManage) update.mutate({ sectors: [{ id: node.id, layoutX: Math.round(node.position.x), layoutY: Math.round(node.position.y) }] }); }}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.35}
          maxZoom={1.6}
          nodesConnectable={false}
          nodesDraggable={canManage}
          elementsSelectable={false}
          deleteKeyCode={null}
        >
          <Background gap={24} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
    </SectorActionsContext.Provider> : <Empty description="Aún no hay sectores registrados" />}
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
