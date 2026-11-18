"use client";

import { DownloadOutlined, PlusOutlined, ReloadOutlined, SendOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Empty, Form, Input, Modal, Select, Space, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ModuleHeadingIntro } from "@/components/common/module-heading-intro";
import { ResponsiveTable as Table } from "@/components/common/responsive-table";
import { TableSearch, matchesSearch } from "@/components/common/table-search";

type Kind = "CREDIT_NOTE" | "DEBIT_NOTE" | "SENDER_GUIDE" | "CARRIER_GUIDE" | "RETENTION" | "PERCEPTION" | "PURCHASE_SETTLEMENT" | "DAILY_SUMMARY" | "VOIDED_DOCUMENT" | "REVERSION";
type Document = { id: string; kind: Kind | "INVOICE" | "RECEIPT"; status: string; remoteId?: string; number?: string; series?: string; correlativo?: string; remoteStatus?: string; sunatCode?: string; sunatDescription?: string; lastError?: string; createdAt: string; submittedAt?: string; sale?: { number: string; customer: { name: string } } | null; createdBy: { name: string; username: string } };
type Configuration = { enabled: boolean; companyRuc?: string; series: Record<string, string | null> };
type Data = { items: Document[]; configuration: Configuration };
type FormValue = { kind: Kind; payload: string };

const labels: Record<string, string> = {
  INVOICE: "Factura", RECEIPT: "Boleta", CREDIT_NOTE: "Nota de crédito", DEBIT_NOTE: "Nota de débito",
  SENDER_GUIDE: "Guía remitente", CARRIER_GUIDE: "Guía transportista", RETENTION: "Retención",
  PERCEPTION: "Percepción", PURCHASE_SETTLEMENT: "Liquidación de compra", DAILY_SUMMARY: "Resumen diario",
  VOIDED_DOCUMENT: "Comunicación de baja", REVERSION: "Reversión",
};
const statuses: Record<string, [string, string]> = {
  SUBMITTING: ["Enviando", "processing"], PENDING: ["Pendiente", "gold"], SENT: ["Enviado", "blue"],
  PROCESSING: ["Procesando", "processing"], ACCEPTED: ["Aceptado", "green"], ACCEPTED_WITH_OBSERVATION: ["Aceptado con observación", "cyan"],
  REJECTED: ["Rechazado", "red"], ERROR: ["Error", "red"], VOIDED: ["Anulado", "default"],
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) {
    const fields = body.error?.fields ? ` ${Object.entries(body.error.fields).map(([key, value]) => `${key}: ${value}`).join("; ")}` : "";
    throw new Error(`${body.error?.message ?? "No se pudo completar la operación."}${fields}`);
  }
  return body.data;
}

