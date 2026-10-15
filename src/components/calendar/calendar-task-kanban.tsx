"use client";

import { DragOutlined } from "@ant-design/icons";
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { Empty, Tag } from "antd";
import dayjs from "dayjs";
import { useState } from "react";
import type { CalendarEvent } from "@/components/calendar/calendar-workspace";

const columns = [
  { status: "PENDING", label: "Pendiente", color: "#2563eb" },
  { status: "COMPLETED", label: "Finalizado", color: "#15803d" },
  { status: "CANCELLED", label: "Cancelado", color: "#64748b" },
] as const;

const priorities: Record<string, [string, string]> = { LOW: ["Baja", "default"], NORMAL: ["Normal", "blue"], HIGH: ["Alta", "orange"], URGENT: ["Urgente", "red"] };

function TaskCard({ event }: { event: CalendarEvent }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({ id: event.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const [priority, color] = priorities[event.priority] ?? [event.priority, "default"];
  return <article ref={setNodeRef} style={style} className={`task-kanban-card${isDragging ? " dragging" : ""}`}>
    <div><Tag color={color}>{priority}</Tag><button ref={setActivatorNodeRef} type="button" className="kanban-drag-handle" aria-label={`Mover ${event.title}`} title="Mantén presionado y arrastra" {...attributes} {...listeners}><DragOutlined aria-hidden /></button></div>
    <strong>{event.title}</strong>
    <span>{event.subtitle || "Sin descripción"}</span>
    <small>{event.allDay ? dayjs(event.startAt).format("DD/MM/YYYY") : dayjs(event.startAt).format("DD/MM/YYYY HH:mm")}</small>
  </article>;
}

function TaskCardOverlay({ event }: { event: CalendarEvent }) {
  const [priority, color] = priorities[event.priority] ?? [event.priority, "default"];
  return <article className="task-kanban-card overlay">
    <div><Tag color={color}>{priority}</Tag><span className="kanban-drag-handle is-preview"><DragOutlined aria-hidden /></span></div>
    <strong>{event.title}</strong>
    <span>{event.subtitle || "Sin descripción"}</span>
    <small>{event.allDay ? dayjs(event.startAt).format("DD/MM/YYYY") : dayjs(event.startAt).format("DD/MM/YYYY HH:mm")}</small>
  </article>;
}

function TaskColumn({ column, events, active }: { column: typeof columns[number]; events: CalendarEvent[]; active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status });
  return <section ref={setNodeRef} className={`task-kanban-column${isOver ? " over" : ""}${active ? " active" : ""}`} style={{ "--column-color": column.color } as React.CSSProperties}>
    <header><strong>{column.label}</strong><Tag>{events.length}</Tag></header>
    <div>{events.length ? events.map((event) => <TaskCard key={event.id} event={event} />) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sin tareas" />}</div>
  </section>;
}

export function CalendarTaskKanban({ events, onMove }: { events: CalendarEvent[]; onMove: (event: CalendarEvent, status: "PENDING" | "COMPLETED" | "CANCELLED") => void }) {
  const [activeId, setActiveId] = useState<string>();
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 12 } }));
  const activeEvent = events.find((event) => event.id === activeId);
  const handleStart = ({ active }: DragStartEvent) => setActiveId(String(active.id));
  const handleEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(undefined);
    if (!over) return;
    const event = events.find((item) => item.id === String(active.id));
    const status = String(over.id) as "PENDING" | "COMPLETED" | "CANCELLED";
    if (event && event.status !== status) onMove(event, status);
  };
  return <DndContext sensors={sensors} onDragStart={handleStart} onDragCancel={() => setActiveId(undefined)} onDragEnd={handleEnd}>
    <div className="task-kanban-board">{columns.map((column) => <TaskColumn key={column.status} column={column} events={events.filter((event) => event.status === column.status)} active={Boolean(activeId)} />)}</div>
    <DragOverlay>{activeEvent ? <TaskCardOverlay event={activeEvent} /> : null}</DragOverlay>
  </DndContext>;
}
