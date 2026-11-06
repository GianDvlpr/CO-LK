"use client";

import { CheckOutlined, CloseCircleOutlined, DollarOutlined, EditOutlined, FilePdfOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
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
import { paymentSummary, saleTotals } from "@/modules/sales/domain/sale-calculations";

type Variant = { id: string; sku: string; product: { code: string; name: string }; size: { name: string }; color: { name: string }; secondaryColor?: { name: string } | null };
type Currency = { id: string; code: string; name: string; symbol: string; isBase: boolean; exchangeRates: { rate: string; rateDate: string }[] };
type OrderOption = { id: string; number: string; customer: { id: string; code: string; name: string }; saleLinks: { saleId: string }[]; pickPackOrder: { status: string; lines: { packedQuantity: string; salesOrderLine: { unitPrice: string; productVariantId: string; productVariant: Variant } }[] } };
type Options = { igvRate: string; currencies: Currency[]; orders: OrderOption[] };
type SaleLine = { id: string; quantity: string; unitPrice: string; productVariant: Variant };
type Payment = { id: string; amount: string; paymentDate: string; method: string; reference?: string; notes?: string; createdBy: { name: string; username: string } };
type Sale = { id: string; number: string; status: string; paymentStatus: string; documentType: string; documentSeries?: string; documentNumber?: string; issueDate: string; dueDate?: string; exchangeRate: string; discountRate: string; taxRate: string; paymentMethod: string; notes?: string; customer: { id: string; code: string; name: string }; currency: Omit<Currency, "exchangeRates">; salesOrders: { salesOrder: { id: string; number: string } }[]; lines: SaleLine[]; payments: Payment[] };
type SaleForm = { salesOrderIds: string[]; currencyId: string; documentType: string; documentSeries?: string; documentNumber?: string; issueDate: Dayjs; dueDate?: Dayjs; exchangeRate: number; discountRate: number; paymentMethod: string; notes?: string; lines: { productVariantId: string; quantity: number; unitPrice: number; label: string }[] };
type PaymentForm = { amount: number; paymentDate: Dayjs; method: string; reference?: string; notes?: string };

async function api<T>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, init); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo completar la operación."); return payload.data; }

const saleStatuses: Record<string, [string, string]> = { DRAFT: ["Borrador", "blue"], ISSUED: ["Emitida", "green"], VOIDED: ["Anulada", "default"] };
const paymentStatuses: Record<string, [string, string]> = { PENDING: ["Pendiente", "orange"], PARTIAL: ["Parcial", "gold"], PAID: ["Pagada", "green"] };
const documentLabels: Record<string, string> = { INVOICE: "Factura", RECEIPT: "Boleta", SALE_NOTE: "Nota de venta", OTHER: "Otro" };
const paymentLabels: Record<string, string> = { CASH: "Efectivo", TRANSFER: "Transferencia", CARD: "Tarjeta", CREDIT: "Crédito", OTHER: "Otro" };

function summary(sale: Sale) {
  const totals = saleTotals(sale.lines, sale.discountRate, sale.taxRate, sale.exchangeRate);
  return { totals, payments: paymentSummary(totals.total, sale.payments) };
}