function templates(kind: Kind) {
  const today = dayjs().format("YYYY-MM-DD");
  const party = { tipo_doc: "6", num_doc: "", razon_social: "", direccion: "" };
  const values: Record<Kind, unknown> = {
    CREDIT_NOTE: { fecha_emision: today, doc_afectado_tipo: "01", doc_afectado_serie: "F004", doc_afectado_correlativo: "", cod_motivo: "01", des_motivo: "Anulación de la operación", cliente: party, items: [{ codigo: "", descripcion: "", unidad: "NIU", cantidad: 1, precio_unitario: 0, tip_afe_igv: "10" }], tipo_moneda: "PEN" },
    DEBIT_NOTE: { fecha_emision: today, doc_afectado_tipo: "01", doc_afectado_serie: "F004", doc_afectado_correlativo: "", cod_motivo: "01", des_motivo: "Intereses por mora", cliente: party, items: [{ codigo: "", descripcion: "", unidad: "NIU", cantidad: 1, precio_unitario: 0, tip_afe_igv: "10" }], tipo_moneda: "PEN" },
    SENDER_GUIDE: { fecha_emision: today, destinatario: party, cod_traslado: "01", mod_traslado: "02", fecha_traslado: today, peso_total: 1, und_peso_total: "KGM", partida_ubigeo: "", partida_direccion: "", llegada_ubigeo: "", llegada_direccion: "", vehiculo: { placa: "" }, conductor: { tipo: "Principal", tipo_doc: "1", num_doc: "", nombres: "", apellidos: "", licencia: "" }, items: [{ codigo: "", descripcion: "", unidad: "NIU", cantidad: 1 }] },
    CARRIER_GUIDE: { fecha_emision: today, remitente: party, destinatario: party, doc_relacionado: { tipo_codigo: "09", numero: "", ruc_emisor: "" }, cod_traslado: "01", mod_traslado: "01", fecha_traslado: today, peso_total: 1, und_peso_total: "KGM", partida_ubigeo: "", partida_direccion: "", llegada_ubigeo: "", llegada_direccion: "", vehiculo: { placa: "" }, conductor: [{ tipo_doc: "1", num_doc: "", nombres: "", apellidos: "", licencia: "" }], items: [{ codigo: "", descripcion: "", unidad: "NIU", cantidad: 1 }] },
    RETENTION: { fecha_emision: today, cod_local: "0000", regimen: "01", tasa: 3, proveedor: party, documentos: [{ tipo_doc: "01", num_doc: "", fecha_emision: today, moneda: "PEN", imp_total: 0, fecha_retencion: today, pagos: [{ moneda: "PEN", importe: 0, fecha: today }] }] },
    PERCEPTION: { fecha_emision: today, cod_local: "0000", regimen: "01", tasa: 2, cliente: party, documentos: [{ tipo_doc: "01", num_doc: "", fecha_emision: today, moneda: "PEN", imp_total: 0, fecha_percepcion: today, cobros: [{ importe: 0, fecha: today }] }] },
    PURCHASE_SETTLEMENT: { fecha_emision: today, tipo_operacion: "0501", vendedor: { tipo_doc: "1", num_doc: "", nombre: "", direccion: "", ubigeo: "", tipo_domicilio: "01" }, lugar: { direccion: "", ubigeo: "", tipo: "01" }, items: [{ descripcion: "", cantidad: 1, valor_unitario: 0, unidad: "KGM", cod_producto_sunat: "", tip_afe_igv: "10" }] },
    DAILY_SUMMARY: { fecha_resumen: today },
    VOIDED_DOCUMENT: { fecha_generacion: today, fecha_comunicacion: today, detalles: [{ tipo_documento: "01", serie: "F004", correlativo: "", motivo: "" }] },
    REVERSION: { fecha_generacion: today, fecha_comunicacion: today, detalles: [{ tipo_documento: "20", serie: "", correlativo: "", motivo: "" }] },
  };
  return JSON.stringify(values[kind], null, 2);
}

