"use client";

import {
  AppstoreOutlined,
  BarsOutlined,
  CalendarOutlined,
  EditOutlined,
  EnvironmentOutlined,
  HistoryOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Segmented,
  Select,
  Space,
  Statistic,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ModuleHeadingIntro } from "@/components/common/module-heading-intro";
import { ResponsiveTable as Table } from "@/components/common/responsive-table";

type Maintenance = { id: string; type: string; performedAt: string; nextDueAt?: string; provider?: string; description: string; cost: string; downtimeHours: string; notes?: string };
type Machine = { id: string; code: string; name: string; type: string; brand?: string; model?: string; serialNumber?: string; location?: string; status: string; purchaseDate?: string; notes?: string; maintenanceRecords: Maintenance[]; _count: { productionOrders: number } };
type MachineForm = { name: string; type: string; brand?: string; model?: string; serialNumber?: string; location?: string; status: string; purchaseDate?: Dayjs; notes?: string };
type MaintenanceForm = { type: string; performedAt: Dayjs; nextDueAt?: Dayjs; provider?: string; description: string; cost: number; downtimeHours: number; notes?: string; machineStatus?: string };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo completar la operación.");
  return payload.data;
}

const machineTypes: Record<string, string> = { PRESS: "Prensa", INJECTOR: "Inyectora", OTHER: "Otro equipo" };
const maintenanceTypes: Record<string, [string, string]> = { PREVENTIVE: ["Preventivo", "blue"], CORRECTIVE: ["Correctivo", "orange"], REPAIR: ["Reparación", "red"] };
const statuses: Record<string, [string, string]> = { ACTIVE: ["Operativa", "green"], MAINTENANCE: ["En mantenimiento", "gold"], OUT_OF_SERVICE: ["Fuera de servicio", "red"] };

function nextMaintenance(machine: Machine) {
  return machine.maintenanceRecords[0]?.nextDueAt;
}

