"use client";

import { DeleteOutlined, PlusOutlined, ReloadOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Descriptions, Drawer, Empty, Form, Input, InputNumber, Modal, Select, Space, Spin, Table, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useState } from "react";
import { toast } from "sonner";

type Detail = { document: { id: string; kind: string; status: string; number?: string; series?: string; correlativo?: string; remoteId: string; createdAt: string; sale?: { number: string; customer: { name: string } } | null }; remote: Record<string, unknown> };
type Payment = { id: number; metodo: string; monto: number; referencia?: string; monto_recibido?: number; vuelto?: number; notas?: string; creado_en?: string };
type PaymentSummary = { pagos: Payment[]; estado_pago: string; monto_pagado: number; total_documento?: number };
type OfficialCpe = {
  encontrado: boolean;
  mensaje?: string;
  estado_cp?: string;
  estado_cp_descripcion?: string;
  estado_ruc_descripcion?: string;
  cond_domi_ruc_descripcion?: string;
  observaciones?: string[];
  checkedAt: string;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo completar la operación.");
  return payload.data;
}

const labels: Record<string, string> = {
  tipo_documento: "Tipo", serie: "Serie", correlativo: "Correlativo", numero_completo: "Número", identifier: "Identificador",
  fecha_emision: "Fecha de emisión", fecha_vencimiento: "Vencimiento", fecha_generacion: "Fecha de generación", fecha_comunicacion: "Fecha de comunicación",
  tipo_moneda: "Moneda", forma_pago: "Forma de pago", estado_sunat: "Estado SUNAT", sunat_status: "Estado SUNAT",
  codigo_sunat: "Código SUNAT", descripcion_sunat: "Respuesta SUNAT", ticket: "Ticket", total_documentos: "Documentos",
  razon_social: "Razón social", num_doc: "Documento", direccion: "Dirección", descripcion: "Descripción", cantidad: "Cantidad",
  precio_unitario: "Precio unitario", valor_unitario: "Valor unitario", total: "Total", igv: "IGV", gravadas: "Gravadas",
  exoneradas: "Exoneradas", inafectas: "Inafectas", valor_venta: "Valor de venta", sub_total: "Subtotal",
};

function title(key: string) {
  return labels[key] ?? key.replaceAll("_", " ").replace(/^./, (value) => value.toUpperCase());
}

function scalar(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") return new Intl.NumberFormat("es-PE", { maximumFractionDigits: 4 }).format(value);
  return String(value);
}

function ObjectSection({ name, value }: { name: string; value: Record<string, unknown> }) {
  const entries = Object.entries(value).filter(([, item]) => item === null || ["string", "number", "boolean"].includes(typeof item));
  return <Card size="small" title={title(name)}><Descriptions size="small" bordered column={{ xs: 1, sm: 2 }} items={entries.map(([key, item]) => ({ key, label: title(key), children: scalar(item) }))} /></Card>;
}

function ArraySection({ name, value }: { name: string; value: unknown[] }) {
  if (!value.length) return null;
  const rows = value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row).filter((key) => row[key] === null || ["string", "number", "boolean"].includes(typeof row[key]))))].slice(0, 8);
  return <Card size="small" title={title(name)}><Table size="small" rowKey={(_, index) => String(index)} pagination={false} scroll={{ x: 650 }} dataSource={rows} columns={keys.map((key) => ({ title: title(key), dataIndex: key, render: scalar }))} /></Card>;
}

