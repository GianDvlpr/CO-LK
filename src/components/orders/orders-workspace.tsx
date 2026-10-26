"use client";

import { CheckOutlined, EditOutlined, InboxOutlined, PlusOutlined, ReloadOutlined, SendOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, DatePicker, Empty, Form, Input, InputNumber, Modal, Space, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import Decimal from "decimal.js";
import { useState } from "react";
import { toast } from "sonner";
import { ModuleImportButton } from "@/components/imports/module-import-button";
import { ModuleHeadingIntro } from "@/components/common/module-heading-intro";
import { ResponsiveTable as Table } from "@/components/common/responsive-table";
import { TableSearch, matchesSearch } from "@/components/common/table-search";
import { CreatableSelect } from "@/components/common/quick-create/creatable-select";
import { ContactQuickCreateModal } from "@/components/common/quick-create/catalog-quick-create";
import { ProductCreateModal } from "@/components/common/quick-create/product-create-modal";

type Variant = { id: string; sku: string; product: { code: string; name: string }; size: { name: string }; color: { name: string }; inventoryItem: { unit: { symbol: string } } };
type Options = { customers: { id: string; code: string; name: string; taxId?: string }[]; variants: Variant[] };
type Line = { id: string; quantity: string; unitPrice: string; productVariant: Omit<Variant, "id" | "inventoryItem"> };
type Order = { id: string; number: string; status: string; requestedAt: string; promisedAt?: string; notes?: string; customer: { code: string; name: string }; lines: Line[] };
type OrderForm = { customerId: string; requestedAt: Dayjs; promisedAt?: Dayjs; notes?: string; lines: { productVariantId: string; quantity: number; unitPrice: number }[] };

async function api<T>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, init); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo completar la operación."); return payload.data; }
const labels: Record<string, [string, string]> = { DRAFT: ["Borrador", "blue"], CONFIRMED: ["Confirmado", "gold"], IN_PRODUCTION: ["En producción", "processing"], READY: ["Listo", "cyan"], DISPATCHED: ["Despachado", "green"], CANCELLED: ["Cancelado", "default"] };

