"use client";

import { ReloadOutlined, WarningOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, DatePicker, Empty, Row, Col, Space, Statistic, Table, Tag, Tooltip, Typography } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";

type Dashboard = {
  overview: {
    periodo?: { desde?: string; hasta?: string; label?: string };
    comparacion?: {
      ventas_actuales?: number;
      ventas_anteriores?: number;
      cambio_ventas_porcentaje?: number;
      documentos_actuales?: number;
      documentos_anteriores?: number;
      cambio_documentos_porcentaje?: number;
    };
  };
  indicators: { mes_actual?: { documentos?: number; ventas?: number; igv?: number; ticket_promedio?: number } };
  sunat: { total_documentos?: number; por_estado?: Record<string, number>; tasa_aceptacion?: number; observados?: number; ultimos_rechazos?: Array<{ tipo: string; numero: string; codigo_sunat?: string; motivo?: string; fecha?: string }> };
  collections: { resumen?: Record<string, { documentos?: number; saldo?: number }>; aging?: Record<string, number>; top_deudores?: Array<{ ruc: string; cliente: string; documentos: number; saldo: number }> };
  alerts: { rechazados_7_dias?: { cantidad: number }; vencen_proximos_7_dias?: { cantidad: number; monto: number }; vencidos?: { cantidad: number; monto: number }; pendientes_envio_sunat?: { cantidad: number }; series_por_agotar?: unknown[] };
};

async function api<T>(url: string): Promise<T> { const response = await fetch(url); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo cargar el panel fiscal."); return payload.data; }
const money = (value?: number) => new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(value ?? 0);

export function FiscalDashboard() {
  const [month, setMonth] = useState<Dayjs>(dayjs());
  const dashboard = useQuery({ queryKey: ["fiscal-dashboard", month.format("YYYY-MM")], queryFn: () => api<Dashboard>(`/api/v1/electronic-billing/dashboard?month=${month.format("YYYY-MM")}`) });
  const data = dashboard.data;
  const periodData = data?.overview.comparacion;
  const states = data?.sunat.por_estado ?? {};
  return <Space direction="vertical" size="middle" style={{ width: "100%" }}>
    <Card className="section-card" title="Panel fiscal" extra={<Space><DatePicker picker="month" value={month} onChange={(value) => value && setMonth(value)} format="MMMM YYYY" allowClear={false} /><Tooltip title="Actualizar"><Button icon={<ReloadOutlined />} loading={dashboard.isFetching} onClick={() => dashboard.refetch()} /></Tooltip></Space>}>
      {dashboard.error ? <Alert type="error" showIcon message={dashboard.error.message} /> : null}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}><Statistic title="Ventas del período" value={periodData?.ventas_actuales ?? 0} formatter={(value) => money(Number(value))} /></Col>
        <Col xs={24} sm={12} lg={6}><Statistic title="Documentos del período" value={periodData?.documentos_actuales ?? 0} /></Col>
        <Col xs={24} sm={12} lg={6}><Statistic title="Variación vs. mes anterior" value={periodData?.cambio_ventas_porcentaje ?? 0} precision={1} suffix="%" valueStyle={{ color: (periodData?.cambio_ventas_porcentaje ?? 0) < 0 ? "#cf1322" : "#3f8600" }} /></Col>
        <Col xs={24} sm={12} lg={6}><Statistic title="Aceptación SUNAT" value={data?.sunat.tasa_aceptacion ?? 0} suffix="%" /></Col>
      </Row>
      <Space wrap style={{ marginTop: 18 }}>{Object.entries(states).map(([state, count]) => <Tag key={state} color={state === "aceptado" ? "green" : state === "rechazado" ? "red" : state === "enviado" ? "blue" : "gold"}>{state}: {count}</Tag>)}</Space>
    </Card>
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={12}><Card title={<Space><WarningOutlined />Alertas fiscales</Space>}>
        <Space direction="vertical">
          <Typography.Text>Rechazados últimos 7 días: <strong>{data?.alerts.rechazados_7_dias?.cantidad ?? 0}</strong></Typography.Text>
          <Typography.Text>Pendientes de envío: <strong>{data?.alerts.pendientes_envio_sunat?.cantidad ?? 0}</strong></Typography.Text>
          <Typography.Text>Vencen en 7 días: <strong>{data?.alerts.vencen_proximos_7_dias?.cantidad ?? 0}</strong> · {money(data?.alerts.vencen_proximos_7_dias?.monto)}</Typography.Text>
          <Typography.Text type={(data?.alerts.vencidos?.cantidad ?? 0) > 0 ? "danger" : undefined}>Vencidos: <strong>{data?.alerts.vencidos?.cantidad ?? 0}</strong> · {money(data?.alerts.vencidos?.monto)}</Typography.Text>
          <Typography.Text>Series próximas a agotarse: <strong>{data?.alerts.series_por_agotar?.length ?? 0}</strong></Typography.Text>
        </Space>
      </Card></Col>
      <Col xs={24} lg={12}><Card title="Cuentas por cobrar">
        <Row gutter={[12, 12]}>{["pendiente", "parcial", "pagado"].map((status) => <Col span={8} key={status}><Statistic title={status} value={data?.collections.resumen?.[status]?.saldo ?? 0} formatter={(value) => money(Number(value))} /></Col>)}</Row>
      </Card></Col>
    </Row>
    <Card title="Últimos rechazos SUNAT"><Table size="small" rowKey={(item) => `${item.tipo}-${item.numero}`} pagination={false} dataSource={data?.sunat.ultimos_rechazos ?? []} locale={{ emptyText: <Empty description="No hay rechazos recientes" /> }} columns={[{ title: "Tipo", dataIndex: "tipo" }, { title: "Número", dataIndex: "numero" }, { title: "Código", dataIndex: "codigo_sunat", render: (value) => value || "—" }, { title: "Motivo", dataIndex: "motivo" }, { title: "Fecha", dataIndex: "fecha", render: (value) => value ? dayjs(value).format("DD/MM/YYYY") : "—" }]} /></Card>
    <Card title="Principales deudores"><Table size="small" rowKey="ruc" pagination={false} dataSource={data?.collections.top_deudores ?? []} locale={{ emptyText: <Empty description="No hay saldos pendientes" /> }} columns={[{ title: "RUC", dataIndex: "ruc" }, { title: "Cliente", dataIndex: "cliente" }, { title: "Documentos", dataIndex: "documentos" }, { title: "Saldo", dataIndex: "saldo", align: "right", render: money }]} /></Card>
  </Space>;
}