function PaymentManagement({ documentId, canManage }: { documentId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const queryKey = ["electronic-document-payments", documentId];
  const payments = useQuery({ queryKey, queryFn: () => api<PaymentSummary>(`/api/v1/electronic-billing/documents/${documentId}/payments`) });
  const create = useMutation({
    mutationFn: (values: Record<string, unknown>) => api<PaymentSummary>(`/api/v1/electronic-billing/documents/${documentId}/payments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values) }),
    onSuccess: async () => { toast.success("Pago registrado en la plataforma SUNAT."); setOpen(false); form.resetFields(); await queryClient.invalidateQueries({ queryKey }); },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (paymentId: number) => api<PaymentSummary>(`/api/v1/electronic-billing/documents/${documentId}/payments/${paymentId}`, { method: "DELETE" }),
    onSuccess: async () => { toast.success("Pago eliminado."); await queryClient.invalidateQueries({ queryKey }); },
    onError: (error) => toast.error(error.message),
  });
  return <Card size="small" title="Pagos y cobranza" extra={canManage ? <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>Registrar pago</Button> : null}>
    {payments.error ? <Alert type="error" showIcon message={payments.error.message} /> : null}
    <Space wrap style={{ marginBottom: 12 }}><Tag>Estado: {payments.data?.estado_pago ?? "—"}</Tag><Tag color="blue">Pagado: {scalar(payments.data?.monto_pagado)}</Tag><Tag>Total: {scalar(payments.data?.total_documento)}</Tag></Space>
    <Table<Payment> size="small" rowKey="id" loading={payments.isLoading} pagination={false} dataSource={payments.data?.pagos ?? []} locale={{ emptyText: <Empty description="No hay pagos registrados" /> }} columns={[
      { title: "Fecha", dataIndex: "creado_en", render: (value) => value ? dayjs(value).format("DD/MM/YYYY HH:mm") : "—" },
      { title: "Método", dataIndex: "metodo", render: (value) => title(value) },
      { title: "Referencia", dataIndex: "referencia", render: scalar },
      { title: "Monto", dataIndex: "monto", align: "right", render: scalar },
      { title: "", width: 50, render: (_, item) => canManage ? <Button danger type="text" icon={<DeleteOutlined />} loading={remove.isPending && remove.variables === item.id} onClick={() => Modal.confirm({ title: "¿Eliminar este pago?", okButtonProps: { danger: true }, okText: "Eliminar", cancelText: "Cancelar", onOk: () => remove.mutateAsync(item.id) })} /> : null },
    ]} />
    <Modal title="Registrar pago" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={create.isPending} okText="Registrar">
      <Form form={form} layout="vertical" initialValues={{ metodo: "transferencia" }} onFinish={(values) => create.mutate(values)}>
        <Form.Item name="metodo" label="Método" rules={[{ required: true }]}><Select options={["efectivo", "yape", "plin", "transferencia", "tarjeta", "cheque", "otro"].map((value) => ({ value, label: title(value) }))} /></Form.Item>
        <Form.Item name="monto" label="Monto" rules={[{ required: true }]}><InputNumber min={0.01} precision={2} style={{ width: "100%" }} /></Form.Item>
        <Form.Item name="monto_recibido" label="Monto recibido (efectivo)"><InputNumber min={0} precision={2} style={{ width: "100%" }} /></Form.Item>
        <Form.Item name="referencia" label="Referencia"><Input maxLength={100} /></Form.Item>
        <Form.Item name="notas" label="Notas"><Input.TextArea rows={2} maxLength={255} /></Form.Item>
      </Form>
    </Modal>
  </Card>;
}

function OfficialCpeValidation({ documentId }: { documentId: string }) {
  const validation = useMutation({
    mutationFn: () => api<OfficialCpe>(`/api/v1/electronic-billing/documents/${documentId}/cpe`, { method: "POST" }),
    onError: (error) => toast.error(error.message),
  });
  const result = validation.data;
  const color = result?.estado_cp === "1" ? "green" : result?.estado_cp === "3" ? "blue" : result?.estado_cp === "0" ? "default" : "red";
  return <Card
    size="small"
    title={<Space><SafetyCertificateOutlined />Validación oficial CPE</Space>}
    extra={<Button type="primary" icon={<SafetyCertificateOutlined />} loading={validation.isPending} onClick={() => validation.mutate()}>Consultar SUNAT</Button>}
  >
    {!result ? <Typography.Text type="secondary">Consulta el estado actual del comprobante en la API oficial de SUNAT. Esta verificación es independiente del estado guardado en la plataforma.</Typography.Text> : <Space direction="vertical" size="small" style={{ width: "100%" }}>
      <Alert
        type={result.estado_cp === "1" ? "success" : result.encontrado ? "warning" : "error"}
        showIcon
        message={result.estado_cp_descripcion ?? (result.encontrado ? "Comprobante encontrado" : "Comprobante no encontrado")}
        description={result.mensaje}
      />
      <Descriptions size="small" bordered column={{ xs: 1, sm: 2 }} items={[
        { key: "estado", label: "Estado del CPE", children: <Tag color={color}>{result.estado_cp_descripcion ?? "Sin estado"}</Tag> },
        { key: "fecha", label: "Última consulta", children: dayjs(result.checkedAt).format("DD/MM/YYYY HH:mm:ss") },
        { key: "ruc", label: "Estado del RUC", children: result.estado_ruc_descripcion ?? "—" },
        { key: "domicilio", label: "Condición del domicilio", children: result.cond_domi_ruc_descripcion ?? "—" },
      ]} />
      {result.observaciones?.length ? <Alert type="info" showIcon message="Observaciones de SUNAT" description={<ul style={{ margin: 0, paddingLeft: 18 }}>{result.observaciones.map((item) => <li key={item}>{item}</li>)}</ul>} /> : null}
    </Space>}
  </Card>;
}

export function ElectronicDocumentDetail({ documentId, open, onClose, canManagePayments }: { documentId?: string; open: boolean; onClose: () => void; canManagePayments: boolean }) {
  const detail = useQuery({ queryKey: ["electronic-document-detail", documentId], queryFn: () => api<Detail>(`/api/v1/electronic-billing/documents/${documentId}`), enabled: open && Boolean(documentId) });
  const remote = detail.data?.remote ?? {};
  const scalarEntries = Object.entries(remote).filter(([, value]) => value === null || ["string", "number", "boolean"].includes(typeof value));
  const objectEntries = Object.entries(remote).filter(([, value]) => Boolean(value) && typeof value === "object" && !Array.isArray(value)) as Array<[string, Record<string, unknown>]>;
  const arrayEntries = Object.entries(remote).filter(([, value]) => Array.isArray(value)) as Array<[string, unknown[]]>;
  const paymentKinds = ["INVOICE", "RECEIPT", "PURCHASE_SETTLEMENT"];
  const officialCpeKinds = ["INVOICE", "RECEIPT", "PURCHASE_SETTLEMENT", "CREDIT_NOTE", "DEBIT_NOTE"];
  return <Drawer title={detail.data?.document.number ?? "Detalle del documento"} width={920} open={open} onClose={onClose} extra={<Button icon={<ReloadOutlined />} onClick={() => detail.refetch()}>Actualizar</Button>}>
    {detail.isLoading ? <Spin /> : detail.error ? <Alert type="error" showIcon message={detail.error.message} /> : detail.data ? <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Card size="small" title="Documento"><Descriptions bordered size="small" column={{ xs: 1, sm: 2 }} items={scalarEntries.map(([key, value]) => ({ key, label: title(key), children: scalar(value) }))} /></Card>
      {objectEntries.map(([name, value]) => <ObjectSection key={name} name={name} value={value} />)}
      {arrayEntries.filter(([name]) => name !== "pagos").map(([name, value]) => <ArraySection key={name} name={name} value={value} />)}
      {officialCpeKinds.includes(detail.data.document.kind) ? <OfficialCpeValidation key={detail.data.document.id} documentId={detail.data.document.id} /> : null}
      {paymentKinds.includes(detail.data.document.kind) ? <PaymentManagement documentId={detail.data.document.id} canManage={canManagePayments} /> : null}
    </Space> : <Typography.Text>No se encontró información.</Typography.Text>}
  </Drawer>;
}
