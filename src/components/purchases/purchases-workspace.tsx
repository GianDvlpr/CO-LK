"use client";

import { CheckOutlined, CloseCircleOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, DatePicker, Divider, Empty, Form, Input, InputNumber, Modal, Select, Space, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import Decimal from "decimal.js";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ModuleImportButton } from "@/components/imports/module-import-button";
import { ModuleHeadingIntro } from "@/components/common/module-heading-intro";
import { ResponsiveTable as Table } from "@/components/common/responsive-table";

type PurchaseLine = { id: string; lineNumber: number; presentationType: string; presentationQty: string; contentPerUnit: string; receivedQuantity: string; pricePerBaseUnit: string; taxRate: string; total: string; item: { code: string; name: string; unit: { symbol: string } }; lots: { lot: { supplierLot: string | null } }[] };
type Purchase = {
  id: string; code: string; receptionDate: string; documentNumber: string; status: string;
  total: string; supplier: { code: string; name: string }; currency: { code: string }; lines: PurchaseLine[]; _count: { lines: number };
};
type Option = { id: string; code: string; name: string };
type ItemOption = Option & { lotTrackingMode: "NONE" | "OPTIONAL" | "REQUIRED"; unit: { symbol: string } };
type Options = { suppliers: Option[]; warehouses: Option[]; currencies: (Option & { isBase: boolean })[]; items: ItemOption[] };
type LineForm = { itemId?: string; presentationType?: string; presentationQuantity?: number; contentPerUnit?: number; pricePerBaseUnit?: number; taxRate?: number; lotCode?: string; supplierLot?: string };
type PurchaseForm = { supplierId: string; warehouseId: string; currencyId: string; receptionDate: Dayjs; documentNumber: string; exchangeRate: number; lines: LineForm[] };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo completar la operación.");
  return payload.data;
}

const statusColor: Record<string, string> = { PENDING: "gold", APPROVED: "green", REJECTED: "red", CANCELLED: "default", DRAFT: "blue" };
const statusLabel: Record<string, string> = { PENDING: "Pendiente", APPROVED: "Aprobada", REJECTED: "Rechazada", CANCELLED: "Anulada", DRAFT: "Borrador" };

