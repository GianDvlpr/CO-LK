"use client";

import { CarOutlined, EditOutlined, PlusOutlined, PrinterOutlined, ReloadOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Empty, Form, Input, InputNumber, Modal, Select, Space, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import Decimal from "decimal.js";
import { useState } from "react";
import { toast } from "sonner";
import { ModuleHeadingIntro } from "@/components/common/module-heading-intro";
import { ResponsiveTable as Table } from "@/components/common/responsive-table";

type PickLine = { id: string; requestedQuantity: string; pickedQuantity: string; packedQuantity: string; warehouseLocation?: string; lotCode?: string; incidentType?: string; incidentReason?: string; notes?: string; salesOrderLine: { productVariant: { sku: string; product: { code: string; name: string }; size: { name: string }; color: { name: string }; inventoryItem: { unit: { symbol: string } } } } };
type Package = { id: string; packageNumber: number; packageType?: string; weight?: string; length?: string; width?: string; height?: string; notes?: string };
type PickPack = { id: string; number: string; priority: "NORMAL" | "URGENT"; status: string; carrier?: string; shippingDocument?: string; notes?: string; createdAt: string; warehouse: { code: string; name: string }; salesOrder: { id: string; number: string; requestedAt: string; promisedAt?: string; customer: { code: string; name: string } }; lines: PickLine[]; packages: Package[] };
type Options = { orders: { id: string; number: string; requestedAt: string; promisedAt?: string; customer: { code: string; name: string }; lines: { quantity: string }[] }[] };
type CreateForm = { salesOrderId: string; priority: "NORMAL" | "URGENT"; notes?: string };
type EditForm = { priority: "NORMAL" | "URGENT"; carrier?: string; shippingDocument?: string; notes?: string; lines: { id: string; pickedQuantity: number; packedQuantity: number; warehouseLocation?: string; lotCode?: string; incidentType?: string; incidentReason?: string; notes?: string }[]; packages: { packageType?: string; weight?: number; length?: number; width?: number; height?: number; notes?: string }[] };

const statuses: Record<string, [string, string]> = { PENDING: ["Pendiente", "default"], PICKING: ["En picking", "blue"], PACKING: ["En packing", "purple"], READY: ["Listo para despacho", "green"], DISPATCHED: ["Despachado", "cyan"], CANCELLED: ["Cancelado", "default"] };
const incidents = [{ value: "SHORTAGE", label: "Faltante" }, { value: "DAMAGED", label: "Producto dañado" }, { value: "SUBSTITUTION", label: "Sustitución" }, { value: "OTHER", label: "Otro" }];

async function api<T>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, init); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo completar la operación."); return payload.data; }

