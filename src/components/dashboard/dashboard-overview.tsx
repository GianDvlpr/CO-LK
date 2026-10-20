"use client";

import { AlertOutlined, DollarOutlined, ReloadOutlined, ShoppingCartOutlined, WarningOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Col, DatePicker, Empty, List, Row, Space, Statistic, Tag, Typography } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import Link from "next/link";
import { useState } from "react";
import { ModuleHeadingIntro } from "@/components/common/module-heading-intro";
import { ActivityLineChart, DonutChart, HorizontalBarChart, VerticalBarChart, money, statusSlices, truncateLabel, type ActivityPoint, type ChartSlice } from "@/components/dashboard/analytics-charts";

type Analytics = {
  period: { from: string; to: string };
  activity: ActivityPoint[];
  purchases: { total: number; value: number; statuses: Record<string, number> };
  orders: { total: number; statuses: Record<string, number>; dueAlerts: { id: string; number: string; customer: string; promisedAt: string; severity: string }[]; topProducts: { code: string; name: string; quantity: number }[] };
  production: { total: number; statuses: Record<string, number>; consumedMaterials: { code: string; name: string; unit: string; quantity: number }[] };
  inventory: { totalItems: number; totalValue: number; lowStockCount: number; outOfStock: number; lowStock: { id: string; code: string; name: string; unit: string; onHand: number; minimumStock: number }[]; byType: { RAW_MATERIAL: number; INTERMEDIATE: number; WASTE: number; FINISHED_PRODUCT: number }; byWarehouse: { code: string; name: string; value: number }[] };
};

