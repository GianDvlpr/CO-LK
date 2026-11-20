"use client";

import { CloudServerOutlined, ReloadOutlined, WarningOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Col, DatePicker, Descriptions, Empty, Row, Space, Statistic, Table, Tag, Tooltip, Typography } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { useUiStore } from "@/stores/ui-store";

type MonthlySale = { mes: string; mes_label: string; ventas: number; ventas_anio_anterior: number };
type Branch = { cod_local: string; nombre: string; facturas: { cantidad: number; monto: number }; boletas: { cantidad: number; monto: number }; total: number; share_porcentaje: number };
type Currency = { moneda: string; documentos: number; total: number; igv: number };
type Customer = { ruc: string; tipo_documento: string; nombre: string; documentos: number; total: number };
type Product = { codigo: string; descripcion: string; cantidad: number; total: number };
type RecentDocument = { tipo: string; id: number; numero: string; fecha_emision: string; cliente_documento: string; cliente: string; moneda: string; total: number; estado_sunat: string; emitido_en: string };

type Dashboard = {
  overview: { comparacion?: { ventas_actuales?: number; ventas_anteriores?: number; cambio_ventas_porcentaje?: number; documentos_actuales?: number; documentos_anteriores?: number; cambio_documentos_porcentaje?: number } };
  indicators: { mes_actual?: { documentos?: number; ventas?: number; igv?: number; ticket_promedio?: number } };
  sunat: { total_documentos?: number; por_estado?: Record<string, number>; tasa_aceptacion?: number; observados?: number; ultimos_rechazos?: Array<{ tipo: string; numero: string; codigo_sunat?: string; motivo?: string; fecha?: string }> };
  collections: { resumen?: Record<string, { documentos?: number; saldo?: number }>; aging?: Record<string, number>; top_deudores?: Array<{ ruc: string; cliente: string; documentos: number; saldo: number }> };
  alerts: { rechazados_7_dias?: { cantidad: number }; vencen_proximos_7_dias?: { cantidad: number; monto: number }; vencidos?: { cantidad: number; monto: number }; pendientes_envio_sunat?: { cantidad: number }; series_por_agotar?: unknown[] };
  monthlySales: { meses?: MonthlySale[]; total_12_meses?: number; total_12_meses_anterior?: number; crecimiento_porcentaje?: number; promedio_mensual?: number };
  branches: { total_general?: number; sucursales?: Branch[] };
  currencies: { monedas?: Currency[] };
  customers: { total_registrados?: number; clientes_unicos_periodo?: number; clientes_nuevos?: unknown[] | number; clientes_recurrentes?: number; top_20?: Customer[] };
  products: { top_por_venta?: Product[]; top_por_cantidad?: Product[] };
  recentDocuments: { documentos?: RecentDocument[] };
};

type SunatMonitor = { disponible: boolean; circuit: "closed" | "open" | "half_open"; fallas: number; entorno: string; checkedAt: string };

async function api<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo cargar el panel fiscal.");
  return payload.data;
}

const money = (value?: number) => new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(value ?? 0);
const currencyMoney = (value: number, currency: string) => {
  try { return new Intl.NumberFormat("es-PE", { style: "currency", currency }).format(value); }
  catch { return `${currency} ${new Intl.NumberFormat("es-PE", { minimumFractionDigits: 2 }).format(value)}`; }
};
const statusColor = (status: string) => status === "aceptado" ? "green" : ["rechazado", "anulado"].includes(status) ? "red" : status === "enviado" ? "blue" : "gold";

function MonthlySalesChart({ data }: { data: MonthlySale[] }) {
  const dark = useUiStore((state) => state.themeMode) === "dark";
  if (!data.length) return <Empty description="Sin ventas en los últimos 12 meses" />;
  const axis = dark ? "#9fb3ab" : "#52606d";
  const grid = dark ? "#2a3b34" : "#e5e7eb";
  return <ResponsiveContainer width="100%" height={300}>
    <LineChart data={data} margin={{ top: 8, right: 18, bottom: 0, left: 6 }}>
      <CartesianGrid strokeDasharray="3 3" stroke={grid} />
      <XAxis dataKey="mes_label" stroke={axis} fontSize={12} tickFormatter={(value) => String(value).split(" ")[0]?.slice(0, 3) ?? String(value)} />
      <YAxis stroke={axis} fontSize={12} tickFormatter={(value) => new Intl.NumberFormat("es-PE", { notation: "compact" }).format(Number(value))} />
      <ChartTooltip formatter={(value) => money(Number(value))} contentStyle={{ backgroundColor: dark ? "#122019" : "#fff", border: `1px solid ${grid}`, borderRadius: 8 }} />
      <Legend />
      <Line type="monotone" dataKey="ventas" name="Últimos 12 meses" stroke="#1d6f55" strokeWidth={2} dot={false} />
      <Line type="monotone" dataKey="ventas_anio_anterior" name="Año anterior" stroke="#d97706" strokeWidth={2} dot={false} />
    </LineChart>
  </ResponsiveContainer>;
}