export function MachineryWorkspace({ permissions }: { permissions: string[] }) {
  const queryClient = useQueryClient();
  const [machineOpen, setMachineOpen] = useState(false);
  const [editingMachine, setEditingMachine] = useState<Machine>();
  const [maintenanceMachine, setMaintenanceMachine] = useState<Machine>();
  const [historyMachine, setHistoryMachine] = useState<Machine>();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [page, setPage] = useState(1);
  const [machineForm] = Form.useForm<MachineForm>();
  const [maintenanceForm] = Form.useForm<MaintenanceForm>();
  const machines = useQuery({ queryKey: ["machinery"], queryFn: () => api<{ items: Machine[] }>("/api/v1/machinery") });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["machinery"] });
  const saveMachine = useMutation({
    mutationFn: ({ id, values }: { id?: string; values: MachineForm }) => api(id ? `/api/v1/machinery/${id}` : "/api/v1/machinery", {
      method: id ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...values, purchaseDate: values.purchaseDate?.format("YYYY-MM-DD") }),
    }),
    onSuccess: async (_, variables) => {
      toast.success(variables.id ? "Máquina actualizada." : "Máquina registrada.");
      setMachineOpen(false);
      setEditingMachine(undefined);
      machineForm.resetFields();
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const maintenance = useMutation({
    mutationFn: ({ id, values }: { id: string; values: MaintenanceForm }) => api(`/api/v1/machinery/${id}/maintenance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...values, performedAt: values.performedAt.format("YYYY-MM-DD"), nextDueAt: values.nextDueAt?.format("YYYY-MM-DD") }),
    }),
    onSuccess: async () => {
      toast.success("Mantenimiento registrado.");
      setMaintenanceMachine(undefined);
      maintenanceForm.resetFields();
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const items = useMemo(() => machines.data?.items ?? [], [machines.data?.items]);
  const overdue = items.filter((machine) => {
    const due = nextMaintenance(machine);
    return due && dayjs(due).isBefore(dayjs(), "day");
  });
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("es");
    return items.filter((machine) => {
      const matchesText = !needle || [machine.code, machine.name, machine.brand, machine.model, machine.location, machine.serialNumber]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase("es").includes(needle));
      return matchesText && (typeFilter === "ALL" || machine.type === typeFilter) && (statusFilter === "ALL" || machine.status === statusFilter);
    });
  }, [items, search, typeFilter, statusFilter]);
  const pageSize = 9;
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);
  const selectedHistoryMachine = items.find((machine) => machine.id === historyMachine?.id) ?? historyMachine;

  const openCreate = () => {
    setEditingMachine(undefined);
    machineForm.resetFields();
    machineForm.setFieldsValue({ type: "PRESS", status: "ACTIVE" });
    setMachineOpen(true);
  };
  const openEdit = (machine: Machine) => {
    setEditingMachine(machine);
    machineForm.setFieldsValue({
      name: machine.name,
      type: machine.type,
      brand: machine.brand,
      model: machine.model,
      serialNumber: machine.serialNumber,
      location: machine.location,
      status: machine.status,
      purchaseDate: machine.purchaseDate ? dayjs(machine.purchaseDate) : undefined,
      notes: machine.notes,
    });
    setMachineOpen(true);
  };
  const openMaintenance = (machine: Machine) => {
    setMaintenanceMachine(machine);
    maintenanceForm.setFieldsValue({ type: "PREVENTIVE", performedAt: dayjs(), cost: 0, downtimeHours: 0, machineStatus: machine.status });
  };
  const updateFilter = (setter: (value: string) => void, value: string) => { setter(value); setPage(1); };

  const columns: ColumnsType<Machine> = [
    { title: "Código", dataIndex: "code", width: 120, render: (value) => <strong>{value}</strong> },
    { title: "Máquina", width: 230, render: (_, row) => <><strong>{row.name}</strong><br /><span className="table-secondary">{[row.brand, row.model].filter(Boolean).join(" · ") || "Sin marca / modelo"}</span></> },
    { title: "Tipo", dataIndex: "type", width: 130, render: (value) => machineTypes[value] ?? value },
    { title: "Ubicación", dataIndex: "location", width: 150, render: (value) => value || "—" },
    { title: "Estado", dataIndex: "status", width: 150, render: (value) => { const [label, color] = statuses[value] ?? [value, "default"]; return <Tag color={color}>{label}</Tag>; } },
    { title: "Próximo mantenimiento", width: 180, render: (_, row) => { const due = nextMaintenance(row); return due ? <Tag color={dayjs(due).isBefore(dayjs(), "day") ? "red" : "blue"}>{dayjs(due).format("DD/MM/YYYY")}</Tag> : "Sin programar"; } },
    { title: "Órdenes", width: 90, align: "right", render: (_, row) => row._count.productionOrders },
    { title: "Acciones", fixed: "right", width: 300, render: (_, row) => <Space wrap>
      {permissions.includes("machinery.create") ? <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>Editar</Button> : null}
      {permissions.includes("machinery.maintenance") ? <Button size="small" icon={<ToolOutlined />} onClick={() => openMaintenance(row)}>Mantenimiento</Button> : null}
      <Button size="small" icon={<HistoryOutlined />} onClick={() => setHistoryMachine(row)}>Historial</Button>
    </Space> },
  ];
  const historyColumns: ColumnsType<Maintenance> = [
    { title: "Fecha", dataIndex: "performedAt", width: 110, render: (value) => dayjs(value).format("DD/MM/YYYY") },
    { title: "Tipo", dataIndex: "type", width: 120, render: (value) => { const [label, color] = maintenanceTypes[value] ?? [value, "default"]; return <Tag color={color}>{label}</Tag>; } },
    { title: "Descripción", dataIndex: "description", width: 240 },
    { title: "Proveedor", dataIndex: "provider", width: 150, render: (value) => value || "—" },
    { title: "Costo", dataIndex: "cost", width: 110, align: "right", render: (value) => `S/ ${Number(value).toFixed(2)}` },
    { title: "Parada", dataIndex: "downtimeHours", width: 90, align: "right", render: (value) => `${Number(value).toFixed(1)} h` },
    { title: "Próxima fecha", dataIndex: "nextDueAt", width: 130, render: (value) => value ? dayjs(value).format("DD/MM/YYYY") : "—" },
  ];

  return <>
    <div className="page-heading"><ModuleHeadingIntro title="Maquinaria" eyebrow="Mantenimiento" description="Registra prensas, inyectoras y otros equipos; controla mantenimientos, reparaciones, costos y próximas fechas." /><Space wrap className="module-actions"><Button icon={<ReloadOutlined />} onClick={() => machines.refetch()}>Actualizar</Button></Space></div>
    {overdue.length ? <Alert type="warning" showIcon message={`${overdue.length} ${overdue.length === 1 ? "máquina tiene" : "máquinas tienen"} mantenimiento vencido`} description={overdue.map((item) => item.code).join(", ")} style={{ marginBottom: 16 }} /> : null}
    <div className="machinery-metrics">
      <Card size="small"><Statistic title="Registradas" value={items.length} /></Card>
      <Card size="small"><Statistic title="Operativas" value={items.filter((item) => item.status === "ACTIVE").length} /></Card>
      <Card size="small"><Statistic title="En mantenimiento" value={items.filter((item) => item.status === "MAINTENANCE").length} /></Card>
      <Card size="small"><Statistic title="Mantenimiento vencido" value={overdue.length} valueStyle={overdue.length ? { color: "#cf1322" } : undefined} /></Card>
    </div>
    <Card className="section-card" title="Equipos registrados" extra={permissions.includes("machinery.create") ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Nueva máquina</Button> : null}>
      {machines.error ? <Alert type="error" showIcon message={machines.error.message} style={{ marginBottom: 16 }} /> : null}
      <div className="machinery-toolbar">
        <Input allowClear prefix={<SearchOutlined />} placeholder="Buscar por código, nombre, marca o ubicación" value={search} onChange={(event) => updateFilter(setSearch, event.target.value)} />
        <Select value={typeFilter} onChange={(value) => updateFilter(setTypeFilter, value)} options={[{ value: "ALL", label: "Todos los tipos" }, { value: "PRESS", label: "Prensas" }, { value: "INJECTOR", label: "Inyectoras" }, { value: "OTHER", label: "Otros equipos" }]} />
        <Select value={statusFilter} onChange={(value) => updateFilter(setStatusFilter, value)} options={[{ value: "ALL", label: "Todos los estados" }, { value: "ACTIVE", label: "Operativas" }, { value: "MAINTENANCE", label: "En mantenimiento" }, { value: "OUT_OF_SERVICE", label: "Fuera de servicio" }]} />
        <Segmented value={viewMode} onChange={(value) => setViewMode(value as "cards" | "table")} options={[{ value: "cards", icon: <AppstoreOutlined />, label: "Tarjetas" }, { value: "table", icon: <BarsOutlined />, label: "Tabla" }]} />
      </div>
      {viewMode === "cards" ? <>
        {machines.isLoading ? <div className="machinery-empty"><Typography.Text type="secondary">Cargando equipos…</Typography.Text></div> : paginated.length ? <div className="machinery-grid">{paginated.map((machine) => {
          const [statusLabel, statusColor] = statuses[machine.status] ?? [machine.status, "default"];
          const due = nextMaintenance(machine);
          const dueOverdue = due && dayjs(due).isBefore(dayjs(), "day");
          return <Card key={machine.id} size="small" className="machine-card">
            <div className="machine-card-head"><Typography.Text className="machine-card-code">{machine.code}</Typography.Text><Tag color={statusColor}>{statusLabel}</Tag></div>
            <Typography.Title level={4} className="machine-card-title">{machine.name}</Typography.Title>
            <Typography.Text type="secondary">{[machineTypes[machine.type], machine.brand, machine.model].filter(Boolean).join(" · ")}</Typography.Text>
            <div className="machine-card-details">
              <div><EnvironmentOutlined /><span>{machine.location || "Sin ubicación"}</span></div>
              <div><ToolOutlined /><span>{machine._count.productionOrders} órdenes de producción</span></div>
              <div><CalendarOutlined /><span className={dueOverdue ? "machine-due-overdue" : undefined}>{due ? `Próximo mantenimiento: ${dayjs(due).format("DD/MM/YYYY")}` : "Mantenimiento sin programar"}</span></div>
            </div>
            <div className="machine-card-footer">
              {permissions.includes("machinery.create") ? <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(machine)}>Editar</Button> : null}
              {permissions.includes("machinery.maintenance") ? <Button size="small" icon={<ToolOutlined />} onClick={() => openMaintenance(machine)}>Mantenimiento</Button> : null}
              <Button size="small" type="text" icon={<HistoryOutlined />} onClick={() => setHistoryMachine(machine)}>Historial</Button>
            </div>
          </Card>;
        })}</div> : <div className="machinery-empty"><Empty description="No hay equipos que coincidan con los filtros" /></div>}
        {filtered.length > pageSize ? <Pagination className="machinery-pagination" current={page} pageSize={pageSize} total={filtered.length} showSizeChanger={false} onChange={setPage} /> : null}
      </> : <Table rowKey="id" loading={machines.isLoading} columns={columns} dataSource={filtered} scroll={{ x: 1320 }} pagination={{ pageSize: 15 }} locale={{ emptyText: <Empty description="No hay equipos que coincidan con los filtros" /> }} />}
    </Card>

    <Drawer title={selectedHistoryMachine ? `${selectedHistoryMachine.code} · ${selectedHistoryMachine.name}` : "Historial de mantenimiento"} open={Boolean(historyMachine)} onClose={() => setHistoryMachine(undefined)} width="min(880px, 100vw)" extra={selectedHistoryMachine && permissions.includes("machinery.maintenance") ? <Button type="primary" icon={<ToolOutlined />} onClick={() => openMaintenance(selectedHistoryMachine)}>Registrar mantenimiento</Button> : null}>
      {selectedHistoryMachine ? <div className="machine-history-summary"><Tag color={(statuses[selectedHistoryMachine.status] ?? ["", "default"])[1]}>{(statuses[selectedHistoryMachine.status] ?? [selectedHistoryMachine.status])[0]}</Tag><Typography.Text>{machineTypes[selectedHistoryMachine.type] ?? selectedHistoryMachine.type}</Typography.Text><Typography.Text type="secondary">{selectedHistoryMachine.location || "Sin ubicación"}</Typography.Text></div> : null}
      <Table rowKey="id" size="small" pagination={{ pageSize: 8 }} columns={historyColumns} dataSource={selectedHistoryMachine?.maintenanceRecords ?? []} scroll={{ x: 950 }} locale={{ emptyText: <Empty description="Sin mantenimientos registrados" /> }} />
    </Drawer>

    <Modal title={editingMachine ? `Editar ${editingMachine.code}` : "Nueva máquina"} open={machineOpen} onCancel={() => { setMachineOpen(false); setEditingMachine(undefined); }} onOk={() => machineForm.submit()} okText={editingMachine ? "Guardar cambios" : "Registrar"} confirmLoading={saveMachine.isPending} width={760} destroyOnHidden>
      <Form form={machineForm} layout="vertical" onFinish={(values) => saveMachine.mutate({ id: editingMachine?.id, values })} initialValues={{ type: "PRESS", status: "ACTIVE" }}><div className="purchase-form-grid">
        <Form.Item label="Código"><Input disabled value={editingMachine?.code ?? "Se generará automáticamente al guardar"} /></Form.Item><Form.Item name="name" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
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
