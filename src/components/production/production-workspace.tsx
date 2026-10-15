"use client";

import { AppstoreOutlined, CheckOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, PlusOutlined, ReloadOutlined, RocketOutlined, UnorderedListOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, DatePicker, Divider, Empty, Form, Input, InputNumber, Modal, Radio, Segmented, Select, Space, Table, Tag, Typography } from "antd";
import type { FormInstance } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import Decimal from "decimal.js";
import { useState } from "react";
import { toast } from "sonner";
import { ModuleHeadingIntro } from "@/components/common/module-heading-intro";
import { ProductionKanban } from "@/components/production/production-kanban";
import { productionBoardTransition } from "@/modules/production/domain/production-board";

type Material = { id: string; plannedQuantity: string; consumedQuantity: string; item: { code: string; name: string; unit: { symbol: string } } };
type SizeProgram = { size: string; requestedPairs: number };
type DailyProduction = { date: string; size: string; quantity: number; observations?: string };
type SheetValues = {
  machineEquipment?: string; operatorName?: string; modelLogo?: string; materialLoad?: string; seriesLot?: string;
  processType?: "PRENSA" | "INYECTORA"; mold?: string; brandColor?: string; pressNumber?: string; pressLoad?: string;
  injectorNumber?: string; curve?: string; sizeProgram: SizeProgram[];
  dailyProduction: { date: Dayjs; size: string; quantity: number; observations?: string }[];
};
export type Order = {
  id: string; number: string; status: string; recipeRuns: string; plannedQuantity: string; producedQuantity: string; plannedAt?: string;
  machine?: { id: string; code: string; name: string; type: string; status: string };
  warehouse: { code: string; name: string }; productVariant: { id?: string; sku: string; product: { code: string; name: string }; size: { name: string }; color: { name: string } };
  recipeVersion: { version: number; recipe: { code: string; name: string } }; materials: Material[];
  machineEquipment?: string; operatorName?: string; modelLogo?: string; materialLoad?: string; seriesLot?: string; processType?: "PRENSA" | "INYECTORA";
  mold?: string; brandColor?: string; pressNumber?: string; pressLoad?: string; injectorNumber?: string; curve?: string;
  sizeProgram?: SizeProgram[]; dailyProduction?: DailyProduction[];
};
type Options = {
  warehouses: { id: string; code: string; name: string }[];
  variants: { id: string; sku: string; productId: string; product: { id: string; code: string; name: string }; size: { name: string }; color: { name: string } }[];
  recipes: { id: string; productId: string; code: string; name: string; product: { id: string; code: string; name: string }; versions: { id: string; version: number; yieldQuantity: string }[] }[];
  machines: { id: string; code: string; name: string; type: string; status: string }[];
};
type FormValues = SheetValues & { number: string; warehouseId: string; productVariantId: string; recipeVersionId: string; machineId?: string; recipeRuns: number; plannedAt?: Dayjs };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo completar la operación.");
  return payload.data;
}

const statuses: Record<string, [string, string]> = { DRAFT: ["Borrador", "blue"], RELEASED: ["Liberada", "gold"], IN_PROGRESS: ["En proceso", "processing"], COMPLETED: ["Completada", "green"], CANCELLED: ["Cancelada", "default"] };

