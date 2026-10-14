"use client";

import { EditOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Checkbox, Empty, Form, Input, InputNumber, Modal, Space, Table, Tabs, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useState } from "react";
import { toast } from "sonner";
import { ModuleHeadingIntro } from "@/components/common/module-heading-intro";

type CatalogType = "SUPPLIER" | "CUSTOMER" | "WAREHOUSE" | "UNIT" | "CURRENCY";
type Common = { id: string; code: string; name: string; taxId?: string; email?: string; phone?: string; symbol?: string; decimalPlaces?: number; isBase?: boolean };
type Contact = Common & { taxId?: string; email?: string; phone?: string; active?: boolean };
type Warehouse = Common & { active: boolean };
type Unit = Common & { symbol: string; decimalPlaces: number };
type Currency = Common & { symbol: string; isBase: boolean };
type Catalogs = { suppliers: Contact[]; customers: Contact[]; warehouses: Warehouse[]; units: Unit[]; currencies: Currency[] };
type CatalogForm = { code: string; name: string; taxId?: string; email?: string; phone?: string; symbol?: string; decimalPlaces?: number; isBase?: boolean };

const labels: Record<CatalogType, { singular: string; plural: string }> = {
  SUPPLIER: { singular: "proveedor", plural: "Proveedores" }, CUSTOMER: { singular: "cliente", plural: "Clientes" },
  WAREHOUSE: { singular: "almacén", plural: "Almacenes" }, UNIT: { singular: "unidad", plural: "Unidades" }, CURRENCY: { singular: "moneda", plural: "Monedas" },
};
async function api<T>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, init); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo completar la operación."); return payload.data; }

const commonColumns: ColumnsType<Common> = [{ title: "Código", dataIndex: "code", width: 130, render: (value) => <strong>{value}</strong> }, { title: "Nombre", dataIndex: "name" }];
const contactColumns: ColumnsType<Contact> = [...commonColumns, { title: "RUC / documento", dataIndex: "taxId", render: (value) => value || "—" }, { title: "Correo", dataIndex: "email", render: (value) => value || "—" }, { title: "Teléfono", dataIndex: "phone", render: (value) => value || "—" }, { title: "Estado", dataIndex: "active", width: 100, render: (value) => value === false ? <Tag>Inactivo</Tag> : <Tag color="green">Activo</Tag> }];