function SunatMonitorCard() {
  const monitor = useQuery({
    queryKey: ["sunat-service-monitor"],
    queryFn: () => api<SunatMonitor>("/api/v1/electronic-billing/monitor"),
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    retry: 1,
  });
  const data = monitor.data;
  const recovering = data?.circuit === "half_open";
  const type = monitor.error || data?.circuit === "open" || data?.disponible === false ? "error" : recovering ? "warning" : "success";
  const message = monitor.error ? "No se pudo verificar la conexión con SUNAT" : data?.circuit === "open" ? "SUNAT temporalmente no disponible" : recovering ? "Conexión SUNAT en recuperación" : data ? "Conexión SUNAT disponible" : "Verificando conexión con SUNAT";
  return <Alert
    showIcon
    type={type}
    message={<Space wrap><CloudServerOutlined /><strong>{message}</strong>{data ? <Tag>{data.entorno === "production" ? "Producción" : data.entorno}</Tag> : null}</Space>}
    description={monitor.error ? monitor.error.message : data ? `Circuito: ${data.circuit} · Fallas registradas: ${data.fallas} · Última revisión: ${dayjs(data.checkedAt).format("DD/MM/YYYY HH:mm:ss")}` : "La revisión automática se ejecuta cada 60 segundos."}
    action={<Tooltip title="Se actualiza automáticamente cada 60 segundos"><Button size="small" icon={<ReloadOutlined />} loading={monitor.isFetching} onClick={() => monitor.refetch()}>Revisar ahora</Button></Tooltip>}
  />;
}

