"use client";

import {
  CalendarOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  LeftOutlined,
  LinkOutlined,
  PlusOutlined,
  RightOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Calendar,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Grid,
  Input,
  Modal,
  Segmented,
  Select,
  Space,
  Statistic,
  Switch,
  Tag,
  Typography,
} from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import "dayjs/locale/es";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ModuleHeadingIntro } from "@/components/common/module-heading-intro";
import { CalendarTaskKanban } from "@/components/calendar/calendar-task-kanban";

dayjs.locale("es");

type CalendarView = "month" | "week" | "day" | "agenda" | "board";
export type CalendarEvent = {
  id: string;
  manualId?: string;
  source: "MANUAL" | "ORDERS" | "PRODUCTION" | "PICK_PACK" | "MAINTENANCE";
  kind: string;
  title: string;
  subtitle: string;
  startAt: string;
  endAt?: string | null;
  allDay: boolean;
  status: string;
  priority: string;
  href?: string | null;
  warehouseId?: string | null;
  warehouse?: string | null;
  machineId?: string | null;
  machine?: string | null;
  description?: string | null;
  reminderMinutes?: number | null;
  createdBy?: { name: string; username: string };
};
type CalendarResponse = {
  items: CalendarEvent[];
  summary: { overdue: number; today: number; nextWeek: number; maintenance: number };
  filters: { warehouses: { id: string; name: string }[]; machines: { id: string; name: string }[] };
};
type EventForm = {
  title: string;
  type: "INVENTORY" | "MEETING" | "TASK" | "OTHER";
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  startAt: Dayjs;
  endAt?: Dayjs;
  allDay: boolean;
  description?: string;
  reminderMinutes?: number;
};

const sourceMeta = {
  MANUAL: { label: "Evento manual", color: "#64748b" },
  ORDERS: { label: "Pedidos", color: "#2563eb" },
  PRODUCTION: { label: "Producción", color: "#7c3aed" },
  PICK_PACK: { label: "Pick & Pack", color: "#0891b2" },
  MAINTENANCE: { label: "Mantenimiento", color: "#ea580c" },
} as const;

const statusLabels: Record<string, string> = {
  PENDING: "Pendiente", COMPLETED: "Completado", CANCELLED: "Cancelado", DRAFT: "Borrador", CONFIRMED: "Confirmado",
  IN_PRODUCTION: "En producción", READY: "Listo", DISPATCHED: "Despachado", RELEASED: "Liberada", IN_PROGRESS: "En proceso",
  PICKING: "Picking", PACKING: "Packing", ACTIVE: "Activo", MAINTENANCE: "En mantenimiento", OUT_OF_SERVICE: "Fuera de servicio",
};

const reminderOptions = [
  { value: 0, label: "Al iniciar" }, { value: 60, label: "1 hora antes" }, { value: 1_440, label: "1 día antes" },
  { value: 4_320, label: "3 días antes" }, { value: 10_080, label: "7 días antes" },
];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo completar la operación.");
  return payload.data;
}

function isFinished(event: CalendarEvent) {
  return ["COMPLETED", "DISPATCHED", "CANCELLED"].includes(event.status);
}

function isActionable(event: CalendarEvent) {
  return !(event.source === "ORDERS" && event.kind === "REQUESTED") && !isFinished(event);
}

function isOverdue(event: CalendarEvent) {
  return isActionable(event) && dayjs(event.startAt).isBefore(dayjs().startOf("day"));
}

function serialize(values: EventForm) {
  const startAt = values.allDay ? values.startAt.startOf("day") : values.startAt;
  const endAt = values.endAt ? (values.allDay ? values.endAt.endOf("day") : values.endAt) : undefined;
  return { ...values, startAt: startAt.toISOString(), endAt: endAt?.toISOString(), reminderMinutes: values.reminderMinutes ?? null };
}