export function CatalogsWorkspace({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [active, setActive] = useState<CatalogType>("SUPPLIER");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Common>();
  const [form] = Form.useForm<CatalogForm>();
  const catalogs = useQuery({ queryKey: ["catalogs"], queryFn: () => api<Catalogs>("/api/v1/catalogs") });
  const create = useMutation({ mutationFn: (values: CatalogForm) => api("/api/v1/catalogs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: active, ...values }) }), onSuccess: async () => { toast.success(`${labels[active].singular[0].toUpperCase()}${labels[active].singular.slice(1)} creado.`); setOpen(false); form.resetFields(); await Promise.all([queryClient.invalidateQueries({ queryKey: ["catalogs"] }), queryClient.invalidateQueries({ queryKey: ["purchase-options"] }), queryClient.invalidateQueries({ queryKey: ["inventory-options"] })]); }, onError: (error) => toast.error(error.message) });
  const update = useMutation({ mutationFn: (values: CatalogForm) => api(`/api/v1/catalogs/${active}/${editing?.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(values) }), onSuccess: async () => { toast.success("Registro actualizado."); setOpen(false); setEditing(undefined); form.resetFields(); await queryClient.invalidateQueries({ queryKey: ["catalogs"] }); }, onError: (error) => toast.error(error.message) });
  const openCreate = () => { setEditing(undefined); form.resetFields(); form.setFieldsValue(active === "UNIT" ? { decimalPlaces: 3 } : active === "CURRENCY" ? { isBase: false } : {}); setOpen(true); };
  const openEdit = (record: Common) => { setEditing(record); form.setFieldsValue(record); setOpen(true); };

  const table = (data: Common[], columns: ColumnsType<Common> = commonColumns) => <Table rowKey="id" loading={catalogs.isLoading} dataSource={data} columns={[...columns, ...(canManage ? [{ title: "Acciones", width: 100, render: (_: unknown, row: Common) => <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>Editar</Button> }] : [])]} pagination={{ pageSize: 15 }} locale={{ emptyText: <Empty description={`No hay ${labels[active].plural.toLowerCase()}`} /> }} />;
  const tabs = [
    { key: "SUPPLIER", label: "Proveedores", children: table(catalogs.data?.suppliers ?? [], contactColumns as ColumnsType<Common>) },
    { key: "CUSTOMER", label: "Clientes", children: table(catalogs.data?.customers ?? [], contactColumns as ColumnsType<Common>) },
    { key: "WAREHOUSE", label: "Almacenes", children: table(catalogs.data?.warehouses ?? [], [...commonColumns, { title: "Estado", dataIndex: "active", width: 110, render: (value) => value ? <Tag color="green">Activo</Tag> : <Tag>Inactivo</Tag> }]) },
    { key: "UNIT", label: "Unidades", children: table(catalogs.data?.units ?? [], [...commonColumns, { title: "Símbolo", dataIndex: "symbol", width: 120 }, { title: "Decimales", dataIndex: "decimalPlaces", width: 120 }]) },
    { key: "CURRENCY", label: "Monedas", children: table(catalogs.data?.currencies ?? [], [...commonColumns, { title: "Símbolo", dataIndex: "symbol", width: 120 }, { title: "Tipo", dataIndex: "isBase", width: 130, render: (value) => value ? <Tag color="gold">Moneda base</Tag> : "Alterna" }]) },
  ];

  return <>
    <div className="page-heading"><ModuleHeadingIntro title="Catálogos" eyebrow="Maestros" description="Administra los datos base usados por compras, almacén, producción y pedidos." /><Space wrap className="module-actions"><Button icon={<ReloadOutlined />} onClick={() => catalogs.refetch()}>Actualizar</Button></Space></div>
    <Card className="section-card" title={labels[active].plural} extra={canManage ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nuevo {labels[active].singular}</Button> : null}>{catalogs.error ? <Alert type="error" showIcon message={catalogs.error.message} style={{ marginBottom: 16 }} /> : null}<Tabs activeKey={active} onChange={(key) => setActive(key as CatalogType)} items={tabs} /></Card>
    <Modal title={`${editing ? "Editar" : "Nuevo"} ${labels[active].singular}`} open={open} onCancel={() => { setOpen(false); setEditing(undefined); }} onOk={() => form.submit()} okText={editing ? "Guardar cambios" : "Crear"} confirmLoading={create.isPending || update.isPending} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(values) => editing ? update.mutate(values) : create.mutate(values)}>
        <Form.Item name="code" label={active === "CURRENCY" ? "Código ISO" : "Código"} rules={[{ required: true }, ...(active === "CURRENCY" ? [{ len: 3, message: "Usa el código ISO de 3 letras" }] : [])]}><Input disabled={Boolean(editing)} placeholder={active === "CURRENCY" ? "PEN" : undefined} /></Form.Item>
        <Form.Item name="name" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
        {(active === "SUPPLIER" || active === "CUSTOMER") ? <><Form.Item name="taxId" label="RUC / documento"><Input /></Form.Item><Form.Item name="email" label="Correo"><Input type="email" /></Form.Item><Form.Item name="phone" label="Teléfono"><Input /></Form.Item></> : null}
        {active === "UNIT" ? <><Form.Item name="symbol" label="Símbolo" rules={[{ required: true }]}><Input placeholder="kg" /></Form.Item><Form.Item name="decimalPlaces" label="Cantidad de decimales" rules={[{ required: true }]}><InputNumber min={0} max={6} style={{ width: "100%" }} /></Form.Item></> : null}
        {active === "CURRENCY" ? <><Form.Item name="symbol" label="Símbolo" rules={[{ required: true }]}><Input placeholder="S/" /></Form.Item><Form.Item name="isBase" valuePropName="checked"><Checkbox>Usar como moneda base</Checkbox></Form.Item></> : null}
      </Form>
    </Modal>
  </>;
}