export function ElectronicBillingWorkspace({ permissions }: { permissions: string[] }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [operationKey, setOperationKey] = useState("");
  const [search, setSearch] = useState("");
  const [form] = Form.useForm<FormValue>();
  const records = useQuery({ queryKey: ["electronic-documents"], queryFn: () => api<Data>("/api/v1/electronic-billing/documents") });
  const filtered = useMemo(() => (records.data?.items ?? []).filter((item) => matchesSearch(search, labels[item.kind], item.number, item.series, item.correlativo, item.remoteStatus, item.sunatDescription, item.sale?.number, item.sale?.customer.name)), [records.data, search]);
  const create = useMutation({
    mutationFn: (values: FormValue) => {
      let payload: unknown;
      try { payload = JSON.parse(values.payload); } catch { throw new Error("El contenido no es un JSON válido."); }
      return api<Document>("/api/v1/electronic-billing/documents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: values.kind, operationKey, payload }) });
    },
    onSuccess: async () => { toast.success("Documento enviado a la plataforma SUNAT."); setOpen(false); form.resetFields(); await queryClient.invalidateQueries({ queryKey: ["electronic-documents"] }); },
    onError: (error) => toast.error(error.message),
  });
  const refresh = useMutation({
    mutationFn: (id: string) => api<Document>(`/api/v1/electronic-billing/documents/${id}/refresh`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
    onSuccess: async () => { toast.success("Estado actualizado."); await queryClient.invalidateQueries({ queryKey: ["electronic-documents"] }); },
    onError: (error) => toast.error(error.message),
  });
  const openCreate = () => { const kind: Kind = "CREDIT_NOTE"; setOperationKey(crypto.randomUUID()); form.setFieldsValue({ kind, payload: templates(kind) }); setOpen(true); };

  const columns: ColumnsType<Document> = [
    { title: "Documento", width: 200, render: (_, item) => <><strong>{labels[item.kind] ?? item.kind}</strong><br /><Typography.Text type="secondary">{item.number ?? (item.series ? `${item.series}-${item.correlativo ?? "pendiente"}` : "Sin numeración")}</Typography.Text></> },
    { title: "Origen", width: 185, render: (_, item) => item.sale ? <>{item.sale.number}<br /><Typography.Text type="secondary">{item.sale.customer.name}</Typography.Text></> : "Registro fiscal" },
    { title: "Estado", width: 180, render: (_, item) => { const [label, color] = statuses[item.status] ?? [item.status, "default"]; return <><Tag color={color}>{label}</Tag>{item.remoteStatus ? <Typography.Text type="secondary" style={{ display: "block" }}>{item.remoteStatus}</Typography.Text> : null}</>; } },
    { title: "Respuesta SUNAT", render: (_, item) => item.lastError ? <Typography.Text type="danger">{item.lastError}</Typography.Text> : <>{item.sunatCode ? <Tag>{item.sunatCode}</Tag> : null}{item.sunatDescription ?? "—"}</> },
    { title: "Fecha", width: 145, render: (_, item) => dayjs(item.submittedAt ?? item.createdAt).format("DD/MM/YYYY HH:mm") },
    { title: "Acciones", width: 285, render: (_, item) => <Space wrap>
      {item.remoteId ? <Tooltip title="Consultar estado"><Button size="small" icon={<ReloadOutlined />} loading={refresh.isPending && refresh.variables === item.id} onClick={() => refresh.mutate(item.id)}>Estado</Button></Tooltip> : null}
      {item.remoteId ? (["pdf", "xml", "cdr"] as const).map((artifact) => <Button key={artifact} size="small" icon={<DownloadOutlined />} href={`/api/v1/electronic-billing/documents/${item.id}/${artifact}`}>{artifact.toUpperCase()}</Button>) : null}
    </Space> },
  ];

  const configuration = records.data?.configuration;
  const missingSeries = configuration ? Object.entries(configuration.series).filter(([key, value]) => key !== "invoice" && !value).map(([key]) => key) : [];
  return <>
    <div className="page-heading"><ModuleHeadingIntro title="Comprobantes SUNAT" eyebrow="Facturación electrónica" description="Emite, consulta y descarga comprobantes, notas, guías, retenciones, percepciones y liquidaciones." /><Space wrap className="module-actions"><TableSearch value={search} onChange={setSearch} placeholder="Buscar documento, estado o cliente" /><Tooltip title="Actualizar"><Button icon={<ReloadOutlined />} onClick={() => records.refetch()} /></Tooltip></Space></div>
    {!configuration?.enabled && !records.isLoading ? <Alert type="warning" showIcon message="La facturación electrónica aún no está configurada para esta empresa." description="Configura la URL, credenciales y RUC en el servidor. Las credenciales nunca se envían al navegador." style={{ marginBottom: 16 }} /> : null}
    {configuration?.enabled && missingSeries.length ? <Alert type="info" showIcon message="Hay series opcionales pendientes de configurar." description="Solo necesitas configurar la serie del tipo de documento que vas a usar. La factura ya utiliza F004." style={{ marginBottom: 16 }} /> : null}
    <Card className="section-card" title="Documentos electrónicos" extra={permissions.includes("sales.issue") ? <Button type="primary" icon={<PlusOutlined />} disabled={!configuration?.enabled} onClick={openCreate}>Nuevo documento</Button> : null}>
      {records.error ? <Alert type="error" showIcon message={records.error.message} style={{ marginBottom: 16 }} /> : null}
      <Table rowKey="id" loading={records.isLoading} columns={columns} dataSource={filtered} scroll={{ x: 1250 }} pagination={{ pageSize: 12, pageSizeOptions: [12, 24, 48] }} locale={{ emptyText: <Empty description="Aún no hay documentos electrónicos" /> }} />
    </Card>
    <Modal title="Nuevo documento electrónico" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="Enviar directamente" okButtonProps={{ icon: <SendOutlined /> }} confirmLoading={create.isPending} width={920} destroyOnHidden>
      <Alert type="warning" showIcon message="Esta acción enviará el documento directamente a la plataforma de facturación." description="Revisa todos los datos antes de continuar. La serie configurada en el servidor se aplicará automáticamente." style={{ marginBottom: 16 }} />
      <Form form={form} layout="vertical" onFinish={(values) => create.mutate(values)}>
        <Form.Item name="kind" label="Tipo de documento" rules={[{ required: true }]}><Select onChange={(kind: Kind) => form.setFieldValue("payload", templates(kind))} options={Object.entries(labels).filter(([key]) => !["INVOICE", "RECEIPT"].includes(key)).map(([value, label]) => ({ value, label }))} /></Form.Item>
        <Form.Item name="payload" label="Datos del documento (JSON)" extra="Los campos se validan en el servidor antes de enviarse. Facturas y boletas se emiten desde Ventas." rules={[{ required: true }]}><Input.TextArea autoSize={{ minRows: 18, maxRows: 28 }} style={{ fontFamily: "var(--font-geist-mono), monospace" }} spellCheck={false} /></Form.Item>
      </Form>
    </Modal>
  </>;
}
