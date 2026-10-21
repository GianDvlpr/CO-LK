"use client";

import { CheckOutlined, DownloadOutlined, FileExcelOutlined, InboxOutlined, ReloadOutlined, UploadOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Col, DatePicker, Empty, List, Modal, Row, Select, Space, Tag, Tooltip, Typography, Upload } from "antd";
import { ResponsiveTable as Table } from "@/components/common/responsive-table";
import { TableSearch, matchesSearch } from "@/components/common/table-search";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";
import { toast } from "sonner";
import { ModuleHeadingIntro } from "@/components/common/module-heading-intro";

const modules = [
  { key: "purchases", label: "Compras", sheets: "Compras y DetalleCompra" },
  { key: "inventory", label: "Almacén", sheets: "Items y MovimientosIniciales" },
  { key: "recipes", label: "Recetas", sheets: "Producción o Almacén · una fila por ingrediente" },
  { key: "products", label: "Productos", sheets: "Productos y Variantes" },
  { key: "orders", label: "Pedidos", sheets: "Pedidos y DetallePedido" },
] as const;

type ModuleKey = (typeof modules)[number]["key"];
type ImportError = { id?: string; rowNumber: number; field?: string; code: string; message: string };
type Job = { id: string; module: string; fileName: string; status: string; totalRows: number; successRows: number; errorRows: number; createdAt: string; createdBy: { name: string }; errors: ImportError[] };
type Preview = { jobId: string; status: string; totalRows: number; importMode: "ONLY_NEW" | "CREATE_UPDATE"; errors: ImportError[]; warnings: ImportError[]; preview: { sheet: string; rows: number; sample: Record<string, string>[] }[] };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo completar la operación.");
  return payload.data;
}

const statusLabel: Record<string, [string, string]> = {
  PENDING: ["Validado", "blue"], PROCESSING: ["Procesando", "processing"], COMPLETED: ["Completado", "green"], COMPLETED_WITH_ERRORS: ["Con errores", "red"], FAILED: ["Falló", "red"],
};

const { RangePicker } = DatePicker;