export function PickPackWorkspace({ permissions }: { permissions: string[] }) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<PickPack>();
  const [createForm] = Form.useForm<CreateForm>();
  const [editForm] = Form.useForm<EditForm>();
  const records = useQuery({ queryKey: ["pick-pack"], queryFn: () => api<{ items: PickPack[] }>("/api/v1/pick-pack") });
  const options = useQuery({ queryKey: ["pick-pack-options"], queryFn: () => api<Options>("/api/v1/pick-pack/options") });
  const refresh = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["pick-pack"] }), queryClient.invalidateQueries({ queryKey: ["pick-pack-options"] }), queryClient.invalidateQueries({ queryKey: ["orders"] }), queryClient.invalidateQueries({ queryKey: ["inventory"] }), queryClient.invalidateQueries({ queryKey: ["kardex"] })]); };
  const create = useMutation({ mutationFn: (values: CreateForm) => api("/api/v1/pick-pack", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values) }), onSuccess: async () => { toast.success("Orden de Pick & Pack generada."); setCreateOpen(false); createForm.resetFields(); await refresh(); }, onError: (error) => toast.error(error.message) });
  const save = useMutation({ mutationFn: ({ values, nextStatus }: { values: EditForm; nextStatus?: string }) => api(`/api/v1/pick-pack/${editing?.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...values, nextStatus }) }), onSuccess: async (_, variables) => { toast.success(variables.nextStatus ? "Estado de preparación actualizado." : "Datos guardados."); setEditing(undefined); editForm.resetFields(); await refresh(); }, onError: (error) => toast.error(error.message) });
  const dispatch = useMutation({ mutationFn: (salesOrderId: string) => api(`/api/v1/orders/${salesOrderId}/dispatch`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), onSuccess: async () => { toast.success("Pedido despachado y kardex actualizado."); await refresh(); }, onError: (error) => toast.error(error.message) });

  const openEdit = (record: PickPack) => {
    setEditing(record);
    editForm.setFieldsValue({ priority: record.priority, carrier: record.carrier, shippingDocument: record.shippingDocument, notes: record.notes, lines: record.lines.map((line) => ({ id: line.id, pickedQuantity: Number(line.pickedQuantity), packedQuantity: Number(line.packedQuantity), warehouseLocation: line.warehouseLocation, lotCode: line.lotCode, incidentType: line.incidentType, incidentReason: line.incidentReason, notes: line.notes })), packages: record.packages.map((item) => ({ packageType: item.packageType, weight: item.weight ? Number(item.weight) : undefined, length: item.length ? Number(item.length) : undefined, width: item.width ? Number(item.width) : undefined, height: item.height ? Number(item.height) : undefined, notes: item.notes })) });
  };
  const next = editing?.status === "PENDING" ? ["PICKING", "Iniciar picking"] : editing?.status === "PICKING" ? ["PACKING", "Pasar a packing"] : editing?.status === "PACKING" ? ["READY", "Marcar listo"] : undefined;
  const canEdit = permissions.includes("pick_pack.update");

  const columns: ColumnsType<PickPack> = [
    { title: "Pick & Pack", dataIndex: "number", width: 170, render: (value, row) => <><strong>{value}</strong><br /><Typography.Text type="secondary">{dayjs(row.createdAt).format("DD/MM/YYYY HH:mm")}</Typography.Text></> },
    { title: "Pedido / cliente", width: 250, render: (_, row) => <><strong>{row.salesOrder.number}</strong><br /><Typography.Text type="secondary">{row.salesOrder.customer.code} · {row.salesOrder.customer.name}</Typography.Text></> },
    { title: "Almacén", width: 180, render: (_, row) => `${row.warehouse.code} · ${row.warehouse.name}` },
    { title: "Avance", width: 150, render: (_, row) => { const requested = row.lines.reduce((sum, line) => sum.add(line.requestedQuantity), new Decimal(0)); const packed = row.lines.reduce((sum, line) => sum.add(line.packedQuantity), new Decimal(0)); return `${packed.toFixed(0)} / ${requested.toFixed(0)} und.`; } },
    { title: "Prioridad", width: 100, render: (_, row) => <Tag color={row.priority === "URGENT" ? "red" : "default"}>{row.priority === "URGENT" ? "Urgente" : "Normal"}</Tag> },
    { title: "Estado", width: 150, render: (_, row) => { const [label, color] = statuses[row.status] ?? [row.status, "default"]; return <Tag color={color}>{label}</Tag>; } },
    { title: "Acciones", fixed: "right", width: 280, render: (_, row) => <Space wrap>{canEdit && !["READY", "DISPATCHED", "CANCELLED"].includes(row.status) ? <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>Preparar</Button> : null}{permissions.includes("pick_pack.print") ? <Button size="small" icon={<PrinterOutlined />} href={`/dashboard/pick-pack/${row.id}/print`} target="_blank">Formato</Button> : null}{row.status === "READY" && permissions.includes("orders.dispatch") ? <Button size="small" type="primary" icon={<CarOutlined />} onClick={() => Modal.confirm({ title: `¿Despachar ${row.salesOrder.number}?`, content: "Se descontarán del kardex únicamente las cantidades empacadas y se liberará cualquier diferencia reservada.", okText: "Despachar", onOk: () => dispatch.mutateAsync(row.salesOrder.id) })}>Despachar</Button> : null}</Space> },
  ];

  return <>
    <div className="page-heading"><ModuleHeadingIntro title="Pick & Pack" eyebrow="Preparación y despacho" description="Controla la recolección, empaque, incidencias y salida final. Picking y packing no descuentan stock; el kardex se actualiza al despachar lo realmente empacado." /><Space wrap className="module-actions"><Button icon={<ReloadOutlined />} onClick={() => records.refetch()}>Actualizar</Button></Space></div>
    <Card className="section-card" title="Órdenes de preparación" extra={permissions.includes("pick_pack.create") ? <Button type="primary" icon={<PlusOutlined />} onClick={() => { createForm.resetFields(); createForm.setFieldsValue({ priority: "NORMAL" }); setCreateOpen(true); }}>Generar Pick & Pack</Button> : null}>
      {records.error ? <Alert type="error" showIcon message={records.error.message} style={{ marginBottom: 16 }} /> : null}
      <Table rowKey="id" loading={records.isLoading} columns={columns} dataSource={records.data?.items ?? []} scroll={{ x: 1240 }} pagination={{ pageSize: 15 }} locale={{ emptyText: <Empty description="Aún no hay órdenes de preparación" /> }} />
    </Card>

    <Modal title="Generar orden de Pick & Pack" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => createForm.submit()} okText="Generar" confirmLoading={create.isPending} destroyOnHidden>
      {!options.data?.orders.length ? <Alert type="warning" showIcon message="No hay pedidos confirmados pendientes de preparación." style={{ marginBottom: 16 }} /> : null}
      <Form form={createForm} layout="vertical" onFinish={(values) => create.mutate(values)} initialValues={{ priority: "NORMAL" }}>
        <Form.Item name="salesOrderId" label="Pedido confirmado" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={options.data?.orders.map((order) => ({ value: order.id, label: `${order.number} · ${order.customer.name} · ${order.lines.length} líneas` }))} /></Form.Item>
        <Form.Item name="priority" label="Prioridad" rules={[{ required: true }]}><Select options={[{ value: "NORMAL", label: "Normal" }, { value: "URGENT", label: "Urgente" }]} /></Form.Item>
        <Form.Item name="notes" label="Observaciones"><Input.TextArea rows={3} /></Form.Item>
      </Form>
    </Modal>

    <Modal className="pick-pack-modal" title={`${editing?.number ?? "Pick & Pack"} · ${editing ? statuses[editing.status]?.[0] : ""}`} open={Boolean(editing)} onCancel={() => setEditing(undefined)} width={1060} destroyOnHidden footer={editing ? [<Button key="cancel" onClick={() => setEditing(undefined)}>Cerrar</Button>, <Button key="save" loading={save.isPending} onClick={() => editForm.validateFields().then((values) => save.mutate({ values }))}>Guardar</Button>, next && (next[0] !== "READY" || permissions.includes("pick_pack.ready")) ? <Button key="next" type="primary" loading={save.isPending} onClick={() => editForm.validateFields().then((values) => save.mutate({ values, nextStatus: next[0] }))}>{next[1]}</Button> : null] : null}>
      <Form form={editForm} layout="vertical">
        <div className="purchase-form-grid">
          <Form.Item name="priority" label="Prioridad" rules={[{ required: true }]}><Select options={[{ value: "NORMAL", label: "Normal" }, { value: "URGENT", label: "Urgente" }]} /></Form.Item>
          <Form.Item name="carrier" label="Transportista"><Input /></Form.Item>
          <Form.Item name="shippingDocument" label="Documento de salida" tooltip="Documento o guía generada para el despacho."><Input /></Form.Item>
        </div>
        <Form.Item name="notes" label="Observaciones"><Input.TextArea rows={2} /></Form.Item>
        <Typography.Title level={5}>Productos</Typography.Title>
        <Form.List name="lines">{(fields) => <Space direction="vertical" size="middle" style={{ width: "100%" }}>{fields.map((field, index) => { const line = editing?.lines[index]; return <Card size="small" key={field.key} title={line ? `${line.salesOrderLine.productVariant.sku} · ${line.salesOrderLine.productVariant.product.name} · Talla ${line.salesOrderLine.productVariant.size.name} · ${line.salesOrderLine.productVariant.color.name}` : `Línea ${index + 1}`} extra={line ? <Tag>Solicitado: {new Decimal(line.requestedQuantity).toFixed(0)} {line.salesOrderLine.productVariant.inventoryItem.unit.symbol}</Tag> : null}>
          <Form.Item name={[field.name, "id"]} hidden><Input /></Form.Item>
          <div className="pick-pack-line-grid">
            <Form.Item name={[field.name, "warehouseLocation"]} label="Ubicación"><Input placeholder="Zona / estante" /></Form.Item>
            <Form.Item name={[field.name, "lotCode"]} label="Lote"><Input /></Form.Item>
            <Form.Item name={[field.name, "pickedQuantity"]} label="Recogido" rules={[{ required: true }]}><InputNumber min={0} max={Number(line?.requestedQuantity ?? 0)} precision={3} style={{ width: "100%" }} /></Form.Item>
            <Form.Item name={[field.name, "packedQuantity"]} label="Empacado" rules={[{ required: true }]}><InputNumber min={0} max={Number(line?.requestedQuantity ?? 0)} precision={3} style={{ width: "100%" }} /></Form.Item>
            <Form.Item name={[field.name, "incidentType"]} label="Incidencia"><Select allowClear options={incidents} /></Form.Item>
            <Form.Item name={[field.name, "incidentReason"]} label="Motivo"><Input /></Form.Item>
            <Form.Item name={[field.name, "notes"]} label="Observación"><Input /></Form.Item>
          </div>
        </Card>; })}</Space>}</Form.List>
        <Typography.Title level={5} style={{ marginTop: 20 }}>Paquetes</Typography.Title>
        <Form.List name="packages">{(fields, { add, remove }) => <Space direction="vertical" style={{ width: "100%" }}>{fields.map((field, index) => <Card key={field.key} size="small" title={`Paquete ${index + 1}`} extra={<Button type="link" danger onClick={() => remove(field.name)}>Quitar</Button>}><div className="pick-pack-package-grid"><Form.Item name={[field.name, "packageType"]} label="Tipo"><Input placeholder="Caja, bolsa…" /></Form.Item><Form.Item name={[field.name, "weight"]} label="Peso kg"><InputNumber min={0} precision={3} style={{ width: "100%" }} /></Form.Item><Form.Item name={[field.name, "length"]} label="Largo cm"><InputNumber min={0} precision={2} style={{ width: "100%" }} /></Form.Item><Form.Item name={[field.name, "width"]} label="Ancho cm"><InputNumber min={0} precision={2} style={{ width: "100%" }} /></Form.Item><Form.Item name={[field.name, "height"]} label="Alto cm"><InputNumber min={0} precision={2} style={{ width: "100%" }} /></Form.Item><Form.Item name={[field.name, "notes"]} label="Observación"><Input /></Form.Item></div></Card>)}<Button block type="dashed" icon={<PlusOutlined />} onClick={() => add({})}>Agregar paquete</Button></Space>}</Form.List>
      </Form>
    </Modal>
  </>;
}
