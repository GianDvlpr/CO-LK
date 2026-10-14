"use client";

import { PlusOutlined, ReloadOutlined, ToolOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, DatePicker, Empty, Form, Input, InputNumber, Modal, Select, Space, Statistic, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";
import { toast } from "sonner";
import { ModuleHeadingIntro } from "@/components/common/module-heading-intro";

type Maintenance = { id: string; type: string; performedAt: string; nextDueAt?: string; provider?: string; description: string; cost: string; downtimeHours: string; notes?: string };
type Machine = { id: string; code: string; name: string; type: string; brand?: string; model?: string; serialNumber?: string; location?: string; status: string; purchaseDate?: string; notes?: string; maintenanceRecords: Maintenance[]; _count: { productionOrders: number } };
type MachineForm = { code: string; name: string; type: string; brand?: string; model?: string; serialNumber?: string; location?: string; status: string; purchaseDate?: Dayjs; notes?: string };
type MaintenanceForm = { type: string; performedAt: Dayjs; nextDueAt?: Dayjs; provider?: string; description: string; cost: number; downtimeHours: number; notes?: string; machineStatus?: string };

async function api<T>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, init); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo completar la operación."); return payload.data; }
const machineTypes: Record<string, string> = { PRESS: "Prensa", INJECTOR: "Inyectora", OTHER: "Otro equipo" };
const maintenanceTypes: Record<string, [string, string]> = { PREVENTIVE: ["Preventivo", "blue"], CORRECTIVE: ["Correctivo", "orange"], REPAIR: ["Reparación", "red"] };
const statuses: Record<string, [string, string]> = { ACTIVE: ["Operativa", "green"], MAINTENANCE: ["En mantenimiento", "gold"], OUT_OF_SERVICE: ["Fuera de servicio", "red"] };