export function OrdersWorkspace({ permissions }: { permissions: string[] }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [quickProductOpen, setQuickProductOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Order>();
  const [form] = Form.useForm<OrderForm>();
  const orders = useQuery({ queryKey: ["orders"], queryFn: () => api<{ items: Order[] }>("/api/v1/orders") });
  const filteredOrders = (orders.data?.items ?? []).filter((order) => matchesSearch(search, order.number, order.customer.name, order.customer.code));
  const options = useQuery({ queryKey: ["order-options"], queryFn: () => api<Options>("/api/v1/orders/options") });
  const refresh = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["orders"] }), queryClient.invalidateQueries({ queryKey: ["pick-pack-options"] }), queryClient.invalidateQueries({ queryKey: ["inventory"] }), queryClient.invalidateQueries({ queryKey: ["kardex"] })]); };
  const save = useMutation({ mutationFn: (values: OrderForm) => api(editing ? `/api/v1/orders/${editing.id}` : "/api/v1/orders", { method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...values, requestedAt: values.requestedAt.format("YYYY-MM-DD"), promisedAt: values.promisedAt?.format("YYYY-MM-DD") }) }), onSuccess: async () => { toast.success(editing ? "Pedido actualizado." : "Pedido creado como borrador."); setOpen(false); setEditing(undefined); form.resetFields(); await refresh(); }, onError: (error) => toast.error(error.message) });
  const transition = useMutation({ mutationFn: ({ id, action }: { id: string; action: string }) => api(`/api/v1/orders/${id}/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), onSuccess: async (_, variables) => { toast.success(variables.action === "confirm" ? "Pedido confirmado y stock reservado." : "Pedido despachado y kardex actualizado."); await refresh(); }, onError: (error) => toast.error(error.message) });
  const openCreate = () => { setEditing(undefined); form.resetFields(); form.setFieldsValue({ requestedAt: dayjs(), lines: [{ quantity: 1, unitPrice: 0 }] }); setOpen(true); };
  const openEdit = (order: Order) => { setEditing(order); form.setFieldsValue({ customerId: options.data?.customers.find((item) => item.code === order.customer.code)?.id, requestedAt: dayjs(order.requestedAt), promisedAt: order.promisedAt ? dayjs(order.promisedAt) : undefined, notes: order.notes, lines: order.lines.map((line) => ({ productVariantId: options.data?.variants.find((item) => item.sku === line.productVariant.sku)?.id ?? "", quantity: Number(line.quantity), unitPrice: Number(line.unitPrice) })) }); setOpen(true); };

  const lineColumns: ColumnsType<Line> = [
    { title: "SKU", render: (_, row) => <strong>{row.productVariant.sku}</strong> },
    { title: "Producto", render: (_, row) => `${row.productVariant.product.name} · ${row.productVariant.size.name} · ${row.productVariant.color.name}` },
    { title: "Cantidad", dataIndex: "quantity", align: "right", render: (value) => new Decimal(value).toFixed(2) },
    { title: "Precio unit.", dataIndex: "unitPrice", align: "right", render: (value) => `S/ ${new Decimal(value).toFixed(2)}` },
    { title: "Importe", align: "right", render: (_, row) => `S/ ${new Decimal(row.quantity).mul(row.unitPrice).toFixed(2)}` },
  ];
  const columns: ColumnsType<Order> = [
    { title: "Pedido", dataIndex: "number", width: 130, render: (value) => <strong>{value}</strong> },
    { title: "Cliente", width: 230, render: (_, row) => <><strong>{row.customer.name}</strong><br /><Typography.Text type="secondary">{row.customer.code}</Typography.Text></> },
    { title: "Solicitud", dataIndex: "requestedAt", width: 120, render: (value) => dayjs(value).format("DD/MM/YYYY") },
    { title: "Entrega", dataIndex: "promisedAt", width: 120, render: (value) => value ? dayjs(value).format("DD/MM/YYYY") : "—" },
    { title: "Líneas", width: 80, align: "center", render: (_, row) => row.lines.length },
    { title: "Total", width: 130, align: "right", render: (_, row) => `S/ ${row.lines.reduce((sum, line) => sum.add(new Decimal(line.quantity).mul(line.unitPrice)), new Decimal(0)).toFixed(2)}` },
    { title: "Estado", dataIndex: "status", width: 130, render: (value) => { const [label, color] = labels[value] ?? [value, "default"]; return <Tag color={color}>{label}</Tag>; } },
    { title: "Acciones", fixed: "right", width: 300, render: (_, row) => <Space wrap>
      {row.status === "DRAFT" && permissions.includes("orders.update") ? <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>Editar</Button> : null}
      {row.status === "DRAFT" && permissions.includes("orders.confirm") ? <Button size="small" icon={<CheckOutlined />} onClick={() => Modal.confirm({ title: `¿Confirmar ${row.number}?`, content: "Se reservará el stock disponible del almacén principal.", okText: "Confirmar", onOk: () => transition.mutateAsync({ id: row.id, action: "confirm" }) })}>Confirmar</Button> : null}
      {row.status === "CONFIRMED" && permissions.includes("pick_pack.read") ? <Button size="small" icon={<InboxOutlined />} href="/dashboard/pick-pack">Pick & Pack</Button> : null}
      {row.status === "READY" && permissions.includes("orders.dispatch") ? <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => Modal.confirm({ title: `¿Despachar ${row.number}?`, content: "Se descontarán del kardex las cantidades empacadas en Pick & Pack.", okText: "Despachar", onOk: () => transition.mutateAsync({ id: row.id, action: "dispatch" }) })}>Despachar</Button> : null}
    </Space> },
  ];

  return <>
    <div className="page-heading"><ModuleHeadingIntro title="Pedidos" eyebrow="Ventas" description="Registra pedidos por cliente y variante. Al confirmar se reserva el stock; Pick & Pack registra la preparación y habilita el despacho final." /><Space wrap className="module-actions"><TableSearch value={search} onChange={setSearch} placeholder="Buscar número o cliente" /><Tooltip title="Actualizar"><Button icon={<ReloadOutlined />} aria-label="Actualizar" onClick={() => orders.refetch()} /></Tooltip><ModuleImportButton module="orders" permissions={permissions} /></Space></div>
    <Card className="section-card" title="Órdenes de pedido" extra={permissions.includes("orders.create") ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nuevo pedido</Button> : null}>{orders.error ? <Alert type="error" showIcon message={orders.error.message} style={{ marginBottom: 16 }} /> : null}<Table rowKey="id" loading={orders.isLoading} columns={columns} dataSource={filteredOrders} expandable={{ expandedRowRender: (row) => <Table rowKey="id" size="small" sticky={false} pagination={false} columns={lineColumns} dataSource={row.lines} /> }} scroll={{ x: 1200 }} pagination={{ pageSize: 8, pageSizeOptions: [8, 16, 32] }} locale={{ emptyText: <Empty description="Aún no hay pedidos registrados" /> }} /></Card>
    <Modal className="compact-form-modal" title={editing ? `Editar ${editing.number}` : "Nuevo pedido"} open={open} onCancel={() => { setOpen(false); setEditing(undefined); }} onOk={() => form.submit()} okText={editing ? "Guardar cambios" : "Crear borrador"} confirmLoading={save.isPending} width={900} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(values) => save.mutate(values)}>
        <div className="purchase-form-grid">{editing ? <Form.Item label="Número"><Input disabled value={editing.number} /></Form.Item> : null}<Form.Item name="customerId" label="Cliente" rules={[{ required: true }]}><CreatableSelect createLabel="Nuevo cliente" createDisabled={!permissions.includes("catalogs.manage")} onCreate={() => setQuickCustomerOpen(true)} showSearch optionFilterProp="label" options={options.data?.customers.map((customer) => ({ value: customer.id, label: `${customer.code} · ${customer.name}` }))} /></Form.Item><Form.Item name="requestedAt" label="Fecha de pedido" rules={[{ required: true }]}><DatePicker style={{ width: "100%" }} /></Form.Item><Form.Item name="promisedAt" label="Fecha prometida"><DatePicker style={{ width: "100%" }} /></Form.Item></div>
        <Form.Item name="notes" label="Observaciones"><Input.TextArea rows={2} /></Form.Item>
        <Form.List name="lines">{(fields, { add, remove }) => <Space direction="vertical" style={{ width: "100%" }}><Typography.Title level={5}>Productos solicitados</Typography.Title>{fields.map((field, index) => <Card size="small" key={field.key} title={`Línea ${index + 1}`} extra={fields.length > 1 ? <Button type="link" danger onClick={() => remove(field.name)}>Quitar</Button> : null}><div className="purchase-form-grid"><Form.Item name={[field.name, "productVariantId"]} label="Variante" rules={[{ required: true }]}><CreatableSelect createLabel="Nuevo producto" createDisabled={!permissions.includes("products.create")} onCreate={() => setQuickProductOpen(true)} showSearch optionFilterProp="label" options={options.data?.variants.map((variant) => ({ value: variant.id, label: `${variant.sku} · ${variant.product.name} · ${variant.size.name} · ${variant.color.name}` }))} /></Form.Item><Form.Item name={[field.name, "quantity"]} label="Cantidad" rules={[{ required: true }]}><InputNumber min={0.001} precision={3} style={{ width: "100%" }} /></Form.Item><Form.Item name={[field.name, "unitPrice"]} label="Precio unitario" rules={[{ required: true }]}><InputNumber min={0} precision={2} prefix="S/" style={{ width: "100%" }} /></Form.Item></div></Card>)}<Button block icon={<PlusOutlined />} onClick={() => add({ quantity: 1, unitPrice: 0 })}>Agregar producto</Button></Space>}</Form.List>
      </Form>
    </Modal>
    <ContactQuickCreateModal kind="CUSTOMER" open={quickCustomerOpen} onCancel={() => setQuickCustomerOpen(false)} onCreated={(customer) => { form.setFieldValue("customerId", customer.id); setQuickCustomerOpen(false); }} />
    <ProductCreateModal open={quickProductOpen} onCancel={() => setQuickProductOpen(false)} onCreated={() => setQuickProductOpen(false)} />
  </>;
}