export function FiscalDashboard() {
  const [month, setMonth] = useState<Dayjs>(dayjs());
  const dashboard = useQuery({ queryKey: ["fiscal-dashboard", month.format("YYYY-MM")], queryFn: () => api<Dashboard>(`/api/v1/electronic-billing/dashboard?month=${month.format("YYYY-MM")}`) });
  const data = dashboard.data;
  const periodData = data?.overview.comparacion;
  const states = data?.sunat.por_estado ?? {};
  const newCustomers = Array.isArray(data?.customers.clientes_nuevos) ? data.customers.clientes_nuevos.length : Number(data?.customers.clientes_nuevos ?? 0);

  return <Space direction="vertical" size="middle" style={{ width: "100%" }}>
    <SunatMonitorCard />
    <Card className="section-card" title="Panel fiscal" extra={<Space><DatePicker picker="month" value={month} onChange={(value) => value && setMonth(value)} format="MMMM YYYY" allowClear={false} /><Tooltip title="Actualizar panel"><Button icon={<ReloadOutlined />} loading={dashboard.isFetching} onClick={() => dashboard.refetch()} /></Tooltip></Space>}>
      {dashboard.error ? <Alert type="error" showIcon message={dashboard.error.message} style={{ marginBottom: 16 }} /> : null}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}><Statistic title="Ventas del período" value={periodData?.ventas_actuales ?? 0} formatter={(value) => money(Number(value))} /></Col>
        <Col xs={24} sm={12} lg={6}><Statistic title="Documentos del período" value={periodData?.documentos_actuales ?? 0} /></Col>
        <Col xs={24} sm={12} lg={6}><Statistic title="Variación vs. mes anterior" value={periodData?.cambio_ventas_porcentaje ?? 0} precision={1} suffix="%" valueStyle={{ color: (periodData?.cambio_ventas_porcentaje ?? 0) < 0 ? "#cf1322" : "#3f8600" }} /></Col>
        <Col xs={24} sm={12} lg={6}><Statistic title="Aceptación SUNAT" value={data?.sunat.tasa_aceptacion ?? 0} suffix="%" /></Col>
      </Row>
      <Space wrap style={{ marginTop: 18 }}>{Object.entries(states).map(([state, count]) => <Tag key={state} color={statusColor(state)}>{state}: {count}</Tag>)}</Space>
    </Card>

    <Card title="Evolución de ventas · 12 meses" loading={dashboard.isLoading}>
      <MonthlySalesChart data={data?.monthlySales.meses ?? []} />
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={8}><Statistic title="Total 12 meses" value={data?.monthlySales.total_12_meses ?? 0} formatter={(value) => money(Number(value))} /></Col>
        <Col xs={24} sm={8}><Statistic title="Promedio mensual" value={data?.monthlySales.promedio_mensual ?? 0} formatter={(value) => money(Number(value))} /></Col>
        <Col xs={24} sm={8}><Statistic title="Crecimiento anual" value={data?.monthlySales.crecimiento_porcentaje ?? 0} suffix="%" precision={1} /></Col>
      </Row>
    </Card>

    <Row gutter={[16, 16]} align="stretch">
      <Col xs={24} lg={12} style={{ display: "flex" }}>
        <Card style={{ width: "100%" }} title={<Space><WarningOutlined />Alertas fiscales</Space>}>
          <Space direction="vertical">
            <Typography.Text>Rechazados últimos 7 días: <strong>{data?.alerts.rechazados_7_dias?.cantidad ?? 0}</strong></Typography.Text>
            <Typography.Text>Pendientes de envío: <strong>{data?.alerts.pendientes_envio_sunat?.cantidad ?? 0}</strong></Typography.Text>
            <Typography.Text>Vencen en 7 días: <strong>{data?.alerts.vencen_proximos_7_dias?.cantidad ?? 0}</strong> · {money(data?.alerts.vencen_proximos_7_dias?.monto)}</Typography.Text>
            <Typography.Text type={(data?.alerts.vencidos?.cantidad ?? 0) > 0 ? "danger" : undefined}>Vencidos: <strong>{data?.alerts.vencidos?.cantidad ?? 0}</strong> · {money(data?.alerts.vencidos?.monto)}</Typography.Text>
            <Typography.Text>Series próximas a agotarse: <strong>{data?.alerts.series_por_agotar?.length ?? 0}</strong></Typography.Text>
          </Space>
        </Card>
      </Col>
      <Col xs={24} lg={12} style={{ display: "flex" }}>
        <Card style={{ width: "100%" }} title="Cuentas por cobrar">
          <Row gutter={[12, 12]}>{["pendiente", "parcial", "pagado"].map((status) => <Col xs={24} sm={8} key={status}><Statistic title={status} value={data?.collections.resumen?.[status]?.saldo ?? 0} formatter={(value) => money(Number(value))} /></Col>)}</Row>
        </Card>
      </Col>
    </Row>

    <Row gutter={[16, 16]} align="top">
      <Col xs={24} xl={12}>
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Card title="Ventas por sucursal" loading={dashboard.isLoading}><Table<Branch> size="small" rowKey="cod_local" pagination={false} scroll={{ x: 620 }} dataSource={data?.branches.sucursales ?? []} locale={{ emptyText: <Empty description="Sin sucursales con ventas" /> }} columns={[{ title: "Sucursal", dataIndex: "nombre" }, { title: "Facturas", dataIndex: ["facturas", "cantidad"], align: "right" }, { title: "Boletas", dataIndex: ["boletas", "cantidad"], align: "right" }, { title: "Total", dataIndex: "total", align: "right", render: money }, { title: "Participación", dataIndex: "share_porcentaje", align: "right", render: (value) => `${value}%` }]} /></Card>
          <Card title="Productos con mayor venta"><Table<Product> size="small" rowKey={(item) => `${item.codigo}-${item.descripcion}`} pagination={{ pageSize: 5, hideOnSinglePage: true }} scroll={{ x: 560 }} dataSource={(data?.products.top_por_venta ?? []).slice(0, 10)} locale={{ emptyText: <Empty description="Sin productos vendidos" /> }} columns={[{ title: "Código", dataIndex: "codigo", render: (value) => value || "—" }, { title: "Producto", dataIndex: "descripcion" }, { title: "Cantidad", dataIndex: "cantidad", align: "right" }, { title: "Total", dataIndex: "total", align: "right", render: money }]} /></Card>
          <Card title="Documentos recientes"><Table<RecentDocument> size="small" rowKey={(item) => `${item.tipo}-${item.id}`} pagination={{ pageSize: 5, hideOnSinglePage: true }} scroll={{ x: 650 }} dataSource={data?.recentDocuments.documentos ?? []} locale={{ emptyText: <Empty description="Sin documentos recientes" /> }} columns={[{ title: "Número", dataIndex: "numero" }, { title: "Cliente", dataIndex: "cliente" }, { title: "Total", dataIndex: "total", align: "right", render: (value, item) => currencyMoney(value, item.moneda) }, { title: "SUNAT", dataIndex: "estado_sunat", render: (value) => <Tag color={statusColor(value)}>{value}</Tag> }, { title: "Emisión", dataIndex: "fecha_emision", render: (value) => value ? dayjs(value).format("DD/MM/YYYY") : "—" }]} /></Card>
        </Space>
      </Col>

      <Col xs={24} xl={12}>
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Card title="Ventas por moneda" loading={dashboard.isLoading}><Table<Currency> size="small" rowKey="moneda" pagination={false} dataSource={data?.currencies.monedas ?? []} locale={{ emptyText: <Empty description="Sin ventas" /> }} columns={[{ title: "Moneda", dataIndex: "moneda" }, { title: "Docs.", dataIndex: "documentos", align: "right" }, { title: "Total", dataIndex: "total", align: "right", render: (value, item) => currencyMoney(value, item.moneda) }, { title: "IGV", dataIndex: "igv", align: "right", render: (value, item) => currencyMoney(value, item.moneda) }]} /></Card>
          <Card title="Clientes del período" loading={dashboard.isLoading}><Descriptions size="small" bordered column={{ xs: 2, sm: 4 }} items={[{ key: "total", label: "Registrados", children: data?.customers.total_registrados ?? 0 }, { key: "unique", label: "Con compras", children: data?.customers.clientes_unicos_periodo ?? 0 }, { key: "new", label: "Nuevos", children: newCustomers }, { key: "repeat", label: "Recurrentes", children: data?.customers.clientes_recurrentes ?? 0 }]} /><Table<Customer> style={{ marginTop: 12 }} size="small" rowKey={(item) => `${item.tipo_documento}-${item.ruc}`} pagination={false} scroll={{ x: 560 }} dataSource={(data?.customers.top_20 ?? []).slice(0, 5)} locale={{ emptyText: <Empty description="Sin clientes en el período" /> }} columns={[{ title: "Cliente", dataIndex: "nombre" }, { title: "Documento", dataIndex: "ruc" }, { title: "Docs.", dataIndex: "documentos", align: "right" }, { title: "Total", dataIndex: "total", align: "right", render: money }]} /></Card>
          <Card title="Últimos rechazos SUNAT"><Table size="small" rowKey={(item) => `${item.tipo}-${item.numero}`} pagination={{ pageSize: 5, hideOnSinglePage: true }} scroll={{ x: 560 }} dataSource={data?.sunat.ultimos_rechazos ?? []} locale={{ emptyText: <Empty description="No hay rechazos recientes" /> }} columns={[{ title: "Tipo", dataIndex: "tipo" }, { title: "Número", dataIndex: "numero" }, { title: "Código", dataIndex: "codigo_sunat", render: (value) => value || "—" }, { title: "Motivo", dataIndex: "motivo" }, { title: "Fecha", dataIndex: "fecha", render: (value) => value ? dayjs(value).format("DD/MM/YYYY") : "—" }]} /></Card>
          <Card title="Principales deudores"><Table size="small" rowKey="ruc" pagination={{ pageSize: 5, hideOnSinglePage: true }} scroll={{ x: 520 }} dataSource={data?.collections.top_deudores ?? []} locale={{ emptyText: <Empty description="No hay saldos pendientes" /> }} columns={[{ title: "RUC", dataIndex: "ruc" }, { title: "Cliente", dataIndex: "cliente" }, { title: "Documentos", dataIndex: "documentos" }, { title: "Saldo", dataIndex: "saldo", align: "right", render: money }]} /></Card>
        </Space>
      </Col>
    </Row>
  </Space>;
}