export function ImportsOverview({ permissions }: { permissions: string[] }) {
  const queryClient = useQueryClient();
  const [module, setModule] = useState<ModuleKey>("purchases");
  const [search, setSearch] = useState("");
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<Preview>();
  const [reportPeriod, setReportPeriod] = useState<[Dayjs, Dayjs]>([dayjs().startOf("month"), dayjs()]);
  const reportQuery = `from=${reportPeriod[0].format("YYYY-MM-DD")}&to=${reportPeriod[1].format("YYYY-MM-DD")}`;
  const jobs = useQuery({ queryKey: ["imports"], queryFn: () => api<{ items: Job[] }>("/api/v1/imports") });
  const filteredJobs = (jobs.data?.items ?? []).filter((job) => matchesSearch(search, job.fileName, job.module, statusLabel[job.status]?.[0], job.createdBy.name));
  const validate = useMutation({
    mutationFn: async () => { const body = new FormData(); body.append("file", file!); return api<Preview>(`/api/v1/imports/${module}/preview`, { method: "POST", body }); },
    onSuccess: async (result) => { setPreview(result); toast[result.errors.length ? "warning" : "success"](result.errors.length ? "El archivo contiene errores por corregir." : "Archivo válido y listo para confirmación."); await queryClient.invalidateQueries({ queryKey: ["imports"] }); },
    onError: (error) => toast.error(error.message),
  });
  const confirm = useMutation({
    mutationFn: async () => { const body = new FormData(); body.append("file", file!); body.append("jobId", preview!.jobId); return api<{ jobId: string; status: string; successRows: number; skippedRows: number }>(`/api/v1/imports/${module}/confirm`, { method: "POST", body }); },
    onSuccess: async (result) => { setPreview((current) => current ? { ...current, status: result.status } : current); toast.success(`${result.successRows} nuevos agregados; ${result.skippedRows} existentes omitidos.`); await Promise.all([queryClient.invalidateQueries({ queryKey: ["imports"] }), queryClient.invalidateQueries()]); },
    onError: async (error) => { toast.error(error.message); await queryClient.invalidateQueries({ queryKey: ["imports"] }); },
  });
  const columns: ColumnsType<Job> = [
    { title: "Fecha", dataIndex: "createdAt", width: 150, render: (value) => dayjs(value).format("DD/MM/YYYY HH:mm") },
    { title: "Módulo", dataIndex: "module", width: 120, render: (value) => modules.find((item) => item.key === value)?.label ?? value },
    { title: "Archivo", dataIndex: "fileName", ellipsis: true },
    { title: "Usuario", render: (_, row) => row.createdBy.name, width: 180 },
    { title: "Filas", dataIndex: "totalRows", width: 80, align: "right" },
    { title: "Errores", dataIndex: "errorRows", width: 80, align: "right" },
    { title: "Estado", dataIndex: "status", width: 130, render: (value) => { const [label, color] = statusLabel[value] ?? [value, "default"]; return <Tag color={color}>{label}</Tag>; } },
  ];

  return <>
    <div className="page-heading"><ModuleHeadingIntro title="Importaciones y reportes" eyebrow="Excel v1.5" description="Descarga plantillas, exporta la información vigente y valida archivos antes de aplicar una carga masiva." /><Space wrap className="module-actions"><TableSearch value={search} onChange={setSearch} placeholder="Buscar archivo, módulo o estado" /><Tooltip title="Actualizar historial"><Button icon={<ReloadOutlined />} aria-label="Actualizar historial" onClick={() => jobs.refetch()} /></Tooltip></Space></div>
    <Card className="section-card" style={{ marginBottom: 18 }} title="Periodo de los reportes">
      <Space direction="vertical" size="small">
        <RangePicker value={reportPeriod} format="DD/MM/YYYY" allowClear={false} onChange={(value) => { if (value?.[0] && value[1]) setReportPeriod([value[0], value[1]]); }} />
        <Typography.Text type="secondary">El rango incluye ambas fechas. Compras y Pedidos usan la fecha del documento; Almacén, Recetas y Productos usan la fecha de creación del registro.</Typography.Text>
      </Space>
    </Card>
    <Row gutter={[18, 18]}>{modules.map((item) => <Col xs={24} md={12} xl={8} key={item.key}><Card className="section-card" style={{ height: "100%" }}><Space align="start" size="middle"><div className="module-empty-icon" style={{ margin: 0, flex: "0 0 auto" }}><FileExcelOutlined /></div><div><Typography.Title level={3} style={{ margin: 0 }}>{item.label}</Typography.Title><Typography.Paragraph type="secondary" style={{ margin: "7px 0 18px" }}>Hojas: {item.sheets}.</Typography.Paragraph><Space wrap><Button icon={<DownloadOutlined />} href={`/api/v1/exports/${item.key}?mode=template`}>Plantilla</Button><Button type="primary" icon={<DownloadOutlined />} href={`/api/v1/exports/${item.key}?mode=report&${reportQuery}`}>Reporte del periodo</Button></Space></div></Space></Card></Col>)}</Row>
    <Card className="section-card" style={{ marginTop: 18 }} title="Validar una carga masiva">
      {!permissions.includes("imports.preview") ? <Alert type="warning" showIcon message="No tienes permiso para validar importaciones." /> : <Row gutter={[18, 18]}><Col xs={24} lg={8}><Space direction="vertical" style={{ width: "100%" }} size="middle"><Select value={module} onChange={(value) => { setModule(value); setFile(undefined); setPreview(undefined); }} style={{ width: "100%" }} options={modules.map((item) => ({ value: item.key, label: item.label }))} /><Upload.Dragger accept=".xlsx" maxCount={1} beforeUpload={(selected) => { setFile(selected); setPreview(undefined); return false; }} onRemove={() => { setFile(undefined); setPreview(undefined); }}><p className="ant-upload-drag-icon"><InboxOutlined /></p><p className="ant-upload-text">Selecciona o arrastra el archivo .xlsx</p><p className="ant-upload-hint">Máximo 5 MB y 1,000 filas. Usa la plantilla vigente sin cambiar hojas ni encabezados.</p></Upload.Dragger><Button type="primary" block icon={<UploadOutlined />} disabled={!file} loading={validate.isPending} onClick={() => validate.mutate()}>Validar archivo</Button>{preview && !preview.errors.length && preview.status === "PENDING" && permissions.includes("imports.confirm") ? <Button block type="primary" danger icon={<CheckOutlined />} loading={confirm.isPending} onClick={() => Modal.confirm({ title: "¿Confirmar la importación?", content: preview.importMode === "ONLY_NEW" ? "Se agregarán únicamente registros nuevos; los existentes se omitirán." : `Se aplicarán ${preview.totalRows} filas en una sola transacción.`, okText: "Confirmar e importar", okButtonProps: { danger: true }, onOk: () => confirm.mutateAsync() })}>Confirmar importación</Button> : null}</Space></Col><Col xs={24} lg={16}>{preview ? <><Alert type={preview.errors.length ? "error" : "success"} showIcon message={preview.errors.length ? `${preview.errors.length} errores encontrados en ${preview.totalRows} filas.` : `${preview.totalRows} filas válidas. Modo: ${preview.importMode === "ONLY_NEW" ? "solo nuevos" : "crear o actualizar"}.`} style={{ marginBottom: 14 }} />{preview.warnings.length ? <List bordered size="small" header={`${preview.warnings.length} advertencias / filas omitidas`} dataSource={preview.warnings} renderItem={(item) => <List.Item>Fila {item.rowNumber}: {item.message}</List.Item>} style={{ marginBottom: 14 }} /> : null}{preview.errors.length ? <List bordered size="small" dataSource={preview.errors} renderItem={(item) => <List.Item><Space direction="vertical" size={0}><Typography.Text strong>Fila {item.rowNumber}{item.field ? ` · ${item.field}` : ""}</Typography.Text><Typography.Text type="danger">{item.message}</Typography.Text></Space></List.Item>} /> : <List bordered size="small" dataSource={preview.preview} renderItem={(item) => <List.Item><Typography.Text strong>{item.sheet}</Typography.Text><Tag>{item.rows} filas</Tag></List.Item>} />}</> : <Empty description="Carga un archivo para revisar su estructura y campos obligatorios" />}</Col></Row>}
    </Card>
    <Card className="section-card" style={{ marginTop: 18 }} title="Historial de validaciones">{jobs.error ? <Alert type="error" showIcon message={jobs.error.message} style={{ marginBottom: 14 }} /> : null}<Table rowKey="id" loading={jobs.isLoading} columns={columns} dataSource={filteredJobs} pagination={{ pageSize: 8, pageSizeOptions: [8, 16, 32] }} expandable={{ expandedRowRender: (row) => row.errors.length ? <List size="small" dataSource={row.errors} renderItem={(error) => <List.Item>Fila {error.rowNumber}: {error.message}</List.Item>} /> : <Typography.Text type="secondary">Sin errores registrados.</Typography.Text> }} scroll={{ x: 950 }} /></Card>
  </>;
}