function EventCard({ event, compact = false, onOpen }: { event: CalendarEvent; compact?: boolean; onOpen: (event: CalendarEvent) => void }) {
  const meta = sourceMeta[event.source];
  return <button type="button" className={`calendar-event-card${compact ? " compact" : ""}${isOverdue(event) ? " overdue" : ""}`} style={{ "--event-color": meta.color } as React.CSSProperties} onClick={(click) => { click.stopPropagation(); onOpen(event); }}>
    <span className="calendar-event-time">{event.allDay ? "Todo el día" : dayjs(event.startAt).format("HH:mm")}</span>
    <strong>{event.title}</strong>
    {!compact ? <span>{event.subtitle}</span> : null}
  </button>;
}

export function CalendarWorkspace({ permissions }: { permissions: string[] }) {
  const queryClient = useQueryClient();
  const screens = Grid.useBreakpoint();
  const [view, setView] = useState<CalendarView>("month");
  const [anchor, setAnchor] = useState(dayjs());
  const [selectedDay, setSelectedDay] = useState(dayjs());
  const [sources, setSources] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>();
  const [warehouseId, setWarehouseId] = useState<string>();
  const [machineId, setMachineId] = useState<string>();
  const [selected, setSelected] = useState<CalendarEvent>();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent>();
  const [form] = Form.useForm<EventForm>();
  const allDay = Form.useWatch("allDay", form);

  const activeView: CalendarView = screens.md === false && view === "month" ? "agenda" : view;

  const range = useMemo(() => {
    if (activeView === "day") return { from: anchor.startOf("day"), to: anchor.endOf("day") };
    if (activeView === "week") return { from: anchor.startOf("week"), to: anchor.endOf("week") };
    return { from: anchor.startOf("month").startOf("week"), to: anchor.endOf("month").endOf("week") };
  }, [activeView, anchor]);

  const calendar = useQuery({
    queryKey: ["calendar", range.from.toISOString(), range.to.toISOString()],
    queryFn: () => api<CalendarResponse>(`/api/v1/calendar?from=${encodeURIComponent(range.from.toISOString())}&to=${encodeURIComponent(range.to.toISOString())}`),
    refetchInterval: 60_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["calendar"] });
  const create = useMutation({ mutationFn: (values: EventForm) => api("/api/v1/calendar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(serialize(values)) }), onSuccess: async () => { toast.success("Evento agregado al calendario."); setFormOpen(false); form.resetFields(); await refresh(); }, onError: (error) => toast.error(error.message) });
  const update = useMutation({ mutationFn: ({ id, values }: { id: string; values: EventForm }) => api(`/api/v1/calendar/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(serialize(values)) }), onSuccess: async () => { toast.success("Evento actualizado."); setFormOpen(false); setSelected(undefined); setEditing(undefined); form.resetFields(); await refresh(); }, onError: (error) => toast.error(error.message) });
  const remove = useMutation({ mutationFn: (id: string) => api(`/api/v1/calendar/${id}`, { method: "DELETE" }), onSuccess: async () => { toast.success("Evento eliminado."); setSelected(undefined); await refresh(); }, onError: (error) => toast.error(error.message) });

  const events = useMemo(() => (calendar.data?.items ?? []).filter((event) => {
    if (sources.length && !sources.includes(event.source)) return false;
    if (warehouseId && event.warehouseId !== warehouseId) return false;
    if (machineId && event.machineId !== machineId) return false;
    if (statusFilter === "OVERDUE" && !isOverdue(event)) return false;
    if (statusFilter === "PENDING" && (!isActionable(event) || isOverdue(event))) return false;
    if (statusFilter === "COMPLETED" && !["COMPLETED", "DISPATCHED"].includes(event.status)) return false;
    if (statusFilter === "CANCELLED" && event.status !== "CANCELLED") return false;
    return true;
  }), [calendar.data, machineId, sources, statusFilter, warehouseId]);

  const metrics = calendar.data?.summary ?? { overdue: 0, today: 0, nextWeek: 0, maintenance: 0 };

  const openCreate = (date = dayjs()) => {
    setEditing(undefined);
    form.resetFields();
    form.setFieldsValue({ title: "", type: "TASK", priority: "NORMAL", status: "PENDING", allDay: true, startAt: date.startOf("day"), reminderMinutes: 1_440 });
    setFormOpen(true);
  };

  const openEdit = (event: CalendarEvent) => {
    if (!event.manualId) return;
    setEditing(event);
    form.setFieldsValue({ title: event.title, type: event.kind as EventForm["type"], priority: event.priority as EventForm["priority"], status: event.status as EventForm["status"], allDay: event.allDay, startAt: dayjs(event.startAt), endAt: event.endAt ? dayjs(event.endAt) : undefined, description: event.description ?? undefined, reminderMinutes: event.reminderMinutes ?? undefined });
    setSelected(undefined);
    setFormOpen(true);
  };

  const moveTask = (event: CalendarEvent, status: EventForm["status"]) => {
    if (!event.manualId || !permissions.includes("calendar.update")) return toast.error("No tienes permiso para cambiar el estado de esta tarea.");
    update.mutate({ id: event.manualId, values: { title: event.title, type: event.kind as EventForm["type"], priority: event.priority as EventForm["priority"], status, allDay: event.allDay, startAt: dayjs(event.startAt), endAt: event.endAt ? dayjs(event.endAt) : undefined, description: event.description ?? undefined, reminderMinutes: event.reminderMinutes ?? undefined } });
  };

  const step = (direction: number) => setAnchor((current) => current.add(direction, activeView === "day" ? "day" : activeView === "week" ? "week" : "month"));
  const periodLabel = activeView === "day" ? anchor.format("dddd D [de] MMMM") : activeView === "week" ? `${range.from.format("D MMM")} – ${range.to.format("D MMM YYYY")}` : anchor.format("MMMM [de] YYYY");
  const dayEvents = (date: Dayjs) => events.filter((event) => dayjs(event.startAt).isSame(date, "day"));
  const agendaGroups = [...new Set(events.map((event) => dayjs(event.startAt).format("YYYY-MM-DD")))].sort();
  const weekDays = Array.from({ length: 7 }, (_, index) => range.from.add(index, "day"));

  return <>
    <div className="page-heading">
      <ModuleHeadingIntro title="Calendario operativo" eyebrow="Fechas y compromisos" description="Reúne pedidos, producción, preparación, mantenimiento y actividades internas en una sola agenda." />
      <Space wrap className="module-actions">{permissions.includes("calendar.create") ? <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate(selectedDay)}>Nuevo evento</Button> : null}</Space>
    </div>

    <div className="calendar-metrics">
      <Card><Statistic title="Vencidos" value={metrics.overdue} prefix={<ExclamationCircleOutlined />} valueStyle={{ color: metrics.overdue ? "#dc2626" : undefined }} /></Card>
      <Card><Statistic title="Para hoy" value={metrics.today} prefix={<ClockCircleOutlined />} /></Card>
      <Card><Statistic title="Próximos 7 días" value={metrics.nextWeek} prefix={<CalendarOutlined />} /></Card>
      <Card><Statistic title="Mantenimientos" value={metrics.maintenance} prefix={<ToolOutlined />} /></Card>
    </div>

    <Card className="section-card calendar-toolbar-card">
      <div className="calendar-toolbar">
        <Space><Button aria-label="Periodo anterior" icon={<LeftOutlined />} onClick={() => step(-1)} /><Button onClick={() => { setAnchor(dayjs()); setSelectedDay(dayjs()); }}>Hoy</Button><Button aria-label="Periodo siguiente" icon={<RightOutlined />} onClick={() => step(1)} /></Space>
        <Typography.Title level={4}>{periodLabel}</Typography.Title>
        <Segmented value={activeView} onChange={(value) => setView(value as CalendarView)} options={(screens.md === false ? [{ label: "Día", value: "day" }, { label: "Agenda", value: "agenda" }, { label: "Tareas", value: "board" }] : [{ label: "Mes", value: "month" }, { label: "Semana", value: "week" }, { label: "Día", value: "day" }, { label: "Agenda", value: "agenda" }, { label: "Tareas", value: "board" }])} />
      </div>
      <div className="calendar-filters">
        <Select mode="multiple" allowClear maxTagCount="responsive" placeholder="Módulos" value={sources} onChange={setSources} options={Object.entries(sourceMeta).map(([value, meta]) => ({ value, label: meta.label }))} />
        <Select allowClear placeholder="Estado" value={statusFilter} onChange={setStatusFilter} options={[{ value: "PENDING", label: "Pendientes" }, { value: "OVERDUE", label: "Vencidos" }, { value: "COMPLETED", label: "Completados" }, { value: "CANCELLED", label: "Cancelados" }]} />
        <Select allowClear showSearch optionFilterProp="label" placeholder="Almacén" value={warehouseId} onChange={setWarehouseId} options={calendar.data?.filters.warehouses.map((item) => ({ value: item.id, label: item.name }))} />
        <Select allowClear showSearch optionFilterProp="label" placeholder="Máquina" value={machineId} onChange={setMachineId} options={calendar.data?.filters.machines.map((item) => ({ value: item.id, label: item.name }))} />
      </div>
    </Card>

    {calendar.error ? <Alert type="error" showIcon message={calendar.error.message} style={{ marginBottom: 16 }} /> : null}

    {activeView === "month" ? <Card className="section-card calendar-month-card" loading={calendar.isLoading}>
      <Calendar value={anchor} headerRender={() => null} onSelect={(date) => { setAnchor(date); setSelectedDay(date); }} cellRender={(date, info) => info.type === "date" ? <div className="calendar-cell-events">{dayEvents(date).slice(0, 3).map((event) => <EventCard key={event.id} event={event} compact onOpen={setSelected} />)}{dayEvents(date).length > 3 ? <span className="calendar-more">+{dayEvents(date).length - 3} más</span> : null}</div> : info.originNode} />
      <div className="calendar-selected-day"><Typography.Title level={5}>Agenda del {selectedDay.format("D [de] MMMM")}</Typography.Title>{dayEvents(selectedDay).length ? <div className="calendar-agenda-list">{dayEvents(selectedDay).map((event) => <EventCard key={event.id} event={event} onOpen={setSelected} />)}</div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sin actividades para este día" />}</div>
    </Card> : null}

    {activeView === "week" ? <Card className="section-card calendar-week-card" loading={calendar.isLoading}><div className="calendar-week-grid">{weekDays.map((date) => <section key={date.format("YYYY-MM-DD")} className={date.isSame(dayjs(), "day") ? "today" : ""}><header><span>{date.format("ddd")}</span><strong>{date.format("D")}</strong></header><div>{dayEvents(date).map((event) => <EventCard key={event.id} event={event} onOpen={setSelected} />)}{!dayEvents(date).length ? <small>Sin eventos</small> : null}</div></section>)}</div></Card> : null}

    {activeView === "day" ? <Card className="section-card" loading={calendar.isLoading} title={anchor.format("dddd D [de] MMMM")}>{events.length ? <div className="calendar-agenda-list">{events.map((event) => <EventCard key={event.id} event={event} onOpen={setSelected} />)}</div> : <Empty description="Sin actividades para este día" />}</Card> : null}

    {activeView === "agenda" ? <Card className="section-card" loading={calendar.isLoading} title="Agenda del periodo">{agendaGroups.length ? <div className="calendar-agenda-groups">{agendaGroups.map((group) => <section key={group}><header><strong>{dayjs(group).format("dddd D")}</strong><span>{dayjs(group).format("MMMM YYYY")}</span></header><div className="calendar-agenda-list">{events.filter((event) => dayjs(event.startAt).format("YYYY-MM-DD") === group).map((event) => <EventCard key={event.id} event={event} onOpen={setSelected} />)}</div></section>)}</div> : <Empty description="No hay eventos para los filtros seleccionados" />}</Card> : null}

    {activeView === "board" ? <Card className="section-card task-board-card" loading={calendar.isLoading} title="Tablero de tareas del periodo"><CalendarTaskKanban events={events.filter((event) => event.source === "MANUAL")} onMove={moveTask} /></Card> : null}

    <Drawer title={selected?.title} open={Boolean(selected)} onClose={() => setSelected(undefined)} width={460} extra={selected?.manualId ? <Space>{permissions.includes("calendar.update") ? <Button icon={<EditOutlined />} onClick={() => openEdit(selected)}>Editar</Button> : null}{permissions.includes("calendar.delete") ? <Button danger icon={<DeleteOutlined />} onClick={() => Modal.confirm({ title: "¿Eliminar evento?", content: "Esta acción quitará el evento y su recordatorio pendiente.", okText: "Eliminar", okButtonProps: { danger: true }, onOk: () => remove.mutateAsync(selected.manualId!) })}>Eliminar</Button> : null}</Space> : selected?.href ? <Button type="primary" icon={<LinkOutlined />} href={selected.href}>Abrir módulo</Button> : null}>
      {selected ? <><Space wrap style={{ marginBottom: 18 }}><Tag color={sourceMeta[selected.source].color}>{sourceMeta[selected.source].label}</Tag><Tag>{statusLabels[selected.status] ?? selected.status}</Tag>{isOverdue(selected) ? <Tag color="red">Vencido</Tag> : null}</Space><Descriptions column={1} bordered size="small" items={[{ key: "date", label: "Fecha", children: selected.allDay ? dayjs(selected.startAt).format("DD/MM/YYYY") : dayjs(selected.startAt).format("DD/MM/YYYY HH:mm") }, { key: "detail", label: "Detalle", children: selected.subtitle }, ...(selected.warehouse ? [{ key: "warehouse", label: "Almacén", children: selected.warehouse }] : []), ...(selected.machine ? [{ key: "machine", label: "Máquina", children: selected.machine }] : []), ...(selected.reminderMinutes !== undefined && selected.reminderMinutes !== null ? [{ key: "reminder", label: "Recordatorio", children: reminderOptions.find((item) => item.value === selected.reminderMinutes)?.label ?? `${selected.reminderMinutes} minutos antes` }] : []), ...(selected.createdBy ? [{ key: "createdBy", label: "Creado por", children: `${selected.createdBy.name} · @${selected.createdBy.username}` }] : [])]} />{selected.description ? <Typography.Paragraph style={{ marginTop: 18 }}>{selected.description}</Typography.Paragraph> : null}</> : null}
    </Drawer>

    <Modal title={editing ? "Editar evento" : "Nuevo evento"} open={formOpen} onCancel={() => { setFormOpen(false); setEditing(undefined); }} onOk={() => form.submit()} okText={editing ? "Guardar" : "Crear evento"} confirmLoading={create.isPending || update.isPending} width={720} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(values) => editing?.manualId ? update.mutate({ id: editing.manualId, values }) : create.mutate(values)}>
        <Form.Item name="title" label="Título" rules={[{ required: true, message: "Ingresa el título." }]}><Input maxLength={180} /></Form.Item>
        <div className="purchase-form-grid">
          <Form.Item name="type" label="Tipo" rules={[{ required: true }]}><Select options={[{ value: "TASK", label: "Tarea" }, { value: "INVENTORY", label: "Inventario físico" }, { value: "MEETING", label: "Reunión" }, { value: "OTHER", label: "Otro" }]} /></Form.Item>
          <Form.Item name="priority" label="Prioridad" rules={[{ required: true }]}><Select options={[{ value: "LOW", label: "Baja" }, { value: "NORMAL", label: "Normal" }, { value: "HIGH", label: "Alta" }, { value: "URGENT", label: "Urgente" }]} /></Form.Item>
          {editing ? <Form.Item name="status" label="Estado" rules={[{ required: true }]}><Select options={[{ value: "PENDING", label: "Pendiente" }, { value: "COMPLETED", label: "Completado" }, { value: "CANCELLED", label: "Cancelado" }]} /></Form.Item> : <Form.Item name="status" hidden><Input /></Form.Item>}
          <Form.Item name="allDay" label="Todo el día" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="startAt" label="Inicio" rules={[{ required: true, message: "Selecciona la fecha de inicio." }]}><DatePicker showTime={!allDay} format={allDay ? "DD/MM/YYYY" : "DD/MM/YYYY HH:mm"} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="endAt" label="Fin (opcional)"><DatePicker showTime={!allDay} format={allDay ? "DD/MM/YYYY" : "DD/MM/YYYY HH:mm"} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="reminderMinutes" label="Recordatorio"><Select allowClear placeholder="Sin recordatorio" options={reminderOptions} /></Form.Item>
        </div>
        <Form.Item name="description" label="Descripción"><Input.TextArea rows={4} maxLength={1_000} showCount /></Form.Item>
      </Form>
    </Modal>
  </>;
}
