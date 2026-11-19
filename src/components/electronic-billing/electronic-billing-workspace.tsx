"use client";

import { CloudSyncOutlined, DownloadOutlined, EyeOutlined, InfoCircleOutlined, PlusOutlined, RedoOutlined, ReloadOutlined, SendOutlined, StopOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, DatePicker, Empty, Form, Modal, Segmented, Select, Space, Tabs, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ModuleHeadingIntro } from "@/components/common/module-heading-intro";
import { ResponsiveTable as Table } from "@/components/common/responsive-table";
import { TableSearch, matchesSearch } from "@/components/common/table-search";
import { ElectronicDocumentFormFields, electronicDocumentInitialValues, type ElectronicDocumentKind } from "@/components/electronic-billing/electronic-document-form";
import { ElectronicDocumentDetail } from "@/components/electronic-billing/electronic-document-detail";
import { FiscalAdministration } from "@/components/electronic-billing/fiscal-administration";
import { FiscalDashboard } from "@/components/electronic-billing/fiscal-dashboard";
import { FiscalReferenceCatalogs } from "@/components/electronic-billing/fiscal-reference-catalogs";

type Kind = ElectronicDocumentKind;
type Document = { id: string; kind: Kind | "INVOICE" | "RECEIPT"; status: string; remoteId?: string; number?: string; series?: string; correlativo?: string; remoteStatus?: string; sunatCode?: string; sunatDescription?: string; lastError?: string; ticket?: string; createdAt: string; submittedAt?: string; sale?: { number: string; customer: { name: string } } | null; createdBy: { name: string; username: string } };
type RemoteSeries = { id: number; tipo: string; tipo_documento: string; serie: string; correlativo: number; siguiente_numero: string; sucursal: { id: number; nombre: string; cod_local: string } | null; activo: boolean };
type Configuration = { enabled: boolean; companyRuc?: string; availableSeries: RemoteSeries[]; seriesError?: string | null; series: Record<string, string | null> };
type Data = { items: Document[]; configuration: Configuration };
type FormValue = { kind: Kind; [key: string]: unknown };

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
const seriesTypeByKind: Partial<Record<Kind, string>> = {
  CREDIT_NOTE: "07", DEBIT_NOTE: "08", SENDER_GUIDE: "09", CARRIER_GUIDE: "31",
  RETENTION: "20", PERCEPTION: "40", PURCHASE_SETTLEMENT: "04",
};

type View = "ALL" | "ATTENTION" | "CANCELLATIONS" | "SUMMARIES";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) {
    const fields = body.error?.fields ? ` ${Object.entries(body.error.fields).map(([key, value]) => `${key}: ${value}`).join("; ")}` : "";
    throw new Error(`${body.error?.message ?? "No se pudo completar la operación."}${fields}`);
  }
  return body.data;
}

function cleanPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(cleanPayload).filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value).map(([key, item]) => [key, cleanPayload(item)] as const).filter(([, item]) => item !== undefined && item !== "");
    return entries.length ? Object.fromEntries(entries) : undefined;
  }
  return value;
}