export function SalesWorkspace({ permissions }: { permissions: string[] }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Sale>();
  const [paying, setPaying] = useState<Sale>();
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [form] = Form.useForm<SaleForm>();
  const [paymentForm] = Form.useForm<PaymentForm>();
  const query = range ? `?from=${range[0].format("YYYY-MM-DD")}&to=${range[1].format("YYYY-MM-DD")}` : "";
  const records = useQuery({ queryKey: ["sales", range?.[0]?.format("YYYY-MM-DD"), range?.[1]?.format("YYYY-MM-DD")], queryFn: () => api<{ items: Sale[] }>(`/api/v1/sales${query}`) });
  const options = useQuery({ queryKey: ["sale-options"], queryFn: () => api<Options>("/api/v1/sales/options") });
  const formLines = Form.useWatch("lines", form) ?? [];
  const discountRate = Form.useWatch("discountRate", form) ?? 0;
  const currencyId = Form.useWatch("currencyId", form);
  const exchangeRate = Form.useWatch("exchangeRate", form) ?? 1;
  const selectedCurrency = options.data?.currencies.find((currency) => currency.id === currencyId);
  const preview = saleTotals(formLines.map((line) => ({ quantity: line.quantity ?? 0, unitPrice: line.unitPrice ?? 0 })), discountRate, options.data?.igvRate ?? 18, exchangeRate);
  const filtered = (records.data?.items ?? []).filter((sale) => matchesSearch(search, sale.number, sale.customer.name, sale.customer.code, sale.documentSeries, sale.documentNumber, ...sale.salesOrders.map((item) => item.salesOrder.number)));

  const refresh = async () => Promise.all([queryClient.invalidateQueries({ queryKey: ["sales"] }), queryClient.invalidateQueries({ queryKey: ["sale-options"] })]);
  const save = useMutation({ mutationFn: (values: SaleForm) => api(editing ? `/api/v1/sales/${editing.id}` : "/api/v1/sales", { method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...values, issueDate: values.issueDate.format("YYYY-MM-DD"), dueDate: values.dueDate?.format("YYYY-MM-DD"), lines: values.lines.map(({ productVariantId, unitPrice }) => ({ productVariantId, unitPrice })) }) }), onSuccess: async () => { toast.success(editing ? "Venta actualizada." : "Venta creada como borrador."); setOpen(false); setEditing(undefined); form.resetFields(); await refresh(); }, onError: (error) => toast.error(error.message) });
  const transition = useMutation({ mutationFn: ({ id, action }: { id: string; action: "issue" | "void" }) => api(`/api/v1/sales/${id}/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), onSuccess: async (_, variables) => { toast.success(variables.action === "issue" ? "Venta emitida." : "Venta anulada."); await refresh(); }, onError: (error) => toast.error(error.message) });
  const addPayment = useMutation({ mutationFn: (values: PaymentForm) => api(`/api/v1/sales/${paying?.id}/payments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...values, paymentDate: values.paymentDate.format("YYYY-MM-DD") }) }), onSuccess: async () => { toast.success("Pago registrado."); setPaying(undefined); paymentForm.resetFields(); await refresh(); }, onError: (error) => toast.error(error.message) });

  const availableOrders = (options.data?.orders ?? []).filter((order) => !order.saleLinks.length || order.saleLinks.some((link) => link.saleId === editing?.id));
  const loadOrders = (ids: string[]) => {
    const selected = availableOrders.filter((order) => ids.includes(order.id));
    const customerIds = new Set(selected.map((order) => order.customer.id));
    if (customerIds.size > 1) {
      const customerId = selected[0]?.customer.id;
      const compatible = selected.filter((order) => order.customer.id === customerId).map((order) => order.id);
      form.setFieldValue("salesOrderIds", compatible);
      toast.warning("Solo se conservaron pedidos del mismo cliente.");
      return loadOrders(compatible);
    }
    const aggregate = new Map<string, { variant: Variant; quantity: Decimal; value: Decimal }>();
    selected.forEach((order) => order.pickPackOrder.lines.forEach((line) => {
      const current = aggregate.get(line.salesOrderLine.productVariantId) ?? { variant: line.salesOrderLine.productVariant, quantity: new Decimal(0), value: new Decimal(0) };
      const quantity = new Decimal(line.packedQuantity);
      current.quantity = current.quantity.add(quantity);
      current.value = current.value.add(quantity.mul(line.salesOrderLine.unitPrice));
      aggregate.set(line.salesOrderLine.productVariantId, current);
    }));
    form.setFieldValue("lines", [...aggregate.entries()].map(([productVariantId, item]) => ({ productVariantId, quantity: Number(item.quantity), unitPrice: item.quantity.isZero() ? 0 : Number(item.value.div(item.quantity).toDecimalPlaces(4)), label: `${item.variant.sku} · ${item.variant.product.name} · Talla ${item.variant.size.name}` })));
  };
  const changeCurrency = (id: string) => { const currency = options.data?.currencies.find((item) => item.id === id); form.setFieldValue("exchangeRate", currency?.isBase ? 1 : Number(currency?.exchangeRates[0]?.rate ?? 1)); };
  const openCreate = () => { const base = options.data?.currencies.find((currency) => currency.isBase) ?? options.data?.currencies[0]; setEditing(undefined); form.resetFields(); form.setFieldsValue({ issueDate: dayjs(), currencyId: base?.id, exchangeRate: base?.isBase ? 1 : Number(base?.exchangeRates[0]?.rate ?? 1), discountRate: 0, documentType: "SALE_NOTE", paymentMethod: "TRANSFER", salesOrderIds: [], lines: [] }); setOpen(true); };
  const openEdit = (sale: Sale) => { setEditing(sale); form.setFieldsValue({ salesOrderIds: sale.salesOrders.map((item) => item.salesOrder.id), currencyId: sale.currency.id, documentType: sale.documentType, documentSeries: sale.documentSeries, documentNumber: sale.documentNumber, issueDate: dayjs(sale.issueDate), dueDate: sale.dueDate ? dayjs(sale.dueDate) : undefined, exchangeRate: Number(sale.exchangeRate), discountRate: Number(sale.discountRate), paymentMethod: sale.paymentMethod, notes: sale.notes, lines: sale.lines.map((line) => ({ productVariantId: line.productVariant.id, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice), label: `${line.productVariant.sku} · ${line.productVariant.product.name} · Talla ${line.productVariant.size.name}` })) }); setOpen(true); };
  const openPayment = (sale: Sale) => { setPaying(sale); const pending = summary(sale).payments.balance; paymentForm.setFieldsValue({ amount: Number(pending), paymentDate: dayjs(), method: sale.paymentMethod }); };

  const lineColumns: ColumnsType<SaleLine> = [
    { title: "SKU", width: 140, render: (_, line) => <strong>{line.productVariant.sku}</strong> },
    { title: "Producto", render: (_, line) => `${line.productVariant.product.name} · Talla ${line.productVariant.size.name} · ${[line.productVariant.color.name, line.productVariant.secondaryColor?.name].filter(Boolean).join(" / ")}` },
    { title: "Cantidad", dataIndex: "quantity", width: 100, align: "right", render: (value) => new Decimal(value).toFixed(2) },
    { title: "P. unitario", dataIndex: "unitPrice", width: 125, align: "right", render: (value) => new Decimal(value).toFixed(2) },
    { title: "Importe", width: 125, align: "right", render: (_, line) => new Decimal(line.quantity).mul(line.unitPrice).toFixed(2) },
  ];
  const paymentColumns: ColumnsType<Payment> = [
    { title: "Fecha", dataIndex: "paymentDate", width: 110, render: (value) => dayjs(value).format("DD/MM/YYYY") },
    { title: "Medio", dataIndex: "method", width: 130, render: (value) => paymentLabels[value] ?? value },
    { title: "Referencia", dataIndex: "reference", render: (value) => value || "—" },
    { title: "Importe", dataIndex: "amount", width: 120, align: "right", render: (value) => new Decimal(value).toFixed(2) },
  ];
  const columns: ColumnsType<Sale> = [
    { title: "Venta", dataIndex: "number", width: 155, render: (value) => <strong>{value}</strong> },
    { title: "Cliente", width: 220, render: (_, sale) => <><strong>{sale.customer.name}</strong><br /><Typography.Text type="secondary">{sale.customer.code}</Typography.Text></> },
    { title: "Documento", width: 165, render: (_, sale) => `${documentLabels[sale.documentType] ?? sale.documentType}${sale.documentSeries && sale.documentNumber ? ` ${sale.documentSeries}-${sale.documentNumber}` : ""}` },
    { title: "Emisión", dataIndex: "issueDate", width: 105, render: (value) => dayjs(value).format("DD/MM/YYYY") },
    { title: "Total", width: 130, align: "right", render: (_, sale) => `${sale.currency.symbol} ${summary(sale).totals.total.toFixed(2)}` },
    { title: "Saldo", width: 130, align: "right", render: (_, sale) => `${sale.currency.symbol} ${summary(sale).payments.balance.toFixed(2)}` },
    { title: "Venta", dataIndex: "status", width: 105, render: (value) => { const [label, color] = saleStatuses[value] ?? [value, "default"]; return <Tag color={color}>{label}</Tag>; } },
    { title: "Pago", dataIndex: "paymentStatus", width: 105, render: (value) => { const [label, color] = paymentStatuses[value] ?? [value, "default"]; return <Tag color={color}>{label}</Tag>; } },
    { title: "Acciones", width: 320, render: (_, sale) => <Space wrap>
      {sale.status === "DRAFT" && permissions.includes("sales.update") ? <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(sale)}>Editar</Button> : null}
      {permissions.includes("sales.print") ? <Button size="small" icon={<FilePdfOutlined />} href={`/api/v1/sales/${sale.id}/print`}>PDF</Button> : null}
      {sale.status === "DRAFT" && permissions.includes("sales.issue") ? <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => Modal.confirm({ title: `¿Emitir ${sale.number}?`, content: "La venta quedará cerrada para edición. Esto no generará otro movimiento de stock.", okText: "Emitir", onOk: () => transition.mutateAsync({ id: sale.id, action: "issue" }) })}>Emitir</Button> : null}
      {sale.status === "ISSUED" && sale.paymentStatus !== "PAID" && permissions.includes("sales.payment") ? <Button size="small" icon={<DollarOutlined />} onClick={() => openPayment(sale)}>Registrar pago</Button> : null}
      {sale.status === "ISSUED" && sale.paymentStatus === "PENDING" && permissions.includes("sales.void") ? <Button size="small" danger icon={<CloseCircleOutlined />} onClick={() => Modal.confirm({ title: `¿Anular ${sale.number}?`, content: "La anulación no altera el despacho ni el kardex.", okText: "Anular", okButtonProps: { danger: true }, onOk: () => transition.mutateAsync({ id: sale.id, action: "void" }) })}>Anular</Button> : null}
    </Space> },
  ];

  return <>
    <div className="page-heading"><ModuleHeadingIntro title="Ventas" eyebrow="Comercial" description="Documenta pedidos despachados y controla pagos sin volver a descontar existencias." /><Space wrap className="module-actions"><TableSearch value={search} onChange={setSearch} placeholder="Buscar venta, documento, cliente o pedido" /><DatePicker.RangePicker value={range} onChange={(value) => setRange(value ? [value[0]!, value[1]!] : null)} format="DD/MM/YYYY" /><Tooltip title="Actualizar"><Button icon={<ReloadOutlined />} aria-label="Actualizar" onClick={() => records.refetch()} /></Tooltip></Space></div>
    <Card className="section-card" title="Registro de ventas" extra={permissions.includes("sales.create") ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nueva venta</Button> : null}>
      {records.error ? <Alert type="error" showIcon message={records.error.message} style={{ marginBottom: 16 }} /> : null}
      <Table rowKey="id" loading={records.isLoading} columns={columns} dataSource={filtered} expandable={{ expandedRowRender: (sale) => <Space direction="vertical" style={{ width: "100%" }}><Typography.Text strong>Pedidos: {sale.salesOrders.map((item) => item.salesOrder.number).join(", ")}</Typography.Text><Table rowKey="id" size="small" sticky={false} pagination={false} columns={lineColumns.map((column) => ["P. unitario", "Importe"].includes(String(column.title)) ? { ...column, render: column.title === "P. unitario" ? (value: string) => `${sale.currency.symbol} ${new Decimal(value).toFixed(2)}` : (_: unknown, line: SaleLine) => `${sale.currency.symbol} ${new Decimal(line.quantity).mul(line.unitPrice).toFixed(2)}` } : column)} dataSource={sale.lines} />{sale.payments.length ? <><Typography.Text strong>Pagos</Typography.Text><Table rowKey="id" size="small" sticky={false} pagination={false} columns={paymentColumns.map((column) => column.title === "Importe" ? { ...column, render: (value: string) => `${sale.currency.symbol} ${new Decimal(value).toFixed(2)}` } : column)} dataSource={sale.payments} /></> : null}</Space> }} scroll={{ x: 1500 }} pagination={{ pageSize: 8, pageSizeOptions: [8, 16, 32] }} locale={{ emptyText: <Empty description="Aún no hay ventas registradas" /> }} />
    </Card>
    <Modal className="compact-form-modal" title={editing ? `Editar ${editing.number}` : "Nueva venta"} open={open} onCancel={() => { setOpen(false); setEditing(undefined); }} onOk={() => form.submit()} okText={editing ? "Guardar cambios" : "Crear borrador"} confirmLoading={save.isPending} width={1000} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(values) => save.mutate(values)}>
        <Form.Item name="salesOrderIds" label="Pedidos despachados" rules={[{ required: true }]} tooltip="Puedes consolidar varios pedidos si pertenecen al mismo cliente."><Select mode="multiple" maxTagCount="responsive" showSearch optionFilterProp="label" onChange={loadOrders} options={availableOrders.map((order) => ({ value: order.id, label: `${order.number} · ${order.customer.name}` }))} /></Form.Item>
        <div className="purchase-form-grid">
          {editing ? <Form.Item label="Código"><Input disabled value={editing.number} /></Form.Item> : null}
          <Form.Item name="documentType" label="Tipo de documento" rules={[{ required: true }]}><Select options={Object.entries(documentLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
          <Form.Item name="documentSeries" label="Serie"><Input placeholder="Ej. NV01" /></Form.Item>
          <Form.Item name="documentNumber" label="Número"><Input placeholder="Ej. 000001" /></Form.Item>
          <Form.Item name="issueDate" label="Fecha de emisión" rules={[{ required: true }]}><DatePicker style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="dueDate" label="Fecha de vencimiento"><DatePicker style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="currencyId" label="Moneda" rules={[{ required: true }]}><Select onChange={changeCurrency} options={options.data?.currencies.map((currency) => ({ value: currency.id, label: `${currency.code} · ${currency.name}` }))} /></Form.Item>
          <Form.Item name="exchangeRate" label="Tipo de cambio" rules={[{ required: true }]}><InputNumber min={0.000001} precision={6} disabled={selectedCurrency?.isBase} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="discountRate" label="Descuento (%)" rules={[{ required: true }]}><InputNumber min={0} max={100} precision={2} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="paymentMethod" label="Forma de pago" rules={[{ required: true }]}><Select options={Object.entries(paymentLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
        </div>
        <Form.Item name="notes" label="Observaciones"><Input.TextArea rows={2} /></Form.Item>
        <Form.List name="lines">{(fields) => <Space direction="vertical" style={{ width: "100%" }}><Typography.Title level={5}>Productos realmente despachados</Typography.Title>{fields.length ? fields.map((field) => <Card size="small" key={field.key}><div className="purchase-form-grid"><Form.Item name={[field.name, "label"]} label="Producto"><Input disabled /></Form.Item><Form.Item name={[field.name, "quantity"]} label="Cantidad despachada"><InputNumber disabled style={{ width: "100%" }} /></Form.Item><Form.Item name={[field.name, "unitPrice"]} label={`Precio unitario ${selectedCurrency?.code ?? ""}`} rules={[{ required: true }]}><InputNumber min={0} precision={4} style={{ width: "100%" }} /></Form.Item><Form.Item name={[field.name, "productVariantId"]} hidden><Input /></Form.Item></div></Card>) : <Alert type="info" showIcon message="Selecciona uno o más pedidos despachados para cargar sus productos." />}</Space>}</Form.List>
        <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 3 }} style={{ marginTop: 18 }} items={[{ key: "subtotal", label: "Subtotal", children: `${selectedCurrency?.symbol ?? ""} ${preview.subtotal.toFixed(2)}` }, { key: "igv", label: `IGV (${new Decimal(options.data?.igvRate ?? 18).toFixed(2)} %)`, children: `${selectedCurrency?.symbol ?? ""} ${preview.tax.toFixed(2)}` }, { key: "total", label: "Total", children: <strong>{selectedCurrency?.symbol ?? ""} {preview.total.toFixed(2)}</strong> }]} />
      </Form>
    </Modal>
    <Modal title={paying ? `Registrar pago de ${paying.number}` : "Registrar pago"} open={Boolean(paying)} onCancel={() => { setPaying(undefined); paymentForm.resetFields(); }} onOk={() => paymentForm.submit()} okText="Registrar pago" confirmLoading={addPayment.isPending} destroyOnHidden>
      {paying ? <Alert type="info" showIcon message={`Saldo pendiente: ${paying.currency.symbol} ${summary(paying).payments.balance.toFixed(2)}`} style={{ marginBottom: 16 }} /> : null}
      <Form form={paymentForm} layout="vertical" onFinish={(values) => addPayment.mutate(values)}><div className="purchase-form-grid"><Form.Item name="amount" label="Importe" rules={[{ required: true }]}><InputNumber min={0.01} precision={2} max={paying ? Number(summary(paying).payments.balance) : undefined} style={{ width: "100%" }} /></Form.Item><Form.Item name="paymentDate" label="Fecha" rules={[{ required: true }]}><DatePicker style={{ width: "100%" }} /></Form.Item><Form.Item name="method" label="Medio de pago" rules={[{ required: true }]}><Select options={Object.entries(paymentLabels).map(([value, label]) => ({ value, label }))} /></Form.Item><Form.Item name="reference" label="Referencia"><Input /></Form.Item></div><Form.Item name="notes" label="Observaciones"><Input.TextArea rows={2} /></Form.Item></Form>
    </Modal>
  </>;
}