function SheetFields({ form }: { form: FormInstance }) {
  const processType = Form.useWatch("processType", form);
  return <>
    <Divider titlePlacement="left">Datos de la ficha</Divider>
    <div className="purchase-form-grid">
      <Form.Item name="operatorName" label="Operario"><Input maxLength={150} /></Form.Item>
      <Form.Item name="modelLogo" label="Modelo / Logo"><Input maxLength={150} /></Form.Item>
      <Form.Item name="materialLoad" label="Material / Carga"><Input maxLength={150} /></Form.Item>
      <Form.Item name="seriesLot" label="Serie / Lote"><Input maxLength={150} /></Form.Item>
      <Form.Item name="mold" label="Matriz"><Input maxLength={150} /></Form.Item>
      <Form.Item name="brandColor" label="Color de marca"><Input maxLength={150} /></Form.Item>
      <Form.Item name="processType" label="Tipo de proceso"><Radio.Group options={[{ label: "Prensa", value: "PRENSA" }, { label: "Inyectora", value: "INYECTORA" }]} /></Form.Item>
      {processType === "PRENSA" ? <><Form.Item name="pressNumber" label="Prensa N.°"><Input maxLength={150} /></Form.Item><Form.Item name="pressLoad" label="Carga de prensa"><Input maxLength={150} /></Form.Item></> : null}
      {processType === "INYECTORA" ? <><Form.Item name="injectorNumber" label="Inyectora N.°"><Input maxLength={150} /></Form.Item><Form.Item name="curve" label="Curva"><Input maxLength={150} /></Form.Item></> : null}
    </div>

    <Divider titlePlacement="left">Programación por talla</Divider>
    <Typography.Paragraph type="secondary">La suma de pares solicitados debe coincidir con la producción planificada.</Typography.Paragraph>
    <Form.List name="sizeProgram">
      {(fields, { add, remove }) => <Space direction="vertical" style={{ width: "100%" }}>
        {fields.map((field) => <Space key={field.key} align="baseline" wrap>
          <Form.Item {...field} name={[field.name, "size"]} label="Talla" rules={[{ required: true }]}><Input style={{ width: 150 }} /></Form.Item>
          <Form.Item {...field} name={[field.name, "requestedPairs"]} label="Pares solicitados" rules={[{ required: true }]}><InputNumber min={0.001} precision={3} style={{ width: 180 }} /></Form.Item>
          <Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(field.name)}>Quitar</Button>
        </Space>)}
        <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ requestedPairs: 1 })}>Agregar talla</Button>
      </Space>}
    </Form.List>

    <Divider titlePlacement="left">Registro diario de producción</Divider>
    <Form.List name="dailyProduction">
      {(fields, { add, remove }) => <Space direction="vertical" style={{ width: "100%" }}>
        {fields.map((field) => <div key={field.key} className="purchase-form-grid">
          <Form.Item {...field} name={[field.name, "date"]} label="Fecha" rules={[{ required: true }]}><DatePicker style={{ width: "100%" }} /></Form.Item>
          <Form.Item {...field} name={[field.name, "size"]} label="Talla" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item {...field} name={[field.name, "quantity"]} label="Cantidad producida" rules={[{ required: true }]}><InputNumber min={0} precision={3} style={{ width: "100%" }} /></Form.Item>
          <Form.Item {...field} name={[field.name, "observations"]} label="Observaciones"><Input maxLength={300} suffix={<Button danger type="text" size="small" icon={<DeleteOutlined />} onClick={() => remove(field.name)} />} /></Form.Item>
        </div>)}
        <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ date: dayjs(), quantity: 0 })}>Agregar registro diario</Button>
      </Space>}
    </Form.List>
  </>;
}

function sheetPayload(values: SheetValues) {
  return { ...values, dailyProduction: values.dailyProduction?.map((item) => ({ ...item, date: item.date.format("YYYY-MM-DD") })) ?? [], sizeProgram: values.sizeProgram ?? [] };
}

function orderToSheet(order: Order): SheetValues {
  return {
    machineEquipment: order.machineEquipment, operatorName: order.operatorName, modelLogo: order.modelLogo, materialLoad: order.materialLoad,
    seriesLot: order.seriesLot, processType: order.processType, mold: order.mold, brandColor: order.brandColor, pressNumber: order.pressNumber,
    pressLoad: order.pressLoad, injectorNumber: order.injectorNumber, curve: order.curve, sizeProgram: order.sizeProgram ?? [],
    dailyProduction: (order.dailyProduction ?? []).map((item) => ({ ...item, date: dayjs(item.date) })),
  };
}

