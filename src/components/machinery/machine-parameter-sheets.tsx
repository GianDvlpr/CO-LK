"use client";

import { DeleteOutlined, FileTextOutlined, PlusOutlined, PrinterOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Drawer, Empty, Form, Input, Modal, Select, Space, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useState } from "react";
import { toast } from "sonner";

type MachineSummary = { id: string; code: string; name: string };
type ParameterRow = { scope: "GENERAL" | "STATION" | "INJECTOR" | "TEMPERATURE"; station?: string; channel?: string; groupName: string; parameter: string; value: string; unit?: string; notes?: string };
type SheetForm = { name: string; configurationType: "STATIC_INJECTOR" | "ROTARY_INJECTOR" | "CUSTOM"; application?: string; material?: string; notes?: string; parameters: ParameterRow[] };
type Sheet = { id: string; revision: number; name: string; configurationType: SheetForm["configurationType"]; application?: string; material?: string; notes?: string; createdAt: string; createdBy: { name: string; username: string }; parameters: ParameterRow[]; _count: { parameters: number } };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo completar la operación.");
  return payload.data;
}

const configurationLabels: Record<string, string> = { STATIC_INJECTOR: "Inyectora estática", ROTARY_INJECTOR: "Inyectora rotativa", CUSTOM: "Personalizada" };
const scopes = [
  { value: "GENERAL", label: "General" },
  { value: "STATION", label: "Estación" },
  { value: "INJECTOR", label: "Inyector / canal" },
  { value: "TEMPERATURE", label: "Temperatura" },
];

function staticTemplate(): ParameterRow[] {
  const rows: ParameterRow[] = [];
  const add = (scope: ParameterRow["scope"], station: string | undefined, channel: string | undefined, groupName: string, parameter: string, unit?: string) => rows.push({ scope, station, channel, groupName, parameter, value: "", unit });
  for (const channel of ["1C", "2C"]) {
    for (const parameter of ["Volumen de alimentación", "Primera inyección", "Segunda inyección", "Soporte de presión"]) add("STATION", "ST.1", channel, "Presión", parameter, "kg/cm²");
    for (const parameter of ["Volumen de alimentación", "Primera inyección", "Segunda inyección", "Soporte de presión"]) add("STATION", "ST.1", channel, "Flujo", parameter, "%");
    for (const parameter of ["Retardo de soporte", "Tiempo de soporte", "Tiempo de enfriado", "Máximo de inyección", "Retardo de alimentación", "Máximo de alimentación", "Gravedad específica"]) add("STATION", "ST.1", channel, "Tiempo / ciclo", parameter);
  }
  for (const injector of ["INJ-1", "INJ-2"]) for (let zone = 1; zone <= 4; zone += 1) add("TEMPERATURE", undefined, injector, "Zonas térmicas", `Zona ${zone} · SV`, "°C");
  return rows;
}

function rotaryTemplate(): ParameterRow[] {
  const rows: ParameterRow[] = [];
  const add = (scope: ParameterRow["scope"], station: string | undefined, channel: string | undefined, groupName: string, parameter: string, unit?: string) => rows.push({ scope, station, channel, groupName, parameter, value: "", unit });
  for (const parameter of ["Inyección 1", "Inyección 2", "Inyección 3", "1 bodega", "2 bodega", "Aumentador de presión"]) {
    add("STATION", "ST.1", undefined, "Presión", parameter);
    add("STATION", "ST.1", undefined, "Flujo", parameter);
  }
  for (const parameter of ["Inyección 1", "Inyección 2", "Inyección 3"]) add("STATION", "ST.1", undefined, "Ra.", parameter, "%");
  for (const parameter of ["Retardo de alimentación", "1 bodega", "2 bodega", "Sujeción", "Aumentador de presión", "Retardo de molde", "Retraso de soplado", "Soplado-retardo", "Tiempo adicional HMI"]) add("STATION", "ST.1", undefined, "Ajuste de tiempo", parameter);
  for (let zone = 1; zone <= 4; zone += 1) add("TEMPERATURE", undefined, undefined, "Zonas térmicas", `Temperatura ${zone} · SV`, "°C");
  return rows;
}

