"use client";

import { CheckOutlined, DownloadOutlined, InboxOutlined, UploadOutlined } from "@ant-design/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, DatePicker, List, Modal, Space, Tag, Typography, Upload } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";
import { toast } from "sonner";

type ModuleKey = "purchases" | "inventory" | "recipes" | "products" | "orders";
type Issue = { rowNumber: number; field?: string; code: string; message: string };
type Preview = { jobId: string; status: string; totalRows: number; importMode: "ONLY_NEW" | "CREATE_UPDATE"; errors: Issue[]; warnings: Issue[]; preview: { sheet: string; rows: number }[] };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo completar la operación.");
  return payload.data;
}

export function ModuleImportButton({ module, permissions }: { module: ModuleKey; permissions: string[] }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<Preview>();
  const [period, setPeriod] = useState<[Dayjs, Dayjs]>([dayjs().startOf("month"), dayjs()]);
  const canPreview = permissions.includes("imports.preview");
  const canConfirm = permissions.includes("imports.confirm");
  const validate = useMutation({
    mutationFn: async () => { const body = new FormData(); body.append("file", file!); return api<Preview>(`/api/v1/imports/${module}/preview`, { method: "POST", body }); },
    onSuccess: (value) => { setPreview(value); toast[value.errors.length ? "warning" : "success"](value.errors.length ? "Corrige los errores antes de importar." : "Archivo validado correctamente."); },
    onError: (error) => toast.error(error.message),
  });
  const confirm = useMutation({
    mutationFn: async () => { const body = new FormData(); body.append("file", file!); body.append("jobId", preview!.jobId); return api<{ successRows: number; skippedRows: number }>(`/api/v1/imports/${module}/confirm`, { method: "POST", body }); },
    onSuccess: async (value) => { toast.success(`${value.successRows} nuevos agregados; ${value.skippedRows} existentes omitidos.`); setOpen(false); setFile(undefined); setPreview(undefined); await queryClient.invalidateQueries(); },
    onError: (error) => toast.error(error.message),
  });
  const reportQuery = `from=${period[0].format("YYYY-MM-DD")}&to=${period[1].format("YYYY-MM-DD")}`;
  return <>
    <Button icon={<UploadOutlined />} disabled={!canPreview} onClick={() => setOpen(true)}>Importar Excel</Button>
    <Modal className="module-import-modal" title="Carga masiva y reportes Excel" open={open} onCancel={() => setOpen(false)} footer={null} width={820} destroyOnHidden>
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Alert type="info" showIcon message="Los reportes se importan en modo Solo nuevos: los registros existentes se omiten y nunca se sobrescriben." />
        <Space wrap className="excel-toolbar">
          <Button icon={<DownloadOutlined />} href={`/api/v1/exports/${module}?mode=template`}>Descargar plantilla</Button>
          <DatePicker.RangePicker value={period} allowClear={false} format="DD/MM/YYYY" onChange={(value) => { if (value?.[0] && value[1]) setPeriod([value[0], value[1]]); }} />
          <Button icon={<DownloadOutlined />} href={`/api/v1/exports/${module}?mode=report&${reportQuery}`}>Descargar reporte</Button>
        </Space>
        <Upload.Dragger accept=".xlsx" maxCount={1} beforeUpload={(selected) => { setFile(selected); setPreview(undefined); return false; }} onRemove={() => { setFile(undefined); setPreview(undefined); }}>
          <p className="ant-upload-drag-icon"><InboxOutlined /></p><p className="ant-upload-text">Selecciona o arrastra el archivo .xlsx</p><p className="ant-upload-hint">Máximo 5 MB y 1,000 filas. No cambies los nombres de hojas o columnas.</p>
        </Upload.Dragger>
        <Button type="primary" block disabled={!file} loading={validate.isPending} onClick={() => validate.mutate()}>Validar archivo</Button>
        {preview ? <>
          <Alert type={preview.errors.length ? "error" : "success"} showIcon message={preview.errors.length ? `${preview.errors.length} errores bloquean la carga.` : `${preview.totalRows} filas válidas.`} description={<Space wrap><Tag color={preview.importMode === "ONLY_NEW" ? "blue" : "purple"}>{preview.importMode === "ONLY_NEW" ? "Solo nuevos" : "Crear o actualizar"}</Tag>{preview.warnings.length ? <Tag color="orange">{preview.warnings.length} advertencias</Tag> : null}</Space>} />
          {preview.warnings.length ? <List size="small" bordered header="Registros que se omitirán" dataSource={preview.warnings} renderItem={(item) => <List.Item>Fila {item.rowNumber}: {item.message}</List.Item>} /> : null}
          {preview.errors.length ? <List size="small" bordered header="Errores" dataSource={preview.errors} renderItem={(item) => <List.Item><Typography.Text type="danger">Fila {item.rowNumber}{item.field ? ` · ${item.field}` : ""}: {item.message}</Typography.Text></List.Item>} /> : null}
          {!preview.errors.length && preview.status === "PENDING" && canConfirm ? <Button type="primary" icon={<CheckOutlined />} loading={confirm.isPending} onClick={() => Modal.confirm({ title: "Confirmar carga masiva", content: preview.importMode === "ONLY_NEW" ? "Se agregarán únicamente registros nuevos; los existentes se omitirán." : "La operación se ejecutará en una sola transacción.", okText: "Importar", cancelText: "Cancelar", onOk: () => confirm.mutateAsync() })}>Confirmar importación</Button> : null}
        </> : null}
      </Space>
    </Modal>
  </>;
}
