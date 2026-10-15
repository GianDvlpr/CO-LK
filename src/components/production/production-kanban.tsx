"use client";

import { DragOutlined, SearchOutlined } from "@ant-design/icons";
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { Empty, Input, Select, Tag } from "antd";
import dayjs from "dayjs";
import Decimal from "decimal.js";
import { useMemo, useState } from "react";
import type { Order } from "@/components/production/production-workspace";
import { productionBoardColumnStatus } from "@/modules/production/domain/production-board";

const columns = [
  { status: "DRAFT", label: "Pendiente", hint: "Orden creada", color: "#2563eb" },
  { status: "IN_PROGRESS", label: "En curso", hint: "Material consumido", color: "#7c3aed" },
  { status: "COMPLETED", label: "Finalizado", hint: "Ingresó al almacén", color: "#15803d" },
] as const;

function KanbanCard({ order }: { order: Order }) {
  const disabled = ["COMPLETED", "CANCELLED"].includes(order.status);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({ id: order.id, disabled });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return <article ref={setNodeRef} style={style} className={`production-kanban-card${isDragging ? " dragging" : ""}`}>
    <div className="production-kanban-card-head"><strong>{order.number}</strong>{!disabled ? <button ref={setActivatorNodeRef} type="button" className="kanban-drag-handle" aria-label={`Mover ${order.number}`} title="Mantén presionado y arrastra" {...attributes} {...listeners}><DragOutlined aria-hidden /></button> : <Tag>{order.status === "COMPLETED" ? "Cerrada" : "Cancelada"}</Tag>}</div>
    <span className="production-kanban-product">{order.productVariant.product.name}</span>
    <small>{order.productVariant.sku} · Talla {order.productVariant.size.name} · {order.productVariant.color.name}</small>
    <div className="production-kanban-progress"><span>Producido</span><strong>{new Decimal(order.producedQuantity).toFixed(0)} / {new Decimal(order.plannedQuantity).toFixed(0)}</strong></div>
    <div className="production-kanban-meta"><span>{order.machine ? `${order.machine.code} · ${order.machine.name}` : order.machineEquipment || "Sin máquina"}</span><span>{order.plannedAt ? dayjs(order.plannedAt).format("DD/MM/YYYY") : "Sin fecha"}</span></div>
  </article>;
}

function KanbanCardOverlay({ order }: { order: Order }) {
  return <article className="production-kanban-card overlay">
    <div className="production-kanban-card-head"><strong>{order.number}</strong><span className="kanban-drag-handle is-preview"><DragOutlined aria-hidden /></span></div>
    <span className="production-kanban-product">{order.productVariant.product.name}</span>
    <small>{order.productVariant.sku} · Talla {order.productVariant.size.name} · {order.productVariant.color.name}</small>
    <div className="production-kanban-progress"><span>Producido</span><strong>{new Decimal(order.producedQuantity).toFixed(0)} / {new Decimal(order.plannedQuantity).toFixed(0)}</strong></div>
    <div className="production-kanban-meta"><span>{order.machine ? `${order.machine.code} · ${order.machine.name}` : order.machineEquipment || "Sin máquina"}</span><span>{order.plannedAt ? dayjs(order.plannedAt).format("DD/MM/YYYY") : "Sin fecha"}</span></div>
  </article>;
}

function KanbanColumn({ column, orders, active, onOpen }: { column: typeof columns[number]; orders: Order[]; active: boolean; onOpen: (order: Order) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status });
  return <section ref={setNodeRef} className={`production-kanban-column${isOver ? " over" : ""}${active ? " active" : ""}`} style={{ "--column-color": column.color } as React.CSSProperties}>
    <header><div><strong>{column.label}</strong><span>{column.hint}</span></div><Tag>{orders.length}</Tag></header>
    <div className="production-kanban-stack">{orders.length ? orders.map((order) => <div key={order.id} onDoubleClick={() => onOpen(order)}><KanbanCard order={order} /></div>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sin órdenes" />}</div>
  </section>;
}

export function ProductionKanban({ orders, onMove, onOpen }: { orders: Order[]; onMove: (order: Order, targetStatus: string) => void; onOpen: (order: Order) => void }) {
  const [activeId, setActiveId] = useState<string>();
  const [search, setSearch] = useState("");
  const [machineId, setMachineId] = useState<string>();
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 12 } }), useSensor(KeyboardSensor));
  const machines = useMemo(() => [...new Map(orders.filter((order) => order.machine).map((order) => [order.machine!.id, order.machine!])).values()], [orders]);
  const filtered = useMemo(() => orders.filter((order) => {
    const term = search.trim().toLowerCase();
    if (machineId && order.machine?.id !== machineId) return false;
    return !term || [order.number, order.productVariant.sku, order.productVariant.product.name, order.machine?.name].some((value) => value?.toLowerCase().includes(term));
  }), [machineId, orders, search]);
  const activeOrder = orders.find((order) => order.id === activeId);

  const handleStart = ({ active }: DragStartEvent) => setActiveId(String(active.id));
  const handleEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(undefined);
    if (!over) return;
    const order = orders.find((item) => item.id === String(active.id));
    if (order && productionBoardColumnStatus(order.status) !== String(over.id)) onMove(order, String(over.id));
  };

  return <>
    <div className="production-kanban-tools"><Input allowClear prefix={<SearchOutlined />} placeholder="Buscar orden, producto, SKU o máquina" value={search} onChange={(event) => setSearch(event.target.value)} /><Select allowClear showSearch optionFilterProp="label" placeholder="Todas las máquinas" value={machineId} onChange={setMachineId} options={machines.map((machine) => ({ value: machine.id, label: `${machine.code} · ${machine.name}` }))} /></div>
    <DndContext sensors={sensors} onDragStart={handleStart} onDragCancel={() => setActiveId(undefined)} onDragEnd={handleEnd}>
      <div className="production-kanban-board">{columns.map((column) => <KanbanColumn key={column.status} column={column} orders={filtered.filter((order) => productionBoardColumnStatus(order.status) === column.status)} active={Boolean(activeId)} onOpen={onOpen} />)}</div>
      <DragOverlay>{activeOrder ? <KanbanCardOverlay order={activeOrder} /> : null}</DragOverlay>
    </DndContext>
  </>;
}