export function MachineParameterSheetsDrawer({ machine, permissions, onClose }: { machine?: MachineSummary; permissions: string[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<SheetForm>();
  const sheets = useQuery({
    queryKey: ["machine-parameter-sheets", machine?.id],
    queryFn: () => api<{ items: Sheet[] }>(`/api/v1/machinery/${machine!.id}/parameter-sheets`),
    enabled: Boolean(machine),
  });
  const create = useMutation({
    mutationFn: (values: SheetForm) => api(`/api/v1/machinery/${machine!.id}/parameter-sheets`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values) }),
    onSuccess: async () => { toast.success("Ficha de parámetros guardada."); setOpen(false); form.resetFields(); await queryClient.invalidateQueries({ queryKey: ["machine-parameter-sheets", machine?.id] }); },
    onError: (error) => toast.error(error.message),
  });

  const loadTemplate = (type: SheetForm["configurationType"]) => {
    form.setFieldsValue({ configurationType: type, parameters: type === "STATIC_INJECTOR" ? staticTemplate() : type === "ROTARY_INJECTOR" ? rotaryTemplate() : [{ scope: "GENERAL", groupName: "General", parameter: "", value: "" }] });
  };
  const startCreate = () => { form.resetFields(); form.setFieldsValue({ configurationType: "CUSTOM", parameters: [{ scope: "GENERAL", groupName: "General", parameter: "", value: "" }] }); setOpen(true); };
  const startRevision = (sheet: Sheet) => { form.resetFields(); form.setFieldsValue({ name: sheet.name, configurationType: sheet.configurationType, application: sheet.application, material: sheet.material, notes: sheet.notes, parameters: sheet.parameters.map(({ scope, station, channel, groupName, parameter, value, unit, notes }) => ({ scope, station: station || undefined, channel: channel || undefined, groupName, parameter, value, unit: unit || undefined, notes: notes || undefined })) }); setOpen(true); };

  return <>
    <Drawer title={machine ? `Parámetros · ${machine.code} · ${machine.name}` : "Fichas de parámetros"} open={Boolean(machine)} onClose={onClose} width="min(920px, 100vw)" extra={permissions.includes("machinery.create") ? <Button type="primary" icon={<PlusOutlined />} onClick={startCreate}>Nueva ficha</Button> : null}>
      <Typography.Paragraph type="secondary">Cada ficha es una revisión histórica imprimible. Crea otra ficha cuando cambie el material, molde, estación o configuración; no reemplaces una hoja ya entregada.</Typography.Paragraph>
      {sheets.data?.items.length ? <div className="machine-sheet-list">{sheets.data.items.map((sheet) => <Card size="small" key={sheet.id}>
        <div className="machine-sheet-card-head"><div><Space wrap><Typography.Text strong>{sheet.name}</Typography.Text><Tag color="blue">Rev. {String(sheet.revision).padStart(2, "0")}</Tag></Space><div><Typography.Text type="secondary">{configurationLabels[sheet.configurationType] ?? sheet.configurationType}</Typography.Text></div></div><Space wrap>{permissions.includes("machinery.create") ? <Button onClick={() => startRevision(sheet)}>Nueva revisión</Button> : null}<Button href={`/dashboard/machinery/parameters/${sheet.id}/print`} target="_blank" icon={<PrinterOutlined />}>Imprimir</Button></Space></div>
        <div className="machine-sheet-meta"><span>{sheet._count.parameters} parámetros</span><span>{sheet.material || "Material no indicado"}</span><span>{sheet.application || "Aplicación no indicada"}</span><span>{dayjs(sheet.createdAt).format("DD/MM/YYYY HH:mm")} · {sheet.createdBy.name || sheet.createdBy.username}</span></div>
      </Card>)}</div> : <Empty image={<FileTextOutlined style={{ fontSize: 46 }} />} description={sheets.isLoading ? "Cargando fichas…" : "Esta máquina todavía no tiene fichas de parámetros"} />}
    </Drawer>

    <Modal className="machine-sheet-modal" title={`Nueva ficha · ${machine?.name ?? "máquina"}`} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="Guardar revisión" confirmLoading={create.isPending} width={1240} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(values) => create.mutate(values)}>
        <div className="modal-form-grid modal-form-grid-3">
          <Form.Item name="name" label="Nombre de la ficha" rules={[{ required: true }]}><Input placeholder="Ej. PVC negro · molde I0034 · ST.1" /></Form.Item>
          <Form.Item name="configurationType" label="Estructura" rules={[{ required: true }]}><Select onChange={loadTemplate} options={[{ value: "STATIC_INJECTOR", label: "Inyectora estática" }, { value: "ROTARY_INJECTOR", label: "Inyectora rotativa" }, { value: "CUSTOM", label: "Personalizada" }]} /></Form.Item>
          <Form.Item label="Cargar campos"><Space wrap><Button onClick={() => loadTemplate("STATIC_INJECTOR")}>Plantilla estática</Button><Button onClick={() => loadTemplate("ROTARY_INJECTOR")}>Plantilla rotativa</Button></Space></Form.Item>
          <Form.Item name="application" label="Aplicación / producto"><Input placeholder="Modelo, molde o producto" /></Form.Item>
          <Form.Item name="material" label="Material"><Input placeholder="PVC, TR, EVA, compuesto…" /></Form.Item>
        </div>
        <Form.Item name="notes" label="Observaciones generales"><Input.TextArea rows={2} /></Form.Item>
        <Form.List name="parameters">{(fields, { add, remove }) => <>
          <div className="machine-parameter-list-heading"><Typography.Title level={5}>Parámetros</Typography.Title><Button icon={<PlusOutlined />} onClick={() => add({ scope: "GENERAL", groupName: "General", parameter: "", value: "" })}>Agregar fila</Button></div>
          <div className="machine-parameter-form-header"><span>Ámbito</span><span>Estación</span><span>Canal</span><span>Grupo</span><span>Parámetro</span><span>Valor</span><span>Unidad</span><span>Observación</span><span /></div>
          <div className="machine-parameter-form-list">{fields.map((field) => <div className="machine-parameter-form-row" key={field.key}>
            <Form.Item name={[field.name, "scope"]} rules={[{ required: true }]}><Select options={scopes} /></Form.Item>
            <Form.Item name={[field.name, "station"]}><Input placeholder="ST.1" /></Form.Item>
            <Form.Item name={[field.name, "channel"]}><Input placeholder="1C / INJ-1" /></Form.Item>
            <Form.Item name={[field.name, "groupName"]} rules={[{ required: true }]}><Input placeholder="Presión" /></Form.Item>
            <Form.Item name={[field.name, "parameter"]} rules={[{ required: true }]}><Input placeholder="Nombre" /></Form.Item>
            <Form.Item name={[field.name, "value"]} rules={[{ required: true }]}><Input placeholder="Valor" /></Form.Item>
            <Form.Item name={[field.name, "unit"]}><Input placeholder="%, °C…" /></Form.Item>
            <Form.Item name={[field.name, "notes"]}><Input placeholder="Opcional" /></Form.Item>
            <Button danger type="text" aria-label="Quitar parámetro" icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
          </div>)}</div>
        </>}</Form.List>
      </Form>
    </Modal>
  </>;
}