export function ElectronicBillingWorkspace({ permissions, isSuperadmin }: { permissions: string[]; isSuperadmin: boolean }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [operationKey, setOperationKey] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>("ALL");
  const [detailId, setDetailId] = useState<string>();
  const [exportOpen, setExportOpen] = useState(false);
  const [exportRange, setExportRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [exportFormat, setExportFormat] = useState("ambos");
  const [form] = Form.useForm<FormValue>();
  const selectedKind = Form.useWatch("kind", form) ?? "CREDIT_NOTE";
  const records = useQuery({ queryKey: ["electronic-documents"], queryFn: () => api<Data>("/api/v1/electronic-billing/documents") });
  const filtered = useMemo(() => (records.data?.items ?? []).filter((item) => {
    const inView = view === "ALL"
      || (view === "ATTENTION" && ["PENDING", "REJECTED", "ERROR"].includes(item.status))
      || (view === "CANCELLATIONS" && ["VOIDED_DOCUMENT", "REVERSION"].includes(item.kind))
      || (view === "SUMMARIES" && item.kind === "DAILY_SUMMARY");
    return inView && matchesSearch(search, labels[item.kind], item.number, item.series, item.correlativo, item.remoteStatus, item.sunatDescription, item.sale?.number, item.sale?.customer.name);
  }), [records.data, search, view]);
  const create = useMutation({
    mutationFn: (values: FormValue) => {
      const { kind, ...fields } = values;
      return api<Document>("/api/v1/electronic-billing/documents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, operationKey, payload: cleanPayload(fields) }) });
    },
    onSuccess: async () => { toast.success("Documento enviado a la plataforma SUNAT."); setOpen(false); form.resetFields(); await queryClient.invalidateQueries({ queryKey: ["electronic-documents"] }); },
    onError: (error) => toast.error(error.message),
  });
  const refresh = useMutation({
    mutationFn: (id: string) => api<Document>(`/api/v1/electronic-billing/documents/${id}/refresh`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
    onSuccess: async () => { toast.success("Estado actualizado."); await queryClient.invalidateQueries({ queryKey: ["electronic-documents"] }); },
    onError: (error) => toast.error(error.message),
  });
  const synchronize = useMutation({
    mutationFn: () => api<{ created: number; updated: number; errors: Array<{ resource: string; message: string }> }>("/api/v1/electronic-billing/sync", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
    onSuccess: async (result) => { toast.success(`${result.created} documento(s) importados y ${result.updated} actualizados.${result.errors.length ? ` ${result.errors.length} recurso(s) no pudieron sincronizarse.` : ""}`); await queryClient.invalidateQueries({ queryKey: ["electronic-documents"] }); },
    onError: (error) => toast.error(error.message),
  });
  const resend = useMutation({
    mutationFn: (id: string) => api<Document>(`/api/v1/electronic-billing/documents/${id}/resend`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
    onSuccess: async () => { toast.success("Documento reenviado a la plataforma SUNAT."); await queryClient.invalidateQueries({ queryKey: ["electronic-documents"] }); },
    onError: (error) => toast.error(error.message),
  });
  const seriesFor = (kind: Kind) => {
    const type = seriesTypeByKind[kind];
    return type ? (records.data?.configuration.availableSeries ?? []).filter((item) => item.activo && item.tipo_documento === type) : [];
  };
  const changeKind = (kind: Kind, preset: Record<string, unknown> = {}) => {
    const available = seriesFor(kind);
    form.resetFields();
    form.setFieldsValue({ kind, ...electronicDocumentInitialValues(kind), ...(available[0] ? { serie: available[0].serie } : {}), ...preset });
  };
  const openCreate = (kind: Kind = "CREDIT_NOTE", preset: Record<string, unknown> = {}) => {
    setOperationKey(crypto.randomUUID());
    changeKind(kind, preset);
    setOpen(true);
  };
  const cancellationAction = (item: Document) => {
    if (item.kind === "RECEIPT" && item.remoteId) {
      openCreate("DAILY_SUMMARY", { anular: [{ id: Number(item.remoteId), motivo: "" }] });
      return;
    }
    if (["RETENTION", "PERCEPTION"].includes(item.kind) && item.series && item.correlativo) {
      openCreate("REVERSION", { detalles: [{ tipo_documento: item.kind === "RETENTION" ? "20" : "40", serie: item.series, correlativo: item.correlativo, motivo: "" }] });
      return;
    }
    if (["INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"].includes(item.kind) && item.series && item.correlativo) {
      const types: Record<string, string> = { INVOICE: "01", CREDIT_NOTE: "07", DEBIT_NOTE: "08" };
      openCreate("VOIDED_DOCUMENT", { detalles: [{ tipo_documento: types[item.kind], serie: item.series, correlativo: item.correlativo, motivo: "" }] });
    }
  };
  const canCancel = (item: Document) => ["ACCEPTED", "ACCEPTED_WITH_OBSERVATION"].includes(item.status)
    && ["INVOICE", "RECEIPT", "CREDIT_NOTE", "DEBIT_NOTE", "RETENTION", "PERCEPTION"].includes(item.kind)
    && Boolean(item.remoteId && (item.kind === "RECEIPT" || (item.series && item.correlativo)));

  const columns: ColumnsType<Document> = [
    { title: "Documento", width: 200, render: (_, item) => <><strong>{labels[item.kind] ?? item.kind}</strong><br /><Typography.Text type="secondary">{item.number ?? (item.series ? `${item.series}-${item.correlativo ?? "pendiente"}` : "Sin numeración")}</Typography.Text></> },
    { title: "Origen", width: 185, render: (_, item) => item.sale ? <>{item.sale.number}<br /><Typography.Text type="secondary">{item.sale.customer.name}</Typography.Text></> : "Registro fiscal" },
    { title: "Estado", width: 180, render: (_, item) => { const [label, color] = statuses[item.status] ?? [item.status, "default"]; return <><Tag color={color}>{label}</Tag>{item.remoteStatus ? <Typography.Text type="secondary" style={{ display: "block" }}>{item.remoteStatus}</Typography.Text> : null}</>; } },
    { title: "Respuesta SUNAT", render: (_, item) => item.lastError ? <Typography.Text type="danger">{item.lastError}</Typography.Text> : <>{item.sunatCode ? <Tag>{item.sunatCode}</Tag> : null}{item.sunatDescription ?? (item.ticket ? `Ticket ${item.ticket}` : "—")}</> },
    { title: "Fecha", width: 145, render: (_, item) => dayjs(item.submittedAt ?? item.createdAt).format("DD/MM/YYYY HH:mm") },
    { title: "Acciones", width: 285, render: (_, item) => <Space wrap>
      {item.remoteId ? <Button size="small" icon={<EyeOutlined />} onClick={() => setDetailId(item.id)}>Detalle</Button> : null}
      {item.remoteId ? <Tooltip title="Consultar estado"><Button size="small" icon={<ReloadOutlined />} loading={refresh.isPending && refresh.variables === item.id} onClick={() => refresh.mutate(item.id)}>Estado</Button></Tooltip> : null}
      {item.remoteId && ["PENDING", "REJECTED", "ERROR"].includes(item.status) ? <Button size="small" icon={<RedoOutlined />} loading={resend.isPending && resend.variables === item.id} onClick={() => Modal.confirm({ title: "¿Reenviar este documento?", content: "Se realizará un nuevo intento con el mismo documento y numeración.", okText: "Reenviar", cancelText: "Cancelar", onOk: () => resend.mutateAsync(item.id) })}>Reenviar</Button> : null}
      {canCancel(item) ? <Button size="small" danger icon={<StopOutlined />} onClick={() => cancellationAction(item)}>{["RETENTION", "PERCEPTION"].includes(item.kind) ? "Revertir" : "Dar de baja"}</Button> : null}
      {item.remoteId ? ([...(!["DAILY_SUMMARY", "VOIDED_DOCUMENT", "REVERSION"].includes(item.kind) ? ["pdf" as const] : []), "xml" as const, "cdr" as const]).map((artifact) => <Button key={artifact} size="small" icon={<DownloadOutlined />} href={`/api/v1/electronic-billing/documents/${item.id}/${artifact}`}>{artifact.toUpperCase()}</Button>) : null}
    </Space> },
  ];

  const configuration = records.data?.configuration;
  const availableForSelected = seriesFor(selectedKind);
  const selectedSeriesType = seriesTypeByKind[selectedKind];
  const selectedSeriesMissing = Boolean(configuration?.enabled && selectedSeriesType && !availableForSelected.length);
  return <>
    <div className="page-heading"><ModuleHeadingIntro title="Comprobantes SUNAT" eyebrow="Facturación electrónica" description="Emite, sincroniza y administra documentos, pagos, catálogos y alertas fiscales desde LKINNOVA." /><Space wrap className="module-actions"><TableSearch value={search} onChange={setSearch} placeholder="Buscar documento, estado o cliente" /><Button icon={<DownloadOutlined />} onClick={() => setExportOpen(true)}>Exportar ZIP</Button><Button icon={<CloudSyncOutlined />} loading={synchronize.isPending} disabled={!permissions.includes("sales.issue")} onClick={() => synchronize.mutate()}>Sincronizar API</Button><Tooltip title="Actualizar vista y series"><Button icon={<ReloadOutlined />} loading={records.isFetching} onClick={() => records.refetch()} /></Tooltip></Space></div>
    {!configuration?.enabled && !records.isLoading ? <Alert type="warning" showIcon message="La facturación electrónica aún no está configurada para esta empresa." description="Configura la URL, credenciales y RUC en el servidor. Las credenciales nunca se envían al navegador." style={{ marginBottom: 16 }} /> : null}
    {configuration?.seriesError ? <Alert type="warning" showIcon message="No se pudieron sincronizar las series con la plataforma SUNAT." description={configuration.seriesError} style={{ marginBottom: 16 }} action={<Button size="small" onClick={() => records.refetch()}>Reintentar</Button>} /> : null}
    <Tabs defaultActiveKey="dashboard" items={[
      { key: "dashboard", label: "Panel fiscal y alertas", children: <FiscalDashboard /> },
      { key: "reference", label: "Catálogos SUNAT y ubigeo", children: <FiscalReferenceCatalogs /> },
      ...(isSuperadmin ? [{ key: "administration", label: "Series y sucursales", children: <FiscalAdministration /> }] : []),
    ]} style={{ marginBottom: 20 }} />
    <Card className="section-card" title="Documentos electrónicos" extra={<Space>{configuration?.enabled ? <Tooltip title={`${configuration.availableSeries.length} serie(s) activa(s) sincronizada(s) desde la API SUNAT.`}><Tag icon={<InfoCircleOutlined />}>Series sincronizadas: {configuration.availableSeries.length}</Tag></Tooltip> : null}{permissions.includes("sales.issue") ? <Button type="primary" icon={<PlusOutlined />} disabled={!configuration?.enabled} onClick={() => openCreate()}>Nuevo documento</Button> : null}</Space>}>
      {records.error ? <Alert type="error" showIcon message={records.error.message} style={{ marginBottom: 16 }} /> : null}
      <Segmented<View> value={view} onChange={setView} options={[{ value: "ALL", label: "Todos" }, { value: "ATTENTION", label: "Pendientes y errores" }, { value: "CANCELLATIONS", label: "Bajas y reversiones" }, { value: "SUMMARIES", label: "Resúmenes de boletas" }]} style={{ marginBottom: 16 }} />
      <Table rowKey="id" loading={records.isLoading} columns={columns} dataSource={filtered} scroll={{ x: 1250 }} pagination={{ pageSize: 12, pageSizeOptions: [12, 24, 48] }} locale={{ emptyText: <Empty description="Aún no hay documentos electrónicos" /> }} />
    </Card>
    <Modal title={<Space>Nuevo documento electrónico<Tooltip title="Esta acción enviará el documento directamente a la plataforma de facturación. Revisa todos los datos antes de continuar."><InfoCircleOutlined style={{ color: "var(--ant-color-warning)" }} /></Tooltip></Space>} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="Revisar y enviar" okButtonProps={{ icon: <SendOutlined />, disabled: selectedSeriesMissing }} confirmLoading={create.isPending} width={1080} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(values) => create.mutate(values)}>
        <Form.Item name="kind" label="Tipo de documento" rules={[{ required: true }]} extra="Las facturas y boletas se emiten desde Ventas."><Select onChange={(kind) => changeKind(kind)} options={Object.entries(labels).filter(([key]) => !["INVOICE", "RECEIPT"].includes(key)).map(([value, label]) => ({ value, label }))} /></Form.Item>
        {selectedSeriesType ? <Form.Item name="serie" label={<Space size={4}>Serie<Tooltip title="Las series se consultan directamente en la API SUNAT. El correlativo se asigna al emitir."><InfoCircleOutlined /></Tooltip></Space>} rules={[{ required: true, message: "Selecciona una serie." }]}><Select placeholder="Selecciona una serie activa" options={availableForSelected.map((item) => ({ value: item.serie, label: `${item.serie} · siguiente ${item.siguiente_numero}${item.sucursal ? ` · ${item.sucursal.nombre}` : ""}` }))} /></Form.Item> : null}
        {selectedSeriesMissing ? <Alert type="warning" showIcon message="No hay una serie activa para este documento." description="Créala o actívala en la plataforma SUNAT y presiona Sincronizar." style={{ marginBottom: 16 }} /> : null}
        <ElectronicDocumentFormFields kind={selectedKind} />
      </Form>
    </Modal>
    <Modal title="Exportar comprobantes" open={exportOpen} onCancel={() => setExportOpen(false)} footer={<Space><Button onClick={() => setExportOpen(false)}>Cancelar</Button><Button type="primary" icon={<DownloadOutlined />} disabled={!exportRange} href={exportRange ? `/api/v1/electronic-billing/export?from=${exportRange[0].format("YYYY-MM-DD")}&to=${exportRange[1].format("YYYY-MM-DD")}&format=${exportFormat}` : undefined} onClick={() => setExportOpen(false)}>Descargar ZIP</Button></Space>}>
      <Space direction="vertical" style={{ width: "100%" }}><Typography.Text>Selecciona un rango máximo de un año y el contenido del archivo.</Typography.Text><DatePicker.RangePicker value={exportRange} onChange={(value) => setExportRange(value ? [value[0]!, value[1]!] : null)} style={{ width: "100%" }} /><Select value={exportFormat} onChange={setExportFormat} options={[{ value: "xml", label: "Solo XML" }, { value: "pdf", label: "Solo PDF" }, { value: "ambos", label: "XML y PDF" }]} style={{ width: "100%" }} /></Space>
    </Modal>
    <ElectronicDocumentDetail documentId={detailId} open={Boolean(detailId)} onClose={() => setDetailId(undefined)} canManagePayments={permissions.includes("sales.payment")} />
  </>;
}