export function ProductionWorkspace({ permissions }: { permissions: string[] }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<Order>();
  const [completeOrder, setCompleteOrder] = useState<Order>();
  const [viewMode, setViewMode] = useState<"list" | "board">("list");
  const [form] = Form.useForm<FormValues>();
  const [editForm] = Form.useForm<SheetValues>();
  const [completeForm] = Form.useForm<{ producedQuantity: number }>();
  const recipeVersionId = Form.useWatch("recipeVersionId", form);
  const runs = Form.useWatch("recipeRuns", form) ?? 0;
  const orders = useQuery({ queryKey: ["production"], queryFn: () => api<{ items: Order[] }>("/api/v1/production") });
  const options = useQuery({ queryKey: ["production-options"], queryFn: () => api<Options>("/api/v1/production/options") });
  const selectedRecipe = options.data?.recipes.find((recipe) => recipe.versions[0]?.id === recipeVersionId);
  const allowedVariants = selectedRecipe ? options.data?.variants.filter((variant) => variant.product.id === selectedRecipe.product.id) : options.data?.variants;
  const planned = selectedRecipe ? new Decimal(selectedRecipe.versions[0].yieldQuantity).mul(runs) : new Decimal(0);
  const refresh = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["production"] }), queryClient.invalidateQueries({ queryKey: ["inventory"] }), queryClient.invalidateQueries({ queryKey: ["kardex"] }), queryClient.invalidateQueries({ queryKey: ["calendar"] })]); };
  const create = useMutation({ mutationFn: (values: FormValues) => api("/api/v1/production", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...sheetPayload(values), plannedAt: values.plannedAt?.format("YYYY-MM-DD") }) }), onSuccess: async () => { toast.success("Orden creada en borrador."); setOpen(false); form.resetFields(); await refresh(); }, onError: (error) => toast.error(error.message) });
  const update = useMutation({ mutationFn: ({ id, values }: { id: string; values: SheetValues }) => api(`/api/v1/production/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(sheetPayload(values)) }), onSuccess: async () => { toast.success("Ficha de producción actualizada."); setEditOrder(undefined); editForm.resetFields(); await refresh(); }, onError: (error) => toast.error(error.message) });
  const transition = useMutation({ mutationFn: ({ id, action, body }: { id: string; action: string; body?: object }) => api(`/api/v1/production/${id}/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) }), onSuccess: async (_, variables) => { toast.success(variables.action === "release" ? "Materiales reservados." : variables.action === "start" ? "Materiales consumidos y orden iniciada." : "Producción completada e ingresada al almacén."); setCompleteOrder(undefined); completeForm.resetFields(); await refresh(); }, onError: (error) => toast.error(error.message) });
  const startFromBoard = useMutation({ mutationFn: async (order: Order) => { if (order.status === "DRAFT") await api(`/api/v1/production/${order.id}/release`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); return api(`/api/v1/production/${order.id}/start`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); }, onSuccess: async () => { toast.success("Orden iniciada y materiales descontados del kardex."); await refresh(); }, onError: (error) => toast.error(error.message) });

  const columns: ColumnsType<Order> = [
    { title: "Orden", dataIndex: "number", width: 130, render: (value) => <strong>{value}</strong> },
    { title: "Producto / variante", width: 260, render: (_, row) => <><strong>{row.productVariant.product.name}</strong><br /><Typography.Text type="secondary">{row.productVariant.sku} · {row.productVariant.size.name} · {row.productVariant.color.name}</Typography.Text></> },
    { title: "Máquina / proceso", width: 180, render: (_, row) => <>{row.machine ? `${row.machine.code} · ${row.machine.name}` : row.machineEquipment || "—"}<br /><span className="table-secondary">{row.processType === "PRENSA" ? "Prensa" : row.processType === "INYECTORA" ? "Inyectora" : "Sin proceso"}</span></> },
    { title: "Planificado", dataIndex: "plannedQuantity", width: 110, align: "right", render: (value) => new Decimal(value).toFixed(2) },
    { title: "Producido", dataIndex: "producedQuantity", width: 110, align: "right", render: (value) => new Decimal(value).toFixed(2) },
    { title: "Estado", dataIndex: "status", width: 120, render: (value) => { const [label, color] = statuses[value] ?? [value, "default"]; return <Tag color={color}>{label}</Tag>; } },
    { title: "Acciones", fixed: "right", width: 390, render: (_, row) => <Space wrap>
      <Button size="small" icon={<DownloadOutlined />} href={`/api/v1/production/${row.id}/export`}>Descargar</Button>
      {permissions.includes("production.create") ? <Button size="small" icon={<EditOutlined />} onClick={() => { setEditOrder(row); editForm.setFieldsValue(orderToSheet(row)); }}>Ficha</Button> : null}
      {row.status === "DRAFT" && permissions.includes("production.release") ? <Button size="small" onClick={() => Modal.confirm({ title: `¿Liberar ${row.number}?`, content: "Se validará y reservará el stock de materiales.", okText: "Liberar", onOk: () => transition.mutateAsync({ id: row.id, action: "release" }) })}>Liberar</Button> : null}
      {row.status === "RELEASED" && permissions.includes("production.start") ? <Button size="small" type="primary" icon={<RocketOutlined />} onClick={() => Modal.confirm({ title: `¿Iniciar ${row.number}?`, content: "Esta acción descontará los materiales planificados del kardex.", okText: "Iniciar", onOk: () => transition.mutateAsync({ id: row.id, action: "start" }) })}>Iniciar</Button> : null}
      {row.status === "IN_PROGRESS" && permissions.includes("production.complete") ? <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => { setCompleteOrder(row); completeForm.setFieldsValue({ producedQuantity: Number(row.plannedQuantity) }); }}>Completar</Button> : null}
    </Space> },
  ];
  const materialColumns: ColumnsType<Material> = [
    { title: "Código", render: (_, row) => <strong>{row.item.code}</strong> }, { title: "Material", render: (_, row) => row.item.name },
    { title: "Planificado", align: "right", render: (_, row) => `${new Decimal(row.plannedQuantity).toFixed(3)} ${row.item.unit.symbol}` },
    { title: "Consumido", align: "right", render: (_, row) => `${new Decimal(row.consumedQuantity).toFixed(3)} ${row.item.unit.symbol}` },
  ];

  const moveOrder = (order: Order, targetStatus: string) => {
    if (transition.isPending || startFromBoard.isPending) return toast.info("Espera a que termine el movimiento anterior.");
    if (targetStatus === "IN_PROGRESS" && ["DRAFT", "RELEASED"].includes(order.status)) {
      const requiredPermissions = order.status === "DRAFT" ? ["production.release", "production.start"] : ["production.start"];
      if (requiredPermissions.some((permission) => !permissions.includes(permission))) return toast.error("No tienes permiso para iniciar esta orden.");
      return Modal.confirm({ title: `¿Iniciar ${order.number}?`, content: order.status === "DRAFT" ? "Se reservarán y consumirán los materiales necesarios, y se actualizará el kardex." : "Se consumirán los materiales reservados y se actualizará el kardex.", okText: "Iniciar y mover", onOk: () => startFromBoard.mutateAsync(order) });
    }
    const boardTransition = productionBoardTransition(order.status, targetStatus);
    if (!["DRAFT", "RELEASED", "IN_PROGRESS"].includes(order.status)) return toast.info("Esta columna es solo de consulta.");
    if (!boardTransition) return toast.info("Las órdenes deben avanzar una columna a la vez; no se puede omitir ni revertir una etapa.");
    if (!permissions.includes(boardTransition.permission)) return toast.error("No tienes permiso para realizar esta transición.");
    setCompleteOrder(order);
    completeForm.setFieldsValue({ producedQuantity: Number(order.plannedQuantity) });
  };

  return <>
    <div className="page-heading"><ModuleHeadingIntro title="Producción" eyebrow="Manufactura" description="Gestiona el flujo Pendiente → En curso → Finalizado. Al iniciar se reservan y consumen los materiales; al finalizar ingresa el producto al almacén." /><Space wrap className="module-actions"><Segmented value={viewMode} onChange={(value) => setViewMode(value as "list" | "board")} options={[{ value: "list", label: "Lista", icon: <UnorderedListOutlined /> }, { value: "board", label: "Tablero", icon: <AppstoreOutlined /> }]} /><Button icon={<ReloadOutlined />} onClick={() => orders.refetch()}>Actualizar</Button></Space></div>
    <Card className="section-card production-board-card" title={viewMode === "list" ? "Órdenes de producción" : "Tablero de producción"} extra={permissions.includes("production.create") ? <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>Nueva orden</Button> : null}>
      {orders.error ? <Alert type="error" showIcon message={orders.error.message} style={{ marginBottom: 16 }} /> : null}
      {viewMode === "list" ? <Table rowKey="id" loading={orders.isLoading} columns={columns} dataSource={orders.data?.items ?? []} expandable={{ expandedRowRender: (row) => <Table rowKey="id" size="small" pagination={false} columns={materialColumns} dataSource={row.materials} /> }} scroll={{ x: 1450 }} pagination={{ pageSize: 15 }} locale={{ emptyText: <Empty description="Aún no hay órdenes de producción" /> }} /> : <ProductionKanban orders={orders.data?.items ?? []} onMove={moveOrder} onOpen={(order) => { if (!permissions.includes("production.create")) return; setEditOrder(order); editForm.setFieldsValue(orderToSheet(order)); }} />}
    </Card>

    <Modal title="Nueva orden de producción" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="Crear borrador" confirmLoading={create.isPending} width={1100} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(values) => create.mutate(values)} initialValues={{ recipeRuns: 1, plannedAt: dayjs(), sizeProgram: [], dailyProduction: [] }}>
        <Divider titlePlacement="left">Orden y planificación</Divider>
        <div className="purchase-form-grid">
          <Form.Item name="number" label="N.° de orden" rules={[{ required: true }]}><Input placeholder="OP-0001" /></Form.Item>
          <Form.Item name="warehouseId" label="Almacén" rules={[{ required: true }]}><Select options={options.data?.warehouses.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))} /></Form.Item>
          <Form.Item name="plannedAt" label="Fecha"><DatePicker style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="recipeRuns" label="Ejecuciones de receta" rules={[{ required: true }]}><InputNumber min={0.001} precision={3} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="machineId" label="Máquina / Equipo"><Select allowClear showSearch optionFilterProp="label" placeholder="Selecciona una máquina registrada" onChange={(id) => { const machine = options.data?.machines.find((item) => item.id === id); if (machine?.type === "PRESS") form.setFieldValue("processType", "PRENSA"); if (machine?.type === "INJECTOR") form.setFieldValue("processType", "INYECTORA"); }} options={options.data?.machines.map((machine) => ({ value: machine.id, label: `${machine.code} · ${machine.name}${machine.status === "MAINTENANCE" ? " · En mantenimiento" : ""}` }))} /></Form.Item>
        </div>
        <Form.Item name="recipeVersionId" label="Receta activa" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" onChange={() => form.setFieldValue("productVariantId", undefined)} options={options.data?.recipes.filter((recipe) => recipe.versions[0]).map((recipe) => ({ value: recipe.versions[0].id, label: `${recipe.code} · ${recipe.name} · v${recipe.versions[0].version}` }))} /></Form.Item>
        <Form.Item name="productVariantId" label="Variante principal" rules={[{ required: true }]}><Select disabled={!selectedRecipe} showSearch optionFilterProp="label" onChange={(id) => { const variant = options.data?.variants.find((item) => item.id === id); if (variant) form.setFieldsValue({ modelLogo: variant.product.name, brandColor: variant.color.name, sizeProgram: [{ size: variant.size.name, requestedPairs: Number(planned.toString()) || 1 }] }); }} options={allowedVariants?.map((variant) => ({ value: variant.id, label: `${variant.sku} · ${variant.product.name} · ${variant.size.name} · ${variant.color.name}` }))} /></Form.Item>
        {selectedRecipe ? <Alert type="info" showIcon message={`Producción planificada: ${planned.toFixed(2)} pares. La programación por talla debe sumar esta cantidad.`} /> : null}
        <SheetFields form={form} />
      </Form>
    </Modal>

    <Modal title={`Ficha de ${editOrder?.number ?? "producción"}`} open={Boolean(editOrder)} onCancel={() => setEditOrder(undefined)} onOk={() => editForm.submit()} okText="Guardar ficha" confirmLoading={update.isPending} width={1100} destroyOnHidden>
      <Form form={editForm} layout="vertical" onFinish={(values) => editOrder && update.mutate({ id: editOrder.id, values })}><SheetFields form={editForm} /></Form>
    </Modal>

    <Modal title={`Completar ${completeOrder?.number ?? "orden"}`} open={Boolean(completeOrder)} onCancel={() => setCompleteOrder(undefined)} onOk={() => completeForm.submit()} okText="Ingresar producto terminado" confirmLoading={transition.isPending} destroyOnHidden>
      <Alert type="warning" showIcon message="La cantidad indicada ingresará al almacén y recibirá el costo total de los materiales consumidos." style={{ marginBottom: 16 }} />
      <Form form={completeForm} layout="vertical" onFinish={(values) => completeOrder && transition.mutate({ id: completeOrder.id, action: "complete", body: values })}><Form.Item name="producedQuantity" label="Cantidad buena producida" rules={[{ required: true }]}><InputNumber min={0.001} precision={3} style={{ width: "100%" }} /></Form.Item></Form>
    </Modal>
  </>;
}