async function api<T>(url: string): Promise<T> { const response = await fetch(url); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo cargar la analítica."); return payload.data; }

export function DashboardOverview() {
  const [period, setPeriod] = useState<[Dayjs, Dayjs]>([dayjs().startOf("month"), dayjs()]);
  const query = `${period[0].format("YYYY-MM-DD")}:${period[1].format("YYYY-MM-DD")}`;
  const analytics = useQuery({ queryKey: ["dashboard-analytics", query], queryFn: () => api<Analytics>(`/api/v1/dashboard/analytics?from=${period[0].format("YYYY-MM-DD")}&to=${period[1].format("YYYY-MM-DD")}`) });
  const data = analytics.data;
  const pendingPurchases = (data?.purchases.statuses.PENDING ?? 0) + (data?.purchases.statuses.DRAFT ?? 0);
  const inventoryTypeSlices: ChartSlice[] = [
    { name: "Materia prima", value: data?.inventory.byType.RAW_MATERIAL ?? 0, color: "#1d6f55" },
    { name: "Insumo elaborado", value: data?.inventory.byType.INTERMEDIATE ?? 0, color: "#0891b2" },
    { name: "Merma", value: data?.inventory.byType.WASTE ?? 0, color: "#d97706" },
    { name: "Producto terminado", value: data?.inventory.byType.FINISHED_PRODUCT ?? 0, color: "#7c3aed" },
  ];
  const warehouseBars = (data?.inventory.byWarehouse ?? []).map((warehouse) => ({ label: warehouse.code, fullName: `${warehouse.code} · ${warehouse.name}`, value: warehouse.value }));
  const productBars = (data?.orders.topProducts ?? []).map((product) => ({ label: truncateLabel(product.name, 22), fullName: `${product.code} · ${product.name}`, value: product.quantity }));
  const consumedBars = (data?.production.consumedMaterials ?? []).map((material) => ({ label: truncateLabel(`${material.name} (${material.unit})`, 22), fullName: `${material.code} · ${material.name} (${material.unit})`, value: material.quantity }));
  return <>
    <div className="page-heading"><ModuleHeadingIntro title="Panel de control" eyebrow="Analítica operativa" description="Indicadores de módulos, alertas de stock y compromisos de entrega para tomar acción." /><Space wrap className="dashboard-filter"><DatePicker.RangePicker value={period} allowClear={false} format="DD/MM/YYYY" onChange={(value) => { if (value?.[0] && value[1]) setPeriod([value[0], value[1]]); }} /><Button icon={<ReloadOutlined />} loading={analytics.isFetching} onClick={() => analytics.refetch()}>Actualizar</Button></Space></div>
    {analytics.error ? <Alert type="error" showIcon message={analytics.error.message} style={{ marginBottom: 18 }} /> : null}
    <Row gutter={[18, 18]}>
      <Col xs={24} sm={12} xl={6}><Card className="metric-card" loading={analytics.isLoading}><Statistic title="Inventario valorizado" value={data?.inventory.totalValue ?? 0} formatter={(value) => money.format(Number(value))} prefix={<DollarOutlined />} /><Typography.Text type="secondary">{data?.inventory.totalItems ?? 0} ítems activos</Typography.Text></Card></Col>
      <Col xs={24} sm={12} xl={6}><Card className="metric-card" loading={analytics.isLoading}><Statistic title="Alertas de stock" value={data?.inventory.lowStockCount ?? 0} prefix={<WarningOutlined />} /><Typography.Text type="danger">{data?.inventory.outOfStock ?? 0} sin existencias</Typography.Text></Card></Col>
      <Col xs={24} sm={12} xl={6}><Card className="metric-card" loading={analytics.isLoading}><Statistic title="Compras pendientes" value={pendingPurchases} prefix={<ShoppingCartOutlined />} /><Typography.Text type="secondary">{money.format(data?.purchases.value ?? 0)} en el periodo</Typography.Text></Card></Col>
      <Col xs={24} sm={12} xl={6}><Card className="metric-card" loading={analytics.isLoading}><Statistic title="Pedidos por atender" value={data?.orders.dueAlerts.length ?? 0} prefix={<AlertOutlined />} /><Typography.Text type="secondary">Vencidos o próximos 7 días</Typography.Text></Card></Col>
    </Row>
    <Row gutter={[18, 18]} style={{ marginTop: 18 }}>
      <Col xs={24} xl={12}><Card className="section-card" title="Stock mínimo y agotados" extra={<Link href="/dashboard/inventory">Ver almacén</Link>} loading={analytics.isLoading}>{data?.inventory.lowStock.length ? <List dataSource={data.inventory.lowStock} renderItem={(item) => <List.Item><List.Item.Meta title={`${item.code} · ${item.name}`} description={`Mínimo: ${item.minimumStock} ${item.unit}`} /><Tag color={item.onHand <= 0 ? "red" : "orange"}>{item.onHand} {item.unit}</Tag></List.Item>} /> : <Empty description="No hay alertas de stock" />}</Card></Col>
      <Col xs={24} xl={12}><Card className="section-card" title="Fechas comprometidas de pedidos" extra={<Link href="/dashboard/orders">Ver pedidos</Link>} loading={analytics.isLoading}>{data?.orders.dueAlerts.length ? <List dataSource={data.orders.dueAlerts} renderItem={(item) => <List.Item><List.Item.Meta title={`${item.number} · ${item.customer}`} description={`Entrega: ${dayjs(item.promisedAt).format("DD/MM/YYYY")}`} /><Tag color={item.severity === "OVERDUE" ? "red" : "gold"}>{item.severity === "OVERDUE" ? "Vencido" : "Próximo"}</Tag></List.Item>} /> : <Empty description="No hay pedidos vencidos o próximos" />}</Card></Col>
    </Row>
    <Card className="section-card" title="Actividad diaria" style={{ marginTop: 18 }} loading={analytics.isLoading}>{data ? <ActivityLineChart data={data.activity} /> : null}</Card>
    <Row gutter={[18, 18]} style={{ marginTop: 18 }}>
      <Col xs={24} lg={8}><Card className="section-card" title={`Compras · ${data?.purchases.total ?? 0}`} loading={analytics.isLoading}>{data ? <DonutChart data={statusSlices(data.purchases.statuses)} /> : null}</Card></Col>
      <Col xs={24} lg={8}><Card className="section-card" title={`Pedidos · ${data?.orders.total ?? 0}`} loading={analytics.isLoading}>{data ? <DonutChart data={statusSlices(data.orders.statuses)} /> : null}</Card></Col>
      <Col xs={24} lg={8}><Card className="section-card" title={`Producción · ${data?.production.total ?? 0}`} loading={analytics.isLoading}>{data ? <DonutChart data={statusSlices(data.production.statuses)} /> : null}</Card></Col>
    </Row>
    <Row gutter={[18, 18]} style={{ marginTop: 18 }}>
      <Col xs={24} xl={12}><Card className="section-card" title="Inventario valorizado por tipo" loading={analytics.isLoading}>{data ? <DonutChart data={inventoryTypeSlices} valueFormatter={(value) => money.format(value)} /> : null}</Card></Col>
      <Col xs={24} xl={12}><Card className="section-card" title="Valor de inventario por almacén" loading={analytics.isLoading}>{data ? <VerticalBarChart data={warehouseBars} valueFormatter={(value) => money.format(value)} /> : null}</Card></Col>
    </Row>
    <Row gutter={[18, 18]} style={{ marginTop: 18 }}>
      <Col xs={24} xl={12}><Card className="section-card" title="Productos más pedidos" loading={analytics.isLoading}>{data ? <HorizontalBarChart data={productBars} valueFormatter={(value) => `${value} unidades`} /> : null}</Card></Col>
      <Col xs={24} xl={12}><Card className="section-card" title="Materiales más consumidos en producción" loading={analytics.isLoading}>{data ? <HorizontalBarChart data={consumedBars} /> : null}</Card></Col>
    </Row>
  </>;
}