export function PurchasesWorkspace({ permissions, canCreate, canApprove, canReject }: { permissions: string[]; canCreate: boolean; canApprove: boolean; canReject: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<PurchaseForm>();
  const watchedLines = Form.useWatch("lines", form) ?? [];

  const purchases = useQuery({
    queryKey: ["purchases"], queryFn: () => api<{ items: Purchase[] }>("/api/v1/purchases"),
  });
  const options = useQuery({
    queryKey: ["purchase-options"], queryFn: () => api<Options>("/api/v1/purchases/options"), enabled: open && canCreate,
  });

  const create = useMutation({
    mutationFn: (values: PurchaseForm) => api<Purchase>("/api/v1/purchases", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...values, receptionDate: values.receptionDate.format("YYYY-MM-DD"),
        lines: values.lines.map((line, index) => {
          const item = options.data?.items.find((candidate) => candidate.id === line.itemId);
          const quantity = new Decimal(line.presentationQuantity ?? 0).mul(line.contentPerUnit ?? 0).toString();
          return {
            lineNumber: index + 1, itemId: line.itemId, presentationType: line.presentationType,
            presentationQuantity: String(line.presentationQuantity),
            contentPerUnit: String(line.contentPerUnit), pricePerBaseUnit: String(line.pricePerBaseUnit), taxRate: String(line.taxRate ?? 18),
            lots: line.lotCode ? [{ lineNumber: 1, lotCode: line.lotCode, supplierLot: line.supplierLot, quantity }] : item?.lotTrackingMode === "REQUIRED" ? [] : undefined,
          };
        }),
      }),
    }),
    onSuccess: async () => { toast.success("Recepción registrada como pendiente."); setOpen(false); form.resetFields(); await queryClient.invalidateQueries({ queryKey: ["purchases"] }); },
    onError: (error) => toast.error(error.message),
  });

  const approve = useMutation({
    mutationFn: (id: string) => api(`/api/v1/purchases/${id}/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
    onSuccess: async () => { toast.success("Compra aprobada y kardex actualizado."); await queryClient.invalidateQueries({ queryKey: ["purchases"] }); },
    onError: (error) => toast.error(error.message),
  });

  const reject = useMutation({
    mutationFn: (id: string) => api(`/api/v1/purchases/${id}/reject`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
    onSuccess: async () => { toast.success("Compra rechazada."); await queryClient.invalidateQueries({ queryKey: ["purchases"] }); },
    onError: (error) => toast.error(error.message),
  });

  const total = watchedLines.reduce((sum, line) => {
    try { return sum.add(new Decimal(line.presentationQuantity ?? 0).mul(line.contentPerUnit ?? 0).mul(line.pricePerBaseUnit ?? 0).mul(new Decimal(1).add(new Decimal(line.taxRate ?? 18).div(100)))); }
    catch { return sum; }
  }, new Decimal(0));

  const columns: ColumnsType<Purchase> = [
    { title: "Código", dataIndex: "code", fixed: "left", width: 130, render: (value) => <strong>{value}</strong> },
    { title: "Recepción", dataIndex: "receptionDate", width: 120, render: (value) => dayjs(value).format("DD/MM/YYYY") },
    { title: "Proveedor", width: 220, render: (_, row) => <><strong>{row.supplier.name}</strong><br /><Typography.Text type="secondary">{row.supplier.code}</Typography.Text></> },
    { title: "Documento / guía", dataIndex: "documentNumber", width: 170 },
    { title: "Líneas", width: 90, align: "center", render: (_, row) => row._count.lines },
    { title: "Total", width: 140, align: "right", render: (_, row) => `${row.currency.code} ${new Decimal(row.total).toFixed(2)}` },
    { title: "Estado", dataIndex: "status", width: 120, render: (value) => <Tag color={statusColor[value]}>{statusLabel[value] ?? value}</Tag> },
    { title: "Acciones", fixed: "right", width: 210, render: (_, row) => row.status === "PENDING" ? <Space>{canApprove ? <Button size="small" icon={<CheckOutlined />} loading={approve.isPending} onClick={() => Modal.confirm({ title: `¿Aprobar ${row.code}?`, content: "La aprobación ingresará existencias al kardex y no puede editarse después.", okText: "Aprobar", cancelText: "Cancelar", onOk: () => approve.mutateAsync(row.id) })}>Aprobar</Button> : null}{canReject ? <Button size="small" danger icon={<CloseCircleOutlined />} loading={reject.isPending} onClick={() => Modal.confirm({ title: `¿Rechazar ${row.code}?`, content: "La compra quedará rechazada y no ingresará existencias al almacén.", okText: "Rechazar", okButtonProps: { danger: true }, cancelText: "Cancelar", onOk: () => reject.mutateAsync(row.id) })}>Rechazar</Button> : null}</Space> : null },
  ];

  const lineColumns: ColumnsType<PurchaseLine> = [
    { title: "Materia prima", width: 220, render: (_, row) => <><strong>{row.item.name}</strong><br /><Typography.Text type="secondary">{row.item.code}</Typography.Text></> },
    { title: "Presentación", width: 190, render: (_, row) => `${new Decimal(row.presentationQty).toFixed(3)} ${row.presentationType.toLowerCase()} de ${new Decimal(row.contentPerUnit).toFixed(3)} ${row.item.unit.symbol}` },
    { title: "Cantidad recibida", width: 145, align: "right", render: (_, row) => `${new Decimal(row.receivedQuantity).toFixed(3)} ${row.item.unit.symbol}` },
    { title: "Lote proveedor", width: 140, render: (_, row) => row.lots.map((entry) => entry.lot.supplierLot).filter(Boolean).join(", ") || "—" },
    { title: "Precio neto", width: 120, align: "right", render: (_, row) => new Decimal(row.pricePerBaseUnit).toFixed(4) },
    { title: "IGV", width: 80, align: "right", render: (_, row) => `${new Decimal(row.taxRate).toFixed(2)}%` },
    { title: "Precio con IGV", width: 130, align: "right", render: (_, row) => new Decimal(row.pricePerBaseUnit).mul(new Decimal(1).add(new Decimal(row.taxRate).div(100))).toFixed(4) },
    { title: "Total final", width: 130, align: "right", render: (_, row) => new Decimal(row.total).toFixed(2) },
  ];

  return <>
    <div className="page-heading">
      <ModuleHeadingIntro title="Compras y recepciones" eyebrow="Operativo" description="Registra documentos de proveedor, presentaciones, lotes, moneda, IGV y aprobación de entradas al kardex." />
      <Space wrap className="module-actions"><Button icon={<ReloadOutlined />} onClick={() => purchases.refetch()}>Actualizar</Button><ModuleImportButton module="purchases" permissions={permissions} /></Space>
    </div>
    <Card className="section-card" title="Recepciones registradas" extra={canCreate ? <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>Nueva recepción</Button> : null}>
      {purchases.error ? <Alert type="error" showIcon message={purchases.error.message} action={<Button onClick={() => router.refresh()}>Reintentar</Button>} /> : null}
      <Table rowKey="id" loading={purchases.isLoading} columns={columns} dataSource={purchases.data?.items ?? []} expandable={{ expandedRowRender: (row) => <Table rowKey="id" size="small" columns={lineColumns} dataSource={row.lines} pagination={false} scroll={{ x: 1180 }} /> }} scroll={{ x: 1230 }} pagination={{ pageSize: 20 }} locale={{ emptyText: <Empty description="Aún no hay recepciones registradas" /> }} />
    </Card>

    <Modal title="Nueva recepción de compra" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="Registrar pendiente" cancelText="Cancelar" confirmLoading={create.isPending} width={980} destroyOnHidden>
      {options.error ? <Alert type="error" showIcon message={options.error.message} style={{ marginBottom: 16 }} /> : null}
      <Form form={form} layout="vertical" onFinish={(values) => create.mutate(values)} initialValues={{ receptionDate: dayjs(), exchangeRate: 1, lines: [{ taxRate: 18 }] }}>
        <div className="purchase-form-grid">
          <Form.Item label="Código"><Input disabled value="Se generará automáticamente al guardar" /></Form.Item>
          <Form.Item name="receptionDate" label="Fecha de recepción" rules={[{ required: true }]}><DatePicker style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="supplierId" label="Proveedor" rules={[{ required: true }]}><Select loading={options.isLoading} showSearch optionFilterProp="label" options={options.data?.suppliers.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))} /></Form.Item>
          <Form.Item name="documentNumber" label="Documento / guía" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="warehouseId" label="Almacén" rules={[{ required: true }]}><Select options={options.data?.warehouses.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))} /></Form.Item>
          <Form.Item name="currencyId" label="Moneda" rules={[{ required: true }]}><Select options={options.data?.currencies.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))} /></Form.Item>
          <Form.Item name="exchangeRate" label="Tipo de cambio a PEN" rules={[{ required: true }]}><InputNumber min={0.000001} precision={6} style={{ width: "100%" }} /></Form.Item>
        </div>
        <Divider>Productos recibidos</Divider>
        <Form.List name="lines">
          {(fields, { add, remove }) => <Space direction="vertical" size={14} style={{ width: "100%" }}>
            {fields.map((field, index) => <Card size="small" key={field.key} title={`Línea ${index + 1}`} extra={fields.length > 1 ? <Button type="link" danger onClick={() => remove(field.name)}>Quitar</Button> : null}>
              <div className="purchase-line-grid">
                <Form.Item name={[field.name, "itemId"]} label="Materia prima" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={options.data?.items.map((item) => ({ value: item.id, label: `${item.code} · ${item.name} (${item.unit.symbol})` }))} /></Form.Item>
                <Form.Item name={[field.name, "presentationType"]} label="Tipo de presentación" rules={[{ required: true }]}><Input placeholder="Saco, botella, cilindro…" /></Form.Item>
                <Form.Item name={[field.name, "presentationQuantity"]} label="Cantidad de presentaciones" rules={[{ required: true }]}><InputNumber min={0.000001} style={{ width: "100%" }} placeholder="20" /></Form.Item>
                <Form.Item name={[field.name, "contentPerUnit"]} label="Contenido por presentación" rules={[{ required: true }]}><InputNumber min={0.000001} style={{ width: "100%" }} placeholder="10" /></Form.Item>
                <Form.Item label="Cantidad recibida"><Input value={new Decimal(watchedLines[index]?.presentationQuantity ?? 0).mul(watchedLines[index]?.contentPerUnit ?? 0).toString()} disabled suffix={options.data?.items.find((item) => item.id === watchedLines[index]?.itemId)?.unit.symbol} /></Form.Item>
                <Form.Item name={[field.name, "pricePerBaseUnit"]} label="Precio neto por unidad" rules={[{ required: true }]}><InputNumber min={0.000001} precision={6} style={{ width: "100%" }} /></Form.Item>
                <Form.Item name={[field.name, "taxRate"]} label="IGV %" rules={[{ required: true }]}><InputNumber min={0} max={100} precision={2} style={{ width: "100%" }} /></Form.Item>
                <Form.Item name={[field.name, "lotCode"]} label="Código interno de lote"><Input placeholder="Según configuración del ítem" /></Form.Item>
                <Form.Item name={[field.name, "supplierLot"]} label="Lote del proveedor"><Input placeholder="Opcional" /></Form.Item>
              </div>
            </Card>)}
            <Button block onClick={() => add({ taxRate: 18 })} icon={<PlusOutlined />}>Agregar línea</Button>
          </Space>}
        </Form.List>
        <div className="purchase-total"><span>Total estimado con IGV</span><strong>{total.toFixed(2)}</strong></div>
      </Form>
    </Modal>
  </>;
}
