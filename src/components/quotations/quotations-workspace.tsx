"use client";

import { CheckOutlined, CloseCircleOutlined, EditOutlined, FilePdfOutlined, PlusOutlined, ReloadOutlined, SendOutlined, ShoppingCartOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, DatePicker, Descriptions, Empty, Form, Input, InputNumber, Modal, Select, Space, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import Decimal from "decimal.js";
import { useState } from "react";
import { toast } from "sonner";
import { ModuleHeadingIntro } from "@/components/common/module-heading-intro";
import { ResponsiveTable as Table } from "@/components/common/responsive-table";
import { TableSearch, matchesSearch } from "@/components/common/table-search";
import { quotationTotals } from "@/modules/quotations/domain/quotation-calculations";

type Variant = { id: string; sku: string; product: { code: string; name: string }; size: { name: string }; color: { name: string }; secondaryColor?: { name: string }; inventoryItem: { unit: { symbol: string } } };
type Currency = { id: string; code: string; name: string; symbol: string; isBase: boolean; exchangeRates: { rate: string; rateDate: string }[] };
type Options = { igvRate: string; customers: { id: string; code: string; name: string; taxId?: string }[]; currencies: Currency[]; variants: Variant[] };
type QuotationLine = { id: string; quantity: string; unitPrice: string; productVariant: Omit<Variant, "inventoryItem"> };
type Quotation = { id: string; number: string; status: string; issueDate: string; validUntil: string; promisedAt?: string; exchangeRate: string; discountRate: string; taxRate: string; paymentTerms?: string; deliveryTerms?: string; notes?: string; customer: { id: string; code: string; name: string }; currency: Omit<Currency, "exchangeRates">; salesOrder?: { id: string; number: string }; lines: QuotationLine[] };
type QuotationForm = { customerId: string; currencyId: string; issueDate: Dayjs; validUntil: Dayjs; promisedAt?: Dayjs; exchangeRate: number; discountRate: number; paymentTerms?: string; deliveryTerms?: string; notes?: string; lines: { productVariantId: string; quantity: number; unitPrice: number }[] };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo completar la operación.");
  return payload.data;
}

const statuses: Record<string, [string, string]> = {
  DRAFT: ["Borrador", "blue"], SENT: ["Enviada", "processing"], APPROVED: ["Aprobada", "green"], REJECTED: ["Rechazada", "red"], EXPIRED: ["Vencida", "orange"], CONVERTED: ["Convertida", "purple"],
};

function amountSummary(quotation: Quotation) {
  return quotationTotals(quotation.lines, quotation.discountRate, quotation.taxRate, quotation.exchangeRate);
}

