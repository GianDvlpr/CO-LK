"use client";

import { DragOutlined } from "@ant-design/icons";
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
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

function TaskCard({ event, overlay = false }: { event: CalendarEvent; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: event.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const [priority, color] = priorities[event.priority] ?? [event.priority, "default"];
  return <article ref={overlay ? undefined : setNodeRef} style={overlay ? undefined : style} className={`task-kanban-card${isDragging ? " dragging" : ""}${overlay ? " overlay" : ""}`} {...(overlay ? {} : attributes)} {...(overlay ? {} : listeners)}>
    <div><Tag color={color}>{priority}</Tag><DragOutlined /></div>
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
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }));
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
    <DragOverlay>{activeEvent ? <TaskCard event={activeEvent} overlay /> : null}</DragOverlay>
  </DndContext>;
}
