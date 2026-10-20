"use client";

import { CheckCircleOutlined, EditOutlined, MinusCircleOutlined, PlayCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Empty, Form, Input, InputNumber, Modal, Select, Space, Tabs, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { toast } from "sonner";
import { ModuleImportButton } from "@/components/imports/module-import-button";
import { ResponsiveTable as Table } from "@/components/common/responsive-table";

type OptionItem = { id: string; code: string; name: string; type: string; lotTrackingMode: string; unit: { symbol: string } };
type Options = { warehouses: { id: string; code: string; name: string }[]; items: OptionItem[] };
type Ingredient = { id: string; quantity: string; item: OptionItem };
type Formula = { id: string; code: string; name: string; active: boolean; outputItem: OptionItem; versions: { id: string; version: number; yieldQuantity: string; notes?: string | null; ingredients: Ingredient[] }[] };
type Material = { id: string; plannedQuantity: string; consumedQuantity: string; unitCost: string; item: OptionItem };
type Transformation = { id: string; number: string; status: string; plannedOutputQuantity: string; actualOutputQuantity: string; actualWasteQuantity: string; outputLotCode?: string | null; createdAt: string; warehouse: { code: string; name: string }; formulaVersion: { id: string; version: number; formula: { code: string; name: string; outputItem: OptionItem } }; materials: Material[] };
type FormulaForm = { code?: string; name: string; outputItemId: string; yieldQuantity: number; notes?: string; ingredients: { itemId: string; quantity: number }[] };
type TransformationForm = { warehouseId: string; formulaVersionId: string; plannedOutputQuantity: number; outputLotCode?: string; notes?: string };
type CompletionForm = { actualOutputQuantity: number; actualWasteQuantity: number };

async function api<T>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, init); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo completar la operación."); return payload.data; }
const post = <T,>(url: string, body?: unknown) => api<T>(url, { method: "POST", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });

export function InventoryTransformationsWorkspace({ permissions, canManage }: { permissions: string[]; canManage: boolean }) {
  const queryClient = useQueryClient();
  const [formulaOpen, setFormulaOpen] = useState(false); const [formulaForm] = Form.useForm<FormulaForm>();
  const [orderOpen, setOrderOpen] = useState(false); const [orderForm] = Form.useForm<TransformationForm>();
  const [completing, setCompleting] = useState<Transformation>(); const [completionForm] = Form.useForm<CompletionForm>();
  const options = useQuery({ queryKey: ["inventory-options"], queryFn: () => api<Options>("/api/v1/inventory/options") });
  const formulas = useQuery({ queryKey: ["inventory-formulas"], queryFn: () => api<{ items: Formula[] }>("/api/v1/inventory/formulas") });
  const transformations = useQuery({ queryKey: ["inventory-transformations"], queryFn: () => api<{ items: Transformation[] }>("/api/v1/inventory/transformations") });
  const refresh = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["inventory"] }), queryClient.invalidateQueries({ queryKey: ["inventory-options"] }), queryClient.invalidateQueries({ queryKey: ["inventory-formulas"] }), queryClient.invalidateQueries({ queryKey: ["inventory-transformations"] })]); };
  const saveFormula = useMutation({ mutationFn: (values: FormulaForm) => post("/api/v1/inventory/formulas", values), onSuccess: async () => { toast.success("Fórmula guardada como una nueva versión."); setFormulaOpen(false); formulaForm.resetFields(); await refresh(); }, onError: (error) => toast.error(error.message) });
  const createOrder = useMutation({ mutationFn: (values: TransformationForm) => post("/api/v1/inventory/transformations", values), onSuccess: async () => { toast.success("Orden de transformación creada."); setOrderOpen(false); orderForm.resetFields(); await refresh(); }, onError: (error) => toast.error(error.message) });
  const startOrder = useMutation({ mutationFn: (id: string) => post(`/api/v1/inventory/transformations/${id}/start`), onSuccess: async () => { toast.success("Componentes descontados del almacén."); await refresh(); }, onError: (error) => toast.error(error.message) });
  const completeOrder = useMutation({ mutationFn: (values: CompletionForm) => post(`/api/v1/inventory/transformations/${completing?.id}/complete`, values), onSuccess: async () => { toast.success("Insumo elaborado ingresado al almacén."); setCompleting(undefined); completionForm.resetFields(); await refresh(); }, onError: (error) => toast.error(error.message) });
  const inputItems = options.data?.items.filter((item) => item.type !== "FINISHED_PRODUCT") ?? [];
  const formulaColumns: ColumnsType<Formula> = [
    { title: "Código", dataIndex: "code", width: 130, render: (value) => <strong>{value}</strong> },
    { title: "Fórmula", dataIndex: "name", width: 220 },
    { title: "Resultado", width: 240, render: (_, row) => `${row.outputItem.code} · ${row.outputItem.name}` },
    { title: "Versión", width: 90, render: (_, row) => row.versions[0]?.version ?? "—" },
    { title: "Rendimiento", width: 130, render: (_, row) => row.versions[0] ? `${row.versions[0].yieldQuantity} ${row.outputItem.unit.symbol}` : "—" },
    { title: "Componentes", width: 360, render: (_, row) => <Space wrap>{row.versions[0]?.ingredients.map((ingredient) => <Tag key={ingredient.id}>{ingredient.item.code}: {ingredient.quantity} {ingredient.item.unit.symbol}</Tag>)}</Space> },
    ...(canManage ? [{ title: "Acciones", width: 120, render: (_: unknown, row: Formula) => <Button size="small" icon={<EditOutlined />} onClick={() => { const version = row.versions[0]; formulaForm.setFieldsValue({ code: row.code, name: row.name, outputItemId: row.outputItem.id, yieldQuantity: Number(version?.yieldQuantity ?? 1), notes: version?.notes ?? undefined, ingredients: version?.ingredients.map((ingredient) => ({ itemId: ingredient.item.id, quantity: Number(ingredient.quantity) })) ?? [] }); setFormulaOpen(true); }}>Nueva versión</Button> }] : []),
  ];
  const statusLabel: Record<string, { label: string; color: string }> = { DRAFT: { label: "Borrador", color: "default" }, IN_PROGRESS: { label: "En curso", color: "processing" }, COMPLETED: { label: "Finalizada", color: "success" }, CANCELLED: { label: "Cancelada", color: "error" } };
  const transformationColumns: ColumnsType<Transformation> = [
    { title: "Orden", dataIndex: "number", width: 170, render: (value) => <strong>{value}</strong> },
    { title: "Fecha", dataIndex: "createdAt", width: 115, render: (value) => new Date(value).toLocaleDateString("es-PE") },
    { title: "Fórmula", width: 230, render: (_, row) => `${row.formulaVersion.formula.code} · ${row.formulaVersion.formula.name}` },
    { title: "Resultado", width: 220, render: (_, row) => `${row.formulaVersion.formula.outputItem.code} · ${row.formulaVersion.formula.outputItem.name}` },
    { title: "Planificado", width: 120, align: "right", render: (_, row) => `${row.plannedOutputQuantity} ${row.formulaVersion.formula.outputItem.unit.symbol}` },
    { title: "Obtenido", width: 110, align: "right", render: (_, row) => row.status === "COMPLETED" ? row.actualOutputQuantity : "—" },
    { title: "Merma", width: 100, align: "right", render: (_, row) => row.status === "COMPLETED" ? row.actualWasteQuantity : "—" },
    { title: "Estado", width: 115, render: (_, row) => <Tag color={statusLabel[row.status]?.color}>{statusLabel[row.status]?.label ?? row.status}</Tag> },
    ...(canManage ? [{ title: "Acciones", width: 150, render: (_: unknown, row: Transformation) => row.status === "DRAFT" ? <Button size="small" type="primary" icon={<PlayCircleOutlined />} loading={startOrder.isPending} onClick={() => Modal.confirm({ title: "Iniciar transformación", content: "Se descontarán los componentes del stock y se registrará el kardex.", okText: "Iniciar", onOk: () => startOrder.mutateAsync(row.id) })}>Iniciar</Button> : row.status === "IN_PROGRESS" ? <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => { setCompleting(row); completionForm.setFieldsValue({ actualOutputQuantity: Number(row.plannedOutputQuantity), actualWasteQuantity: 0 }); }}>Finalizar</Button> : null }] : []),
  ];
  return <Card className="section-card" title="Elaboración de insumos">
    <Tabs items={[
      { key: "formulas", label: "Fórmulas de insumos", children: <><div className="module-actions" style={{ marginBottom: 16 }}><Space wrap><ModuleImportButton module="inventory-formulas" permissions={permissions} />{canManage ? <Button type="primary" icon={<PlusOutlined />} onClick={() => { formulaForm.resetFields(); formulaForm.setFieldsValue({ yieldQuantity: 1, ingredients: [{ quantity: 1 }] }); setFormulaOpen(true); }}>Nueva fórmula</Button> : null}</Space></div>{formulas.error ? <Alert type="error" showIcon message={formulas.error.message} /> : null}<Table rowKey="id" loading={formulas.isLoading} columns={formulaColumns} dataSource={formulas.data?.items ?? []} scroll={{ x: 1280 }} pagination={{ pageSize: 8, pageSizeOptions: [8, 16, 32] }} locale={{ emptyText: <Empty description="Aún no hay fórmulas de insumos" /> }} /></> },
      { key: "orders", label: "Órdenes de transformación", children: <><div className="module-actions" style={{ marginBottom: 16 }}>{canManage ? <Button type="primary" icon={<PlusOutlined />} disabled={!formulas.data?.items.length} onClick={() => { orderForm.resetFields(); orderForm.setFieldsValue({ plannedOutputQuantity: 1 }); setOrderOpen(true); }}>Nueva transformación</Button> : null}</div>{transformations.error ? <Alert type="error" showIcon message={transformations.error.message} /> : null}<Table rowKey="id" loading={transformations.isLoading} columns={transformationColumns} dataSource={transformations.data?.items ?? []} scroll={{ x: 1290 }} pagination={{ pageSize: 8, pageSizeOptions: [8, 16, 32] }} locale={{ emptyText: <Empty description="Aún no hay transformaciones" /> }} /></> },
    ]} />
    <Modal title="Fórmula de insumo elaborado" open={formulaOpen} onCancel={() => setFormulaOpen(false)} onOk={() => formulaForm.submit()} okText="Guardar fórmula" confirmLoading={saveFormula.isPending} width={760} destroyOnHidden>
      <Alert type="info" showIcon message="La fórmula no modifica existencias. El stock cambia únicamente al iniciar y finalizar una orden de transformación." style={{ marginBottom: 16 }} />
      <Form form={formulaForm} layout="vertical" onFinish={(values) => saveFormula.mutate(values)}>
        <Form.Item name="code" hidden><Input /></Form.Item><Form.Item name="name" label="Nombre de la fórmula" rules={[{ required: true }]}><Input placeholder="Ejemplo: Compuesto PVC negro" /></Form.Item>
        <Form.Item name="outputItemId" label="Insumo resultante" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={options.data?.items.filter((item) => item.type === "INTERMEDIATE").map((item) => ({ value: item.id, label: `${item.code} · ${item.name} (${item.unit.symbol})` }))} placeholder="Selecciona un ítem registrado como Insumo elaborado" /></Form.Item>
        <Form.Item name="yieldQuantity" label="Rendimiento de la fórmula" rules={[{ required: true }]}><InputNumber min={0.000001} precision={6} style={{ width: "100%" }} /></Form.Item>
        <Form.List name="ingredients">{(fields, { add, remove }) => <>{fields.map((field) => <Space key={field.key} align="baseline" style={{ display: "flex" }}><Form.Item {...field} name={[field.name, "itemId"]} label="Componente" rules={[{ required: true }]} style={{ flex: 1, minWidth: 320 }}><Select showSearch optionFilterProp="label" options={inputItems.map((item) => ({ value: item.id, label: `${item.code} · ${item.name} (${item.unit.symbol})` }))} /></Form.Item><Form.Item {...field} name={[field.name, "quantity"]} label="Cantidad" rules={[{ required: true }]}><InputNumber min={0.000001} precision={6} /></Form.Item><Button type="text" danger icon={<MinusCircleOutlined />} onClick={() => remove(field.name)} /></Space>)}<Button block type="dashed" icon={<PlusOutlined />} onClick={() => add({ quantity: 1 })}>Agregar componente</Button></>}</Form.List>
        <Form.Item name="notes" label="Notas" style={{ marginTop: 16 }}><Input.TextArea rows={2} /></Form.Item>
      </Form>
    </Modal>
    <Modal title="Nueva orden de transformación" open={orderOpen} onCancel={() => setOrderOpen(false)} onOk={() => orderForm.submit()} okText="Crear orden" confirmLoading={createOrder.isPending} destroyOnHidden>
      <Form form={orderForm} layout="vertical" onFinish={(values) => createOrder.mutate(values)}><Form.Item name="formulaVersionId" label="Fórmula activa" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={formulas.data?.items.filter((formula) => formula.active && formula.versions[0]).map((formula) => ({ value: formula.versions[0].id, label: `${formula.code} · ${formula.name} · v${formula.versions[0].version}` }))} /></Form.Item><Form.Item name="warehouseId" label="Almacén" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={options.data?.warehouses.map((warehouse) => ({ value: warehouse.id, label: `${warehouse.code} · ${warehouse.name}` }))} /></Form.Item><Form.Item name="plannedOutputQuantity" label="Cantidad a elaborar" rules={[{ required: true }]}><InputNumber min={0.000001} precision={6} style={{ width: "100%" }} /></Form.Item><Form.Item name="outputLotCode" label="Lote de salida"><Input placeholder="Obligatorio si el insumo elaborado controla lote" /></Form.Item><Form.Item name="notes" label="Notas"><Input.TextArea rows={2} /></Form.Item></Form>
    </Modal>
    <Modal title={`Finalizar ${completing?.number ?? "transformación"}`} open={Boolean(completing)} onCancel={() => setCompleting(undefined)} onOk={() => completionForm.submit()} okText="Ingresar resultado al almacén" confirmLoading={completeOrder.isPending} destroyOnHidden><Form form={completionForm} layout="vertical" onFinish={(values) => completeOrder.mutate(values)}><Form.Item name="actualOutputQuantity" label="Cantidad real obtenida" rules={[{ required: true }]}><InputNumber min={0.000001} max={Number(completing?.plannedOutputQuantity ?? 0)} precision={6} style={{ width: "100%" }} /></Form.Item><Form.Item name="actualWasteQuantity" label="Merma real del proceso" tooltip="Se registra al finalizar porque puede variar en cada elaboración." rules={[{ required: true }]}><InputNumber min={0} precision={6} style={{ width: "100%" }} /></Form.Item></Form></Modal>
  </Card>;
}