export function QuotationsWorkspace({ permissions }: { permissions: string[] }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Quotation>();
  const [search, setSearch] = useState("");
  const [form] = Form.useForm<QuotationForm>();
  const records = useQuery({ queryKey: ["quotations"], queryFn: () => api<{ items: Quotation[] }>("/api/v1/quotations") });
  const options = useQuery({ queryKey: ["quotation-options"], queryFn: () => api<Options>("/api/v1/quotations/options") });
  const lines = Form.useWatch("lines", form) ?? [];
  const discountRate = Form.useWatch("discountRate", form) ?? 0;
  const currencyId = Form.useWatch("currencyId", form);
  const selectedCurrency = options.data?.currencies.find((currency) => currency.id === currencyId);
  const preview = quotationTotals(lines.map((line) => ({ quantity: line?.quantity ?? 0, unitPrice: line?.unitPrice ?? 0 })), discountRate, options.data?.igvRate ?? 18, Form.useWatch("exchangeRate", form) ?? 1);
  const filtered = (records.data?.items ?? []).filter((quotation) => matchesSearch(search, quotation.number, quotation.customer.name, quotation.customer.code, quotation.salesOrder?.number));

  const refresh = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["quotations"] }),
    queryClient.invalidateQueries({ queryKey: ["orders"] }),
    queryClient.invalidateQueries({ queryKey: ["order-options"] }),
  ]);
  const save = useMutation({
    mutationFn: (values: QuotationForm) => api(editing ? `/api/v1/quotations/${editing.id}` : "/api/v1/quotations", { method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...values, issueDate: values.issueDate.format("YYYY-MM-DD"), validUntil: values.validUntil.format("YYYY-MM-DD"), promisedAt: values.promisedAt?.format("YYYY-MM-DD") }) }),
    onSuccess: async () => { toast.success(editing ? "Cotización actualizada." : "Cotización creada como borrador."); setOpen(false); setEditing(undefined); form.resetFields(); await refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const transition = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "send" | "approve" | "reject" | "convert" }) => api<{ salesOrderNumber?: string }>(`/api/v1/quotations/${id}/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
    onSuccess: async (result, variables) => { const messages = { send: "Cotización marcada como enviada.", approve: "Cotización aprobada.", reject: "Cotización rechazada.", convert: `Pedido ${result.salesOrderNumber ?? ""} creado como borrador.` }; toast.success(messages[variables.action]); await refresh(); },
    onError: (error) => toast.error(error.message),
  });

  const openCreate = () => {
    const baseCurrency = options.data?.currencies.find((currency) => currency.isBase) ?? options.data?.currencies[0];
    setEditing(undefined);
    form.resetFields();
    form.setFieldsValue({ issueDate: dayjs(), validUntil: dayjs().add(15, "day"), currencyId: baseCurrency?.id, exchangeRate: baseCurrency?.isBase ? 1 : Number(baseCurrency?.exchangeRates[0]?.rate ?? 1), discountRate: 0, lines: [{ quantity: 1, unitPrice: 0 }] });
    setOpen(true);
  };
  const openEdit = (quotation: Quotation) => {
    setEditing(quotation);
    form.setFieldsValue({ customerId: quotation.customer.id, currencyId: quotation.currency.id, issueDate: dayjs(quotation.issueDate), validUntil: dayjs(quotation.validUntil), promisedAt: quotation.promisedAt ? dayjs(quotation.promisedAt) : undefined, exchangeRate: Number(quotation.exchangeRate), discountRate: Number(quotation.discountRate), paymentTerms: quotation.paymentTerms, deliveryTerms: quotation.deliveryTerms, notes: quotation.notes, lines: quotation.lines.map((line) => ({ productVariantId: line.productVariant.id, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice) })) });
    setOpen(true);
  };
  const changeCurrency = (id: string) => {
    const currency = options.data?.currencies.find((item) => item.id === id);
    form.setFieldValue("exchangeRate", currency?.isBase ? 1 : Number(currency?.exchangeRates[0]?.rate ?? 1));
  };

  const lineColumns: ColumnsType<QuotationLine> = [
    { title: "SKU", width: 140, render: (_, line) => <strong>{line.productVariant.sku}</strong> },
    { title: "Producto", render: (_, line) => `${line.productVariant.product.name} · Talla ${line.productVariant.size.name} · ${[line.productVariant.color.name, line.productVariant.secondaryColor?.name].filter(Boolean).join(" / ")}` },
    { title: "Cantidad", dataIndex: "quantity", width: 110, align: "right", render: (value) => new Decimal(value).toFixed(2) },
    { title: "Precio unit.", dataIndex: "unitPrice", width: 130, align: "right", render: (value) => `${selectedCurrency?.symbol ?? ""}${new Decimal(value).toFixed(2)}` },
    { title: "Importe", width: 130, align: "right", render: (_, line) => new Decimal(line.quantity).mul(line.unitPrice).toFixed(2) },
  ];
  const columns: ColumnsType<Quotation> = [
    { title: "Cotización", dataIndex: "number", width: 165, render: (value) => <strong>{value}</strong> },
    { title: "Cliente", width: 230, render: (_, row) => <><strong>{row.customer.name}</strong><br /><Typography.Text type="secondary">{row.customer.code}</Typography.Text></> },
    { title: "Emisión", dataIndex: "issueDate", width: 110, render: (value) => dayjs(value).format("DD/MM/YYYY") },
    { title: "Vigencia", dataIndex: "validUntil", width: 110, render: (value) => dayjs(value).format("DD/MM/YYYY") },
    { title: "Total", width: 140, align: "right", render: (_, row) => `${row.currency.symbol} ${amountSummary(row).total.toFixed(2)}` },
    { title: "Estado", dataIndex: "status", width: 125, render: (value) => { const [label, color] = statuses[value] ?? [value, "default"]; return <Tag color={color}>{label}</Tag>; } },
    { title: "Pedido", width: 150, render: (_, row) => row.salesOrder ? <Button type="link" href="/dashboard/orders" style={{ padding: 0 }}>{row.salesOrder.number}</Button> : "—" },
    { title: "Acciones", width: 330, render: (_, row) => <Space wrap>
      {row.status === "DRAFT" && permissions.includes("quotations.update") ? <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>Editar</Button> : null}
      {permissions.includes("quotations.print") ? <Button size="small" icon={<FilePdfOutlined />} href={`/api/v1/quotations/${row.id}/print`}>PDF</Button> : null}
      {row.status === "DRAFT" && permissions.includes("quotations.send") ? <Button size="small" icon={<SendOutlined />} onClick={() => transition.mutate({ id: row.id, action: "send" })}>Enviar</Button> : null}
      {["DRAFT", "SENT"].includes(row.status) && permissions.includes("quotations.approve") ? <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => Modal.confirm({ title: `¿Aprobar ${row.number}?`, content: "Quedará lista para convertirse en pedido.", okText: "Aprobar", onOk: () => transition.mutateAsync({ id: row.id, action: "approve" }) })}>Aprobar</Button> : null}
      {["DRAFT", "SENT"].includes(row.status) && permissions.includes("quotations.reject") ? <Button size="small" danger icon={<CloseCircleOutlined />} onClick={() => Modal.confirm({ title: `¿Rechazar ${row.number}?`, okText: "Rechazar", okButtonProps: { danger: true }, onOk: () => transition.mutateAsync({ id: row.id, action: "reject" }) })}>Rechazar</Button> : null}
      {row.status === "APPROVED" && permissions.includes("quotations.convert") ? <Button size="small" type="primary" icon={<ShoppingCartOutlined />} onClick={() => Modal.confirm({ title: `¿Convertir ${row.number} en pedido?`, content: "Se creará un pedido en borrador. Aún no reservará stock.", okText: "Crear pedido", onOk: () => transition.mutateAsync({ id: row.id, action: "convert" }) })}>Crear pedido</Button> : null}
    </Space> },
  ];

  return <>
    <div className="page-heading"><ModuleHeadingIntro title="Cotizaciones" eyebrow="Ventas" description="Prepara propuestas comerciales sin afectar stock y convierte las aprobadas en pedidos." /><Space wrap className="module-actions"><TableSearch value={search} onChange={setSearch} placeholder="Buscar cotización, cliente o pedido" /><Tooltip title="Actualizar"><Button icon={<ReloadOutlined />} aria-label="Actualizar" onClick={() => records.refetch()} /></Tooltip></Space></div>
    <Card className="section-card" title="Cotizaciones comerciales" extra={permissions.includes("quotations.create") ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nueva cotización</Button> : null}>
      {records.error ? <Alert type="error" showIcon message={records.error.message} style={{ marginBottom: 16 }} /> : null}
      <Table rowKey="id" loading={records.isLoading} columns={columns} dataSource={filtered} expandable={{ expandedRowRender: (row) => <Table rowKey="id" size="small" sticky={false} pagination={false} columns={lineColumns.map((column) => column.title === "Precio unit." ? { ...column, render: (value: string) => `${row.currency.symbol} ${new Decimal(value).toFixed(2)}` } : column)} dataSource={row.lines} /> }} scroll={{ x: 1400 }} pagination={{ pageSize: 8, pageSizeOptions: [8, 16, 32] }} locale={{ emptyText: <Empty description="Aún no hay cotizaciones registradas" /> }} />
    </Card>
    <Modal className="compact-form-modal" title={editing ? `Editar ${editing.number}` : "Nueva cotización"} open={open} onCancel={() => { setOpen(false); setEditing(undefined); }} onOk={() => form.submit()} okText={editing ? "Guardar cambios" : "Crear borrador"} confirmLoading={save.isPending} width={980} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(values) => save.mutate(values)}>
        <div className="purchase-form-grid">
          {editing ? <Form.Item label="Código"><Input disabled value={editing.number} /></Form.Item> : null}
          <Form.Item name="customerId" label="Cliente" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={options.data?.customers.map((customer) => ({ value: customer.id, label: `${customer.code} · ${customer.name}` }))} /></Form.Item>
          <Form.Item name="issueDate" label="Fecha de emisión" rules={[{ required: true }]}><DatePicker style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="validUntil" label="Válida hasta" rules={[{ required: true }]}><DatePicker style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="promisedAt" label="Fecha de entrega"><DatePicker style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="currencyId" label="Moneda" rules={[{ required: true }]}><Select onChange={changeCurrency} options={options.data?.currencies.map((currency) => ({ value: currency.id, label: `${currency.code} · ${currency.name}` }))} /></Form.Item>
          <Form.Item name="exchangeRate" label="Tipo de cambio" rules={[{ required: true }]}><InputNumber min={0.000001} precision={6} disabled={selectedCurrency?.isBase} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="discountRate" label="Descuento (%)" rules={[{ required: true }]}><InputNumber min={0} max={100} precision={2} style={{ width: "100%" }} /></Form.Item>
        </div>
        <div className="purchase-form-grid"><Form.Item name="paymentTerms" label="Condiciones de pago"><Input.TextArea rows={2} /></Form.Item><Form.Item name="deliveryTerms" label="Condiciones de entrega"><Input.TextArea rows={2} /></Form.Item></div>
        <Form.Item name="notes" label="Observaciones"><Input.TextArea rows={2} /></Form.Item>
        <Form.List name="lines">{(fields, { add, remove }) => <Space direction="vertical" style={{ width: "100%" }}><Typography.Title level={5}>Productos cotizados</Typography.Title>{fields.map((field, index) => <Card size="small" key={field.key} title={`Línea ${index + 1}`} extra={fields.length > 1 ? <Button type="link" danger onClick={() => remove(field.name)}>Quitar</Button> : null}><div className="purchase-form-grid"><Form.Item name={[field.name, "productVariantId"]} label="Variante" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={options.data?.variants.map((variant) => ({ value: variant.id, label: `${variant.sku} · ${variant.product.name} · Talla ${variant.size.name} · ${[variant.color.name, variant.secondaryColor?.name].filter(Boolean).join(" / ")}` }))} /></Form.Item><Form.Item name={[field.name, "quantity"]} label="Cantidad" rules={[{ required: true }]}><InputNumber min={0.000001} precision={3} style={{ width: "100%" }} /></Form.Item><Form.Item name={[field.name, "unitPrice"]} label={`Precio unitario ${selectedCurrency?.code ?? ""}`} rules={[{ required: true }]}><InputNumber min={0} precision={4} style={{ width: "100%" }} /></Form.Item></div></Card>)}<Button block icon={<PlusOutlined />} onClick={() => add({ quantity: 1, unitPrice: 0 })}>Agregar producto</Button></Space>}</Form.List>
        <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 3 }} style={{ marginTop: 18 }} items={[
          { key: "subtotal", label: "Subtotal", children: `${selectedCurrency?.symbol ?? ""} ${preview.subtotal.toFixed(2)}` },
          { key: "igv", label: `IGV (${new Decimal(options.data?.igvRate ?? 18).toFixed(2)} %)`, children: `${selectedCurrency?.symbol ?? ""} ${preview.tax.toFixed(2)}` },
          { key: "total", label: "Total", children: <strong>{selectedCurrency?.symbol ?? ""} {preview.total.toFixed(2)}</strong> },
        ]} />
      </Form>
    </Modal>
  </>;
}
