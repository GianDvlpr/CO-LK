"use client";

import { CheckOutlined, DownloadOutlined, InboxOutlined, UploadOutlined } from "@ant-design/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, DatePicker, List, Modal, Radio, Space, Tag, Typography, Upload } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";
import { toast } from "sonner";

type ModuleKey = "purchases" | "inventory" | "inventory-formulas" | "recipes" | "products" | "orders";
type Issue = { rowNumber: number; field?: string; code: string; message: string };
type Preview = { jobId: string; status: string; totalRows: number; importMode: "ONLY_NEW" | "CREATE_UPDATE"; errors: Issue[]; warnings: Issue[]; preview: { sheet: string; rows: number }[] };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  let payload: { data?: T; error?: { message?: string } } | null = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  if (!response.ok) throw new Error(payload?.error?.message ?? `No se pudo completar la operación (HTTP ${response.status}).`);
  if (!payload) throw new Error("El servidor no devolvió una respuesta válida.");
  return payload.data as T;
}

export function ModuleImportButton({ module, permissions }: { module: ModuleKey; permissions: string[] }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<Preview>();
  const [mode, setMode] = useState<"ONLY_NEW" | "CREATE_UPDATE">();
  const [period, setPeriod] = useState<[Dayjs, Dayjs]>([dayjs().startOf("month"), dayjs()]);
  const canPreview = permissions.includes("imports.preview");
  const canConfirm = permissions.includes("imports.confirm");
  const selectedMode = mode ?? preview?.importMode ?? "ONLY_NEW";
  const canUpdateExisting = module !== "purchases" && module !== "orders";
  const warnings = preview ? (selectedMode === "CREATE_UPDATE" ? preview.warnings.filter((item) => item.code !== "EXISTING_RECORD_SKIPPED") : preview.warnings) : [];
  const validate = useMutation({
    mutationFn: async () => { const body = new FormData(); body.append("file", file!); return api<Preview>(`/api/v1/imports/${module}/preview`, { method: "POST", body }); },
    onSuccess: (value) => { setPreview(value); setMode(value.importMode); toast[value.errors.length ? "warning" : "success"](value.errors.length ? "Corrige los errores antes de importar." : "Archivo validado correctamente."); },
    onError: (error) => toast.error(error.message),
  });
  const confirm = useMutation({
    mutationFn: async () => { const body = new FormData(); body.append("file", file!); body.append("jobId", preview!.jobId); body.append("mode", selectedMode); return api<{ successRows: number; skippedRows: number }>(`/api/v1/imports/${module}/confirm`, { method: "POST", body }); },
    onSuccess: async (value) => { toast.success(`${value.successRows} registros procesados; ${value.skippedRows} omitidos.`); setOpen(false); setFile(undefined); setPreview(undefined); setMode(undefined); await queryClient.invalidateQueries(); },
    onError: (error) => toast.error(error.message),
  });
  const reportQuery = `from=${period[0].format("YYYY-MM-DD")}&to=${period[1].format("YYYY-MM-DD")}`;
  return <>
    <Button icon={<UploadOutlined />} disabled={!canPreview} onClick={() => setOpen(true)}>Importar Excel</Button>
    <Modal className="module-import-modal" title="Carga masiva y reportes Excel" open={open} onCancel={() => setOpen(false)} footer={null} width={820} destroyOnHidden>
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Alert type="info" showIcon message="Los reportes se importan por defecto en Solo nuevos. Después de validar, puedes elegir Crear o actualizar para aplicar los cambios del archivo." />
        <Space wrap className="excel-toolbar">
          <Button icon={<DownloadOutlined />} href={`/api/v1/exports/${module}?mode=template`}>Descargar plantilla</Button>
          <DatePicker.RangePicker value={period} allowClear={false} format="DD/MM/YYYY" onChange={(value) => { if (value?.[0] && value[1]) setPeriod([value[0], value[1]]); }} />
          <Button icon={<DownloadOutlined />} href={`/api/v1/exports/${module}?mode=report&${reportQuery}`}>Descargar reporte</Button>
        </Space>
        <Upload.Dragger accept=".xlsx" maxCount={1} beforeUpload={(selected) => { setFile(selected); setPreview(undefined); setMode(undefined); return false; }} onRemove={() => { setFile(undefined); setPreview(undefined); setMode(undefined); }}>
          <p className="ant-upload-drag-icon"><InboxOutlined /></p><p className="ant-upload-text">Selecciona o arrastra el archivo .xlsx</p><p className="ant-upload-hint">Máximo 5 MB y 1,000 filas. No cambies los nombres de hojas o columnas.</p>
        </Upload.Dragger>
        <Button type="primary" block disabled={!file} loading={validate.isPending} onClick={() => validate.mutate()}>Validar archivo</Button>
        {preview ? <>
          <Alert type={preview.errors.length ? "error" : "success"} showIcon message={preview.errors.length ? `${preview.errors.length} errores bloquean la carga.` : `${preview.totalRows} filas válidas.`} description={<Space wrap>{preview.errors.length ? null : <Tag color={selectedMode === "ONLY_NEW" ? "blue" : "purple"}>{selectedMode === "ONLY_NEW" ? "Solo nuevos" : "Crear o actualizar"}</Tag>}{warnings.length ? <Tag color="orange">{warnings.length} advertencias</Tag> : null}</Space>} />
          {!preview.errors.length && preview.status === "PENDING" ? <div>
            <Typography.Text strong>Modo de importación</Typography.Text>
            <Radio.Group value={selectedMode} onChange={(event) => setMode(event.target.value)} style={{ display: "block", marginTop: 8 }} options={[{ value: "ONLY_NEW", label: "Solo nuevos (omite los existentes)" }, { value: "CREATE_UPDATE", label: "Crear o actualizar (aplica los cambios)" }]} />
          </div> : null}
          {!preview.errors.length && selectedMode === "CREATE_UPDATE" && canUpdateExisting ? <Alert type="warning" showIcon message="Se actualizarán los campos modificados de los registros existentes." description="Si el archivo es antiguo, podrías sobrescribir datos más recientes. Las filas sin código crean registros nuevos." /> : null}
          {!preview.errors.length && selectedMode === "CREATE_UPDATE" && !canUpdateExisting ? <Alert type="warning" showIcon message={module === "purchases" ? "Compras no actualiza registros existentes." : "Pedidos no actualiza registros existentes."} description="Un código ya registrado bloqueará la carga completa." /> : null}
          {warnings.length ? <List size="small" bordered header="Registros que se omitirán" dataSource={warnings} renderItem={(item) => <List.Item>Fila {item.rowNumber}: {item.message}</List.Item>} /> : null}
          {preview.errors.length ? <List size="small" bordered header="Errores" dataSource={preview.errors} renderItem={(item) => <List.Item><Typography.Text type="danger">Fila {item.rowNumber}{item.field ? ` · ${item.field}` : ""}: {item.message}</Typography.Text></List.Item>} /> : null}
          {!preview.errors.length && preview.status === "PENDING" && canConfirm ? <Button type="primary" icon={<CheckOutlined />} loading={confirm.isPending} onClick={() => Modal.confirm({ title: "Confirmar carga masiva", content: selectedMode === "ONLY_NEW" ? "Se agregarán únicamente registros nuevos; los existentes se omitirán." : canUpdateExisting ? "Se actualizarán los registros existentes con los datos del archivo y se crearán las filas nuevas." : "La carga se ejecutará en una sola transacción; un código existente bloqueará la importación.", okText: "Importar", cancelText: "Cancelar", onOk: () => confirm.mutateAsync() })}>Confirmar importación</Button> : null}
        </> : null}
      </Space>
    </Modal>
  </>;
}
