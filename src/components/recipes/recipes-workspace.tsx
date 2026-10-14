"use client";

import { CheckOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Empty, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import Decimal from "decimal.js";
import { ModuleImportButton } from "@/components/imports/module-import-button";
import { ModuleHeadingIntro } from "@/components/common/module-heading-intro";
import { useState } from "react";
import { toast } from "sonner";

type Material = { id: string; code: string; name: string; unit: { symbol: string } };
type Product = { id: string; code: string; name: string; variants: { sku: string; size: { name: string }; color: { name: string } }[] };
type Ingredient = { id: string; quantity: string; wastePercentage: string; item: Omit<Material, "id"> };
type Version = { id: string; version: number; yieldQuantity: string; isActive: boolean; notes?: string; ingredients: Ingredient[] };
type Recipe = { id: string; code: string; name: string; status: string; product: { code: string; name: string }; versions: Version[] };
type Options = { products: Product[]; materials: Material[] };
type RecipeForm = { code: string; name: string; productId: string; yieldQuantity: number; notes?: string; ingredients: { itemId: string; quantity: number; wastePercentage: number }[] };

async function api<T>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, init); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo completar la operación."); return payload.data; }

export function RecipesWorkspace({ permissions, canCreate, canActivate }: { permissions: string[]; canCreate: boolean; canActivate: boolean }) {
  const queryClient = useQueryClient(); const [open, setOpen] = useState(false); const [form] = Form.useForm<RecipeForm>();
  const recipes = useQuery({ queryKey: ["recipes"], queryFn: () => api<{ items: Recipe[] }>("/api/v1/recipes") });
  const options = useQuery({ queryKey: ["recipe-options"], queryFn: () => api<Options>("/api/v1/recipes/options") });
  const create = useMutation({ mutationFn: (values: RecipeForm) => api("/api/v1/recipes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values) }), onSuccess: async () => { toast.success("Receta creada como borrador; el stock no fue modificado."); setOpen(false); form.resetFields(); await queryClient.invalidateQueries({ queryKey: ["recipes"] }); }, onError: (error) => toast.error(error.message) });
  const activate = useMutation({ mutationFn: (id: string) => api(`/api/v1/recipes/${id}/activate`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), onSuccess: async () => { toast.success("Versión activada y congelada para producción."); await queryClient.invalidateQueries({ queryKey: ["recipes"] }); }, onError: (error) => toast.error(error.message) });
  const ingredientColumns: ColumnsType<Ingredient> = [
    { title: "Código", render: (_, row) => <strong>{row.item.code}</strong> }, { title: "Materia prima", render: (_, row) => row.item.name },
    { title: "Cantidad neta", align: "right", render: (_, row) => `${new Decimal(row.quantity).toFixed(3)} ${row.item.unit.symbol}` },
    { title: "Merma", dataIndex: "wastePercentage", align: "right", render: (value) => `${new Decimal(value).toFixed(2)}%` },
    { title: "Cantidad planificada", align: "right", render: (_, row) => `${new Decimal(row.quantity).mul(new Decimal(1).add(new Decimal(row.wastePercentage).div(100))).toFixed(3)} ${row.item.unit.symbol}` },
  ];
  const columns: ColumnsType<Recipe> = [
    { title: "Código", dataIndex: "code", width: 130, render: (value) => <strong>{value}</strong> },
    { title: "Receta", width: 240, render: (_, row) => <><strong>{row.name}</strong><br /><Typography.Text type="secondary">{row.product.code} · {row.product.name}</Typography.Text></> },
    { title: "Versión", width: 90, align: "center", render: (_, row) => row.versions[0]?.version ?? "—" },
    { title: "Rendimiento", width: 140, align: "right", render: (_, row) => `${new Decimal(row.versions[0]?.yieldQuantity ?? 0).toFixed(2)} pares/und.` },
    { title: "Ingredientes", width: 120, align: "center", render: (_, row) => row.versions[0]?.ingredients.length ?? 0 },
    { title: "Estado", dataIndex: "status", width: 110, render: (value) => <Tag color={value === "ACTIVE" ? "green" : value === "DRAFT" ? "blue" : "default"}>{value === "ACTIVE" ? "Activa" : value === "DRAFT" ? "Borrador" : "Inactiva"}</Tag> },
    { title: "Acciones", width: 130, render: (_, row) => canActivate && row.status === "DRAFT" ? <Button size="small" icon={<CheckOutlined />} loading={activate.isPending} onClick={() => Modal.confirm({ title: `¿Activar ${row.code}?`, content: "La versión quedará disponible para Producción. Activarla no descuenta stock.", okText: "Activar", cancelText: "Cancelar", onOk: () => activate.mutateAsync(row.id) })}>Activar</Button> : null },
  ];
  return <>
    <div className="page-heading"><ModuleHeadingIntro title="Recetas" eyebrow="Fórmulas" description="Define versiones, rendimiento, materias primas y merma teórica sin descontar inventario." /><Space wrap className="module-actions"><Button icon={<ReloadOutlined />} onClick={() => recipes.refetch()}>Actualizar</Button><ModuleImportButton module="recipes" permissions={permissions} /></Space></div>
    <Alert type="info" showIcon message="Crear o activar recetas no modifica el stock. Los materiales se consumirán al iniciar una orden de producción." style={{ marginBottom: 18 }} />
    <Card className="section-card" title="Recetas registradas" extra={canCreate ? <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>Nueva receta</Button> : null}>{recipes.error ? <Alert type="error" showIcon message={recipes.error.message} style={{ marginBottom: 16 }} /> : null}<Table rowKey="id" loading={recipes.isLoading} columns={columns} dataSource={recipes.data?.items ?? []} expandable={{ expandedRowRender: (row) => { const version = row.versions[0]; return version ? <><Typography.Text strong>Versión {version.version}{version.isActive ? " · activa" : ""}</Typography.Text>{version.notes ? <Typography.Paragraph type="secondary">{version.notes}</Typography.Paragraph> : null}<Table rowKey="id" size="small" pagination={false} columns={ingredientColumns} dataSource={version.ingredients} /></> : null; } }} scroll={{ x: 950 }} pagination={{ pageSize: 15 }} locale={{ emptyText: <Empty description="Aún no hay recetas registradas" /> }} /></Card>
    <Modal title="Nueva receta" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="Crear borrador" confirmLoading={create.isPending} width={900} destroyOnHidden>
      {!options.data?.products.length ? <Alert type="warning" showIcon message="Primero registra un producto con variantes." style={{ marginBottom: 16 }} /> : null}
      {!options.data?.materials.length ? <Alert type="warning" showIcon message="Primero registra materias primas en Almacén." style={{ marginBottom: 16 }} /> : null}
      <Form form={form} layout="vertical" onFinish={(values) => create.mutate(values)} initialValues={{ yieldQuantity: 1, ingredients: [{ wastePercentage: 0 }] }}>
        <div className="purchase-form-grid"><Form.Item name="code" label="Código" rules={[{ required: true }]}><Input placeholder="REC-001" /></Form.Item><Form.Item name="name" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="productId" label="Producto resultante" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={options.data?.products.map((product) => ({ value: product.id, label: `${product.code} · ${product.name}` }))} /></Form.Item><Form.Item name="yieldQuantity" label="Rendimiento por ejecución" rules={[{ required: true }]}><InputNumber min={0.001} precision={3} style={{ width: "100%" }} /></Form.Item></div>
        <Form.Item name="notes" label="Notas de versión"><Input.TextArea rows={2} /></Form.Item>
        <Form.List name="ingredients">{(fields, { add, remove }) => <Space direction="vertical" style={{ width: "100%" }}><Typography.Title level={5}>Materias primas</Typography.Title>{fields.map((field, index) => <Card size="small" key={field.key} title={`Ingrediente ${index + 1}`} extra={fields.length > 1 ? <Button type="link" danger onClick={() => remove(field.name)}>Quitar</Button> : null}><div className="purchase-form-grid"><Form.Item name={[field.name, "itemId"]} label="Materia prima" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={options.data?.materials.map((material) => ({ value: material.id, label: `${material.code} · ${material.name} (${material.unit.symbol})` }))} /></Form.Item><Form.Item name={[field.name, "quantity"]} label="Cantidad neta" rules={[{ required: true }]}><InputNumber min={0.000001} precision={6} style={{ width: "100%" }} /></Form.Item><Form.Item name={[field.name, "wastePercentage"]} label="Merma %" rules={[{ required: true }]}><InputNumber min={0} max={100} precision={2} style={{ width: "100%" }} /></Form.Item></div></Card>)}<Button block icon={<PlusOutlined />} onClick={() => add({ wastePercentage: 0 })}>Agregar materia prima</Button></Space>}</Form.List>
      </Form>
    </Modal>
  </>;
}
