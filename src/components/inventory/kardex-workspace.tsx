"use client";

import { ArrowLeftOutlined, ReloadOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Empty, Select, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import Decimal from "decimal.js";
import Link from "next/link";
import { useState } from "react";
import { ModuleHeadingIntro } from "@/components/common/module-heading-intro";

type Movement = { id: string; type: string; quantity: string; unitCost: string; movementValue: string; balanceAfter: string; valueAfter: string; averageCostAfter: string; referenceType: string; postingSequence: string; postedAt: string; item: { code: string; name: string; unit: { symbol: string } }; warehouse: { code: string; name: string }; lot: { lotCode: string } | null };
type Options = { warehouses: { id: string; code: string; name: string }[]; items: { id: string; code: string; name: string; unit: { symbol: string } }[] };

async function api<T>(url: string): Promise<T> { const response = await fetch(url); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo cargar el kardex."); return payload.data; }
const movementLabel: Record<string, string> = { PURCHASE_RECEIPT: "Compra", PRODUCTION_CONSUMPTION: "Consumo producción", PRODUCTION_OUTPUT: "Salida producción", SALES_DISPATCH: "Despacho", ADJUSTMENT_IN: "Ajuste de entrada", ADJUSTMENT_OUT: "Ajuste de salida", REVERSAL: "Reversa" };

export function KardexWorkspace() {
  const [itemId, setItemId] = useState<string>();
  const [warehouseId, setWarehouseId] = useState<string>();
  const options = useQuery({ queryKey: ["inventory-options"], queryFn: () => api<Options>("/api/v1/inventory/options") });
  const params = new URLSearchParams(); if (itemId) params.set("itemId", itemId); if (warehouseId) params.set("warehouseId", warehouseId);
  const movements = useQuery({ queryKey: ["kardex", itemId, warehouseId], queryFn: () => api<{ items: Movement[] }>(`/api/v1/inventory/kardex?${params}`) });
  const columns: ColumnsType<Movement> = [
    { title: "Sec.", dataIndex: "postingSequence", width: 80, fixed: "left" },
    { title: "Fecha", dataIndex: "postedAt", width: 150, render: (value) => dayjs(value).format("DD/MM/YYYY HH:mm") },
    { title: "Ítem", width: 230, render: (_, row) => <><strong>{row.item.code}</strong><br /><Typography.Text type="secondary">{row.item.name}</Typography.Text></> },
    { title: "Almacén", width: 160, render: (_, row) => `${row.warehouse.code} · ${row.warehouse.name}` },
    { title: "Movimiento", dataIndex: "type", width: 170, render: (value) => <Tag color={value.includes("OUT") || value.includes("CONSUMPTION") || value === "SALES_DISPATCH" ? "red" : "green"}>{movementLabel[value] ?? value}</Tag> },
    { title: "Lote", width: 120, render: (_, row) => row.lot?.lotCode ?? "—" },
    { title: "Cantidad", width: 120, align: "right", render: (_, row) => `${new Decimal(row.quantity).toFixed(3)} ${row.item.unit.symbol}` },
    { title: "Costo unit.", dataIndex: "unitCost", width: 120, align: "right", render: (value) => `S/ ${new Decimal(value).toFixed(4)}` },
    { title: "Valor mov.", dataIndex: "movementValue", width: 130, align: "right", render: (value) => `S/ ${new Decimal(value).toFixed(2)}` },
    { title: "Saldo", dataIndex: "balanceAfter", width: 120, align: "right", render: (value) => new Decimal(value).toFixed(3) },
    { title: "Valor saldo", dataIndex: "valueAfter", width: 130, align: "right", render: (value) => `S/ ${new Decimal(value).toFixed(2)}` },
    { title: "Costo prom.", dataIndex: "averageCostAfter", width: 130, align: "right", render: (value) => `S/ ${new Decimal(value).toFixed(4)}` },
  ];
  return <>
    <div className="page-heading"><ModuleHeadingIntro title="Kardex valorizado" eyebrow="Trazabilidad" description="Movimientos inmutables ordenados por secuencia contable, con saldos y promedio ponderado." /><Space wrap className="module-actions"><Link href="/dashboard/inventory"><Button icon={<ArrowLeftOutlined />}>Volver al almacén</Button></Link><Button icon={<ReloadOutlined />} onClick={() => movements.refetch()}>Actualizar</Button></Space></div>
    <Card className="section-card" style={{ marginBottom: 18 }}><Space wrap><Select allowClear showSearch optionFilterProp="label" placeholder="Todos los ítems" style={{ minWidth: 280 }} value={itemId} onChange={setItemId} options={options.data?.items.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))} /><Select allowClear placeholder="Todos los almacenes" style={{ minWidth: 240 }} value={warehouseId} onChange={setWarehouseId} options={options.data?.warehouses.map((warehouse) => ({ value: warehouse.id, label: `${warehouse.code} · ${warehouse.name}` }))} /></Space></Card>
    <Card className="section-card">{movements.error ? <Alert type="error" showIcon message={movements.error.message} style={{ marginBottom: 16 }} /> : null}<Table rowKey="id" loading={movements.isLoading} columns={columns} dataSource={movements.data?.items ?? []} scroll={{ x: 1750 }} pagination={{ pageSize: 30 }} locale={{ emptyText: <Empty description="No hay movimientos para los filtros seleccionados" /> }} /></Card>
  </>;
}