export function MachineryWorkspace({ permissions }: { permissions: string[] }) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [maintenanceMachine, setMaintenanceMachine] = useState<Machine>();
  const [machineForm] = Form.useForm<MachineForm>();
  const [maintenanceForm] = Form.useForm<MaintenanceForm>();
  const machines = useQuery({ queryKey: ["machinery"], queryFn: () => api<{ items: Machine[] }>("/api/v1/machinery") });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["machinery"] });
  const create = useMutation({ mutationFn: (values: MachineForm) => api("/api/v1/machinery", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...values, purchaseDate: values.purchaseDate?.format("YYYY-MM-DD") }) }), onSuccess: async () => { toast.success("Máquina registrada."); setCreateOpen(false); machineForm.resetFields(); await refresh(); }, onError: (error) => toast.error(error.message) });
  const maintenance = useMutation({ mutationFn: ({ id, values }: { id: string; values: MaintenanceForm }) => api(`/api/v1/machinery/${id}/maintenance`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...values, performedAt: values.performedAt.format("YYYY-MM-DD"), nextDueAt: values.nextDueAt?.format("YYYY-MM-DD") }) }), onSuccess: async () => { toast.success("Mantenimiento registrado."); setMaintenanceMachine(undefined); maintenanceForm.resetFields(); await refresh(); }, onError: (error) => toast.error(error.message) });
  const items = machines.data?.items ?? [];
  const overdue = items.filter((machine) => machine.maintenanceRecords[0]?.nextDueAt && dayjs(machine.maintenanceRecords[0].nextDueAt).isBefore(dayjs(), "day"));
  const columns: ColumnsType<Machine> = [
    { title: "Código", dataIndex: "code", width: 120, render: (value) => <strong>{value}</strong> },
    { title: "Máquina", width: 230, render: (_, row) => <><strong>{row.name}</strong><br /><span className="table-secondary">{[row.brand, row.model].filter(Boolean).join(" · ") || "Sin marca / modelo"}</span></> },
    { title: "Tipo", dataIndex: "type", width: 130, render: (value) => machineTypes[value] ?? value },
    { title: "Ubicación", dataIndex: "location", width: 150, render: (value) => value || "—" },
    { title: "Estado", dataIndex: "status", width: 150, render: (value) => { const [label, color] = statuses[value] ?? [value, "default"]; return <Tag color={color}>{label}</Tag>; } },
    { title: "Próximo mantenimiento", width: 180, render: (_, row) => { const date = row.maintenanceRecords[0]?.nextDueAt; return date ? <Tag color={dayjs(date).isBefore(dayjs(), "day") ? "red" : "blue"}>{dayjs(date).format("DD/MM/YYYY")}</Tag> : "Sin programar"; } },
    { title: "Órdenes", width: 90, align: "right", render: (_, row) => row._count.productionOrders },
    { title: "Acciones", fixed: "right", width: 190, render: (_, row) => permissions.includes("machinery.maintenance") ? <Button size="small" icon={<ToolOutlined />} onClick={() => { setMaintenanceMachine(row); maintenanceForm.setFieldsValue({ type: "PREVENTIVE", performedAt: dayjs(), cost: 0, downtimeHours: 0, machineStatus: row.status }); }}>Registrar mantenimiento</Button> : null },
  ];
  const historyColumns: ColumnsType<Maintenance> = [
    { title: "Fecha", dataIndex: "performedAt", width: 110, render: (value) => dayjs(value).format("DD/MM/YYYY") },
    { title: "Tipo", dataIndex: "type", width: 120, render: (value) => { const [label, color] = maintenanceTypes[value] ?? [value, "default"]; return <Tag color={color}>{label}</Tag>; } },
    { title: "Descripción", dataIndex: "description" }, { title: "Proveedor", dataIndex: "provider", render: (value) => value || "—" },
    { title: "Costo", dataIndex: "cost", align: "right", render: (value) => `S/ ${Number(value).toFixed(2)}` },
    { title: "Parada", dataIndex: "downtimeHours", align: "right", render: (value) => `${Number(value).toFixed(1)} h` },
    { title: "Próxima fecha", dataIndex: "nextDueAt", width: 130, render: (value) => value ? dayjs(value).format("DD/MM/YYYY") : "—" },
  ];
  return <>
    <div className="page-heading"><ModuleHeadingIntro title="Maquinaria" eyebrow="Mantenimiento" description="Registra prensas, inyectoras y otros equipos; controla mantenimientos, reparaciones, costos y próximas fechas." /><Space wrap className="module-actions"><Button icon={<ReloadOutlined />} onClick={() => machines.refetch()}>Actualizar</Button></Space></div>
    {overdue.length ? <Alert type="warning" showIcon message={`${overdue.length} ${overdue.length === 1 ? "máquina tiene" : "máquinas tienen"} mantenimiento vencido`} description={overdue.map((item) => item.code).join(", ")} style={{ marginBottom: 18 }} /> : null}
    <div className="analytics-grid" style={{ marginBottom: 18 }}><Card><Statistic title="Máquinas registradas" value={items.length} /></Card><Card><Statistic title="Operativas" value={items.filter((item) => item.status === "ACTIVE").length} /></Card><Card><Statistic title="Mantenimientos vencidos" value={overdue.length} valueStyle={overdue.length ? { color: "#cf1322" } : undefined} /></Card></div>
    <Card className="section-card" title="Equipos registrados" extra={permissions.includes("machinery.create") ? <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>Nueva máquina</Button> : null}>
      {machines.error ? <Alert type="error" showIcon message={machines.error.message} style={{ marginBottom: 16 }} /> : null}
      <Table rowKey="id" loading={machines.isLoading} columns={columns} dataSource={items} scroll={{ x: 1250 }} expandable={{ expandedRowRender: (row) => <Table rowKey="id" size="small" pagination={false} columns={historyColumns} dataSource={row.maintenanceRecords} locale={{ emptyText: <Empty description="Sin mantenimientos registrados" /> }} /> }} locale={{ emptyText: <Empty description="Aún no hay máquinas registradas" /> }} />
    </Card>
    <Modal title="Nueva máquina" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => machineForm.submit()} okText="Registrar" confirmLoading={create.isPending} width={760} destroyOnHidden>
      <Form form={machineForm} layout="vertical" onFinish={(values) => create.mutate(values)} initialValues={{ type: "PRESS", status: "ACTIVE" }}><div className="purchase-form-grid">
        <Form.Item name="code" label="Código" rules={[{ required: true }]}><Input placeholder="MAQ-001" /></Form.Item><Form.Item name="name" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="type" label="Tipo" rules={[{ required: true }]}><Select options={[{ value: "PRESS", label: "Prensa" }, { value: "INJECTOR", label: "Inyectora" }, { value: "OTHER", label: "Otro equipo" }]} /></Form.Item><Form.Item name="status" label="Estado" rules={[{ required: true }]}><Select options={[{ value: "ACTIVE", label: "Operativa" }, { value: "MAINTENANCE", label: "En mantenimiento" }, { value: "OUT_OF_SERVICE", label: "Fuera de servicio" }]} /></Form.Item>
        <Form.Item name="brand" label="Marca"><Input /></Form.Item><Form.Item name="model" label="Modelo"><Input /></Form.Item><Form.Item name="serialNumber" label="Número de serie"><Input /></Form.Item><Form.Item name="location" label="Ubicación"><Input /></Form.Item><Form.Item name="purchaseDate" label="Fecha de compra"><DatePicker style={{ width: "100%" }} /></Form.Item>
      </div><Form.Item name="notes" label="Observaciones"><Input.TextArea rows={3} /></Form.Item></Form>
    </Modal>
    <Modal title={`Mantenimiento · ${maintenanceMachine?.name ?? "máquina"}`} open={Boolean(maintenanceMachine)} onCancel={() => setMaintenanceMachine(undefined)} onOk={() => maintenanceForm.submit()} okText="Guardar registro" confirmLoading={maintenance.isPending} width={760} destroyOnHidden>
      <Form form={maintenanceForm} layout="vertical" onFinish={(values) => maintenanceMachine && maintenance.mutate({ id: maintenanceMachine.id, values })}><div className="purchase-form-grid">
        <Form.Item name="type" label="Tipo" rules={[{ required: true }]}><Select options={[{ value: "PREVENTIVE", label: "Preventivo" }, { value: "CORRECTIVE", label: "Correctivo" }, { value: "REPAIR", label: "Reparación" }]} /></Form.Item><Form.Item name="performedAt" label="Fecha realizada" rules={[{ required: true }]}><DatePicker style={{ width: "100%" }} /></Form.Item>
        <Form.Item name="nextDueAt" label="Próxima fecha"><DatePicker style={{ width: "100%" }} /></Form.Item><Form.Item name="provider" label="Técnico / proveedor"><Input /></Form.Item>
        <Form.Item name="cost" label="Costo (PEN)" rules={[{ required: true }]}><InputNumber min={0} precision={2} prefix="S/" style={{ width: "100%" }} /></Form.Item><Form.Item name="downtimeHours" label="Horas fuera de servicio" rules={[{ required: true }]}><InputNumber min={0} precision={1} style={{ width: "100%" }} /></Form.Item>
        <Form.Item name="machineStatus" label="Estado resultante"><Select options={[{ value: "ACTIVE", label: "Operativa" }, { value: "MAINTENANCE", label: "En mantenimiento" }, { value: "OUT_OF_SERVICE", label: "Fuera de servicio" }]} /></Form.Item>
      </div><Form.Item name="description" label="Trabajo realizado" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item><Form.Item name="notes" label="Observaciones"><Input.TextArea rows={2} /></Form.Item></Form>
    </Modal>
  </>;
}
