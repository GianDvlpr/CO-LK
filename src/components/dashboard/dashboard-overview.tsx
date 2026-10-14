"use client";

import { AlertOutlined, DollarOutlined, ReloadOutlined, ShoppingCartOutlined, WarningOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Col, DatePicker, Empty, List, Progress, Row, Space, Statistic, Tag, Typography } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import Link from "next/link";
import { useState } from "react";
import { ModuleHeadingIntro } from "@/components/common/module-heading-intro";

type Analytics = {
  period: { from: string; to: string };
  purchases: { total: number; value: number; statuses: Record<string, number> };
  orders: { total: number; statuses: Record<string, number>; dueAlerts: { id: string; number: string; customer: string; promisedAt: string; severity: string }[]; topProducts: { code: string; name: string; quantity: number }[] };
  production: { total: number; statuses: Record<string, number> };
  inventory: { totalItems: number; totalValue: number; lowStockCount: number; outOfStock: number; lowStock: { id: string; code: string; name: string; unit: string; onHand: number; minimumStock: number }[] };
};

async function api<T>(url: string): Promise<T> { const response = await fetch(url); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo cargar la analítica."); return payload.data; }
const money = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
const labels: Record<string, string> = { DRAFT: "Borrador", PENDING: "Pendiente", APPROVED: "Aprobado", REJECTED: "Rechazado", CANCELLED: "Cancelado", CONFIRMED: "Confirmado", IN_PRODUCTION: "En producción", READY: "Listo", DISPATCHED: "Despachado", RELEASED: "Liberada", IN_PROGRESS: "En proceso", COMPLETED: "Completada" };

function Distribution({ values }: { values: Record<string, number> }) {
  const total = Object.values(values).reduce((sum, value) => sum + value, 0);
  if (!total) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sin actividad en el periodo" />;
  return <Space direction="vertical" style={{ width: "100%" }}>{Object.entries(values).map(([key, value]) => <div className="analytics-progress" key={key}><span>{labels[key] ?? key}</span><Progress percent={Math.round(value / total * 100)} format={() => String(value)} strokeColor="#1d6f55" /></div>)}</Space>;
}

export function DashboardOverview() {
  const [period, setPeriod] = useState<[Dayjs, Dayjs]>([dayjs().startOf("month"), dayjs()]);
  const query = `${period[0].format("YYYY-MM-DD")}:${period[1].format("YYYY-MM-DD")}`;
  const analytics = useQuery({ queryKey: ["dashboard-analytics", query], queryFn: () => api<Analytics>(`/api/v1/dashboard/analytics?from=${period[0].format("YYYY-MM-DD")}&to=${period[1].format("YYYY-MM-DD")}`) });
  const data = analytics.data;
  const pendingPurchases = (data?.purchases.statuses.PENDING ?? 0) + (data?.purchases.statuses.DRAFT ?? 0);
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
    <Row gutter={[18, 18]} style={{ marginTop: 18 }}>
      <Col xs={24} lg={8}><Card className="section-card" title={`Compras · ${data?.purchases.total ?? 0}`} loading={analytics.isLoading}><Distribution values={data?.purchases.statuses ?? {}} /></Card></Col>
      <Col xs={24} lg={8}><Card className="section-card" title={`Pedidos · ${data?.orders.total ?? 0}`} loading={analytics.isLoading}><Distribution values={data?.orders.statuses ?? {}} /></Card></Col>
      <Col xs={24} lg={8}><Card className="section-card" title={`Producción · ${data?.production.total ?? 0}`} loading={analytics.isLoading}><Distribution values={data?.production.statuses ?? {}} /></Card></Col>
    </Row>
    <Card className="section-card" title="Productos más pedidos" style={{ marginTop: 18 }} loading={analytics.isLoading}>{data?.orders.topProducts.length ? <List grid={{ gutter: 16, xs: 1, sm: 2, lg: 3 }} dataSource={data.orders.topProducts} renderItem={(item, index) => <List.Item><Card size="small"><Typography.Text type="secondary">#{index + 1} · {item.code}</Typography.Text><Typography.Title level={5} ellipsis={{ tooltip: item.name }} style={{ margin: "6px 0" }}>{item.name}</Typography.Title><strong>{item.quantity} unidades</strong></Card></List.Item>} /> : <Empty description="Sin pedidos en el periodo" />}</Card>
  </>;
}
