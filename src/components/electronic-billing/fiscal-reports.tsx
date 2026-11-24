"use client";

import { FileExcelOutlined, FilePdfOutlined, SearchOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Col, DatePicker, Empty, Input, Row, Select, Space, Statistic, Switch, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useMemo, useState } from "react";
import type { FiscalReportName } from "@/modules/electronic-billing/domain/types";

type JsonRecord = Record<string, unknown>;
type ReportOption = { value: FiscalReportName; label: string; description: string };
type Metric = { key: string; label: string; value: number };

const reports: ReportOption[] = [
  { value: "registro-ventas", label: "Registro de ventas", description: "Detalle tributario de facturas, boletas y notas con bases imponibles e impuestos." },
  { value: "ventas-consolidado", label: "Ventas consolidadas", description: "Indicadores, evolución, tipos de comprobante, clientes, productos y monedas." },
  { value: "notas", label: "Notas de crédito y débito", description: "Impacto de las notas, motivos y documentos afectados durante el período." },
  { value: "cobranzas", label: "Cobranzas y cuentas por cobrar", description: "Saldos, vencimientos, avance de cobranza y detalle por comprobante." },
  { value: "documentos-internos", label: "Documentos internos", description: "Cotizaciones, notas de venta, conversión comercial y clientes principales." },
  { value: "por-cliente", label: "Estado de cuenta por cliente", description: "Documentos, pagos y deuda de un RUC o DNI específico." },
  { value: "por-sucursal", label: "Comparativo por sucursal", description: "Ventas netas, IGV, cobranza y participación de cada establecimiento." },
];

const labels: Record<string, string> = {
  total_facturado: "Total facturado", total_igv: "IGV", docs_emitidos: "Documentos emitidos", ticket_promedio: "Ticket promedio",
  nc_emitidas: "Notas de crédito", nd_emitidas: "Notas de débito", venta_neta: "Venta neta", total_cobrado: "Total cobrado",
  porcentaje_cobrado: "Cobrado", total_nc: "Total notas de crédito", cantidad_nc: "Notas de crédito", total_nd: "Total notas de débito",
  cantidad_nd: "Notas de débito", nc_netas: "Impacto neto", igv_revertido: "IGV revertido", base_gravada_reducida: "Base reducida",
  total_pendiente: "Saldo pendiente", porcentaje_cobranza: "Avance de cobranza", total_documentos: "Documentos", gran_total: "Total",
  neto: "Neto", cobrado: "Cobrado", pendiente: "Pendiente", total: "Documentos", monto_total: "Monto total", tasa_conversion: "Conversión",
};

const moneyKeys = /(monto|venta|facturado|igv|cobrado|pendiente|neto|ticket|base|gravada|exonerada|inafecta|gratuita|isc|icbper)/i;
const percentKeys = /(porcentaje|tasa)/i;
const money = (value: number) => new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(value);
const record = (value: unknown): JsonRecord => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
const rows = (value: unknown): JsonRecord[] => Array.isArray(value) ? value.filter((item): item is JsonRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];

function metricValue(key: string, value: number) {
  if (percentKeys.test(key)) return `${new Intl.NumberFormat("es-PE", { maximumFractionDigits: 1 }).format(value)}%`;
  if (moneyKeys.test(key)) return money(value);
  return new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(value);
}

function metricsFor(report: FiscalReportName, data?: JsonRecord): Metric[] {
  if (!data) return [];
  let source = record(data.kpis);
  if (!Object.keys(source).length) source = record(data.resumen);
  if (report === "registro-ventas") {
    const totals = record(data.gran_total);
    source = { total_documentos: data.total_documentos, venta_neta: data.venta_neta, total_igv: totals.mto_igv, gran_total: totals.mto_imp_venta };
  }
  if (report === "documentos-internos") {
    const quotations = record(data.cotizaciones);
    const saleNotes = record(data.notas_venta);
    source = { total: quotations.total, monto_total: quotations.monto_total, tasa_conversion: quotations.tasa_conversion, documentos_venta: saleNotes.total, cobrado: saleNotes.cobrado, pendiente: saleNotes.pendiente };
  }
  if (report === "por-sucursal") source = { sucursales: rows(data.comparativo).length, gran_total: data.gran_total };
  return Object.entries(source).filter((entry): entry is [string, number] => typeof entry[1] === "number").slice(0, 8).map(([key, value]) => ({ key, label: labels[key] ?? key.replaceAll("_", " "), value }));
}

function tableRows(report: FiscalReportName, data?: JsonRecord) {
  if (!data) return [];
  const source: Record<FiscalReportName, unknown> = {
    "registro-ventas": data.documentos,
    "ventas-consolidado": data.desglose_por_tipo,
    notas: data.resumen_por_motivo,
    cobranzas: data.detalle,
    "documentos-internos": data.top_clientes,
    "por-cliente": data.detalle_documentos,
    "por-sucursal": data.comparativo,
  };
  return rows(source[report]).map((item) => report === "por-sucursal" ? {
    ...item,
    facturas_cantidad: record(item.facturas).cantidad,
    boletas_cantidad: record(item.boletas).cantidad,
  } : item);
}

const cellMoney = (value: unknown) => typeof value === "number" ? money(value) : "—";
const cellDate = (value: unknown) => typeof value === "string" && value ? dayjs(value).format("DD/MM/YYYY") : "—";
const cellState = (value: unknown) => { const state = String(value ?? "—"); const color = state === "aceptado" || state === "pagado" ? "green" : state === "rechazado" ? "red" : state === "parcial" || state === "pendiente" ? "gold" : "blue"; return <Tag color={color}>{state}</Tag>; };

const reportColumns: Record<FiscalReportName, ColumnsType<JsonRecord>> = {
  "registro-ventas": [
    { title: "Fecha", dataIndex: "fecha_emision", width: 110, render: cellDate }, { title: "Tipo", dataIndex: "tipo_doc_nombre", width: 150 }, { title: "Número", dataIndex: "numero_completo", width: 130 },
    { title: "Cliente", dataIndex: "client_razon_social" }, { title: "IGV", dataIndex: "mto_igv", align: "right", render: cellMoney }, { title: "Total", dataIndex: "mto_imp_venta", align: "right", render: cellMoney }, { title: "SUNAT", dataIndex: "estado_sunat", render: cellState },
  ],
  "ventas-consolidado": [{ title: "Tipo", dataIndex: "nombre" }, { title: "Documentos", dataIndex: "cantidad", align: "right" }, { title: "Monto", dataIndex: "monto", align: "right", render: cellMoney }],
  notas: [{ title: "Código", dataIndex: "cod_motivo", width: 90 }, { title: "Motivo", dataIndex: "des_motivo" }, { title: "Notas", dataIndex: "cantidad", align: "right" }, { title: "Monto", dataIndex: "monto_total", align: "right", render: cellMoney }, { title: "IGV revertido", dataIndex: "igv_revertido", align: "right", render: cellMoney }],
  cobranzas: [{ title: "Documento", dataIndex: "numero_completo" }, { title: "Cliente", dataIndex: "client_razon_social" }, { title: "Vencimiento", dataIndex: "fecha_vencimiento", render: cellDate }, { title: "Total", dataIndex: "total", align: "right", render: cellMoney }, { title: "Pendiente", dataIndex: "pendiente", align: "right", render: cellMoney }, { title: "Pago", dataIndex: "estado_pago", render: cellState }],
  "documentos-internos": [{ title: "Documento", dataIndex: "num_doc" }, { title: "Cliente", dataIndex: "razon_social" }, { title: "Documentos", dataIndex: "cantidad", align: "right" }, { title: "Monto", dataIndex: "monto", align: "right", render: cellMoney }],
  "por-cliente": [{ title: "Fecha", dataIndex: "fecha_emision", render: cellDate }, { title: "Tipo", dataIndex: "tipo_nombre" }, { title: "Número", dataIndex: "numero_completo" }, { title: "Total", dataIndex: "mto_imp_venta", align: "right", render: cellMoney }, { title: "Pagado", dataIndex: "monto_pagado", align: "right", render: cellMoney }, { title: "SUNAT", dataIndex: "estado_sunat", render: cellState }],
  "por-sucursal": [{ title: "Sucursal", dataIndex: "nombre" }, { title: "Código", dataIndex: "cod_local" }, { title: "Facturas", dataIndex: "facturas_cantidad", align: "right" }, { title: "Boletas", dataIndex: "boletas_cantidad", align: "right" }, { title: "Venta neta", dataIndex: "neto", align: "right", render: cellMoney }, { title: "Pendiente", dataIndex: "pendiente", align: "right", render: cellMoney }, { title: "Participación", dataIndex: "porcentaje_total", align: "right", render: (value) => `${value ?? 0}%` }],
};

async function api<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo generar el reporte fiscal.");
  return payload.data;
}

export function FiscalReports() {
  const [report, setReport] = useState<FiscalReportName>("registro-ventas");
  const [period, setPeriod] = useState<[Dayjs, Dayjs]>([dayjs().startOf("month"), dayjs()]);
  const [sunatState, setSunatState] = useState("");
  const [paymentState, setPaymentState] = useState("");
  const [currency, setCurrency] = useState("");
  const [grouping, setGrouping] = useState("mes");
  const [clientDocument, setClientDocument] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const selected = reports.find((item) => item.value === report)!;
  const validClient = report !== "por-cliente" || /^\d{8,15}$/.test(clientDocument.trim());
  const buildUrl = (format: "json" | "pdf" | "excel") => {
    const params = new URLSearchParams({ from: period[0].format("YYYY-MM-DD"), to: period[1].format("YYYY-MM-DD"), format });
    if (sunatState) params.set("sunatState", sunatState);
    if (paymentState) params.set("paymentState", paymentState);
    if (currency) params.set("currency", currency);
    if (report === "ventas-consolidado") params.set("grouping", grouping);
    if (clientDocument.trim()) params.set("clientDocument", clientDocument.trim());
    if (report === "cobranzas" && overdue) params.set("overdue", "true");
    return `/api/v1/electronic-billing/reports/${report}?${params}`;
  };
  const preview = useQuery({ queryKey: ["fiscal-report", previewUrl], queryFn: () => api<JsonRecord>(previewUrl), enabled: Boolean(previewUrl) });
  const metrics = useMemo(() => metricsFor(report, preview.data), [report, preview.data]);
  const detail = useMemo(() => tableRows(report, preview.data), [report, preview.data]);

  return <Space direction="vertical" size="middle" style={{ width: "100%" }}>
    <Card className="section-card" title="Centro de reportes fiscales">
      <Typography.Paragraph type="secondary">Consulta los datos estructurados de la plataforma SUNAT y descarga el mismo reporte en PDF o Excel.</Typography.Paragraph>
      <Row gutter={[16, 12]}>
        <Col xs={24} lg={10}><Typography.Text strong>Reporte</Typography.Text><Select value={report} onChange={(value) => { setReport(value); setPreviewUrl(""); }} style={{ width: "100%", marginTop: 6 }} options={reports.map(({ value, label }) => ({ value, label }))} /></Col>
        <Col xs={24} sm={12} lg={7}><Typography.Text strong>Período</Typography.Text><DatePicker.RangePicker value={period} allowClear={false} format="DD/MM/YYYY" style={{ width: "100%", marginTop: 6 }} onChange={(value) => { if (value?.[0] && value[1]) { setPeriod([value[0], value[1]]); setPreviewUrl(""); } }} /></Col>
        <Col xs={24} sm={12} lg={7}><Typography.Text strong>Moneda</Typography.Text><Select allowClear value={currency || undefined} placeholder="Todas" onChange={(value) => setCurrency(value ?? "")} style={{ width: "100%", marginTop: 6 }} options={[{ value: "PEN", label: "Soles (PEN)" }, { value: "USD", label: "Dólares (USD)" }]} /></Col>
        {!["cobranzas", "documentos-internos", "por-cliente", "por-sucursal"].includes(report) ? <Col xs={24} sm={12} lg={6}><Typography.Text strong>Estado SUNAT</Typography.Text><Select allowClear value={sunatState || undefined} placeholder="Todos" onChange={(value) => setSunatState(value ?? "")} style={{ width: "100%", marginTop: 6 }} options={["pendiente", "enviado", "aceptado", "rechazado"].map((value) => ({ value, label: value }))} /></Col> : null}
        {report === "cobranzas" ? <><Col xs={24} sm={12} lg={6}><Typography.Text strong>Estado de pago</Typography.Text><Select allowClear value={paymentState || undefined} placeholder="Todos" onChange={(value) => setPaymentState(value ?? "")} style={{ width: "100%", marginTop: 6 }} options={["pendiente", "parcial", "pagado"].map((value) => ({ value, label: value }))} /></Col><Col xs={24} sm={12} lg={5}><Space style={{ marginTop: 28 }}><Switch checked={overdue} onChange={setOverdue} />Solo vencidos</Space></Col></> : null}
        {report === "ventas-consolidado" ? <Col xs={24} sm={12} lg={6}><Typography.Text strong>Agrupar por</Typography.Text><Select value={grouping} onChange={setGrouping} style={{ width: "100%", marginTop: 6 }} options={[{ value: "dia", label: "Día" }, { value: "semana", label: "Semana" }, { value: "mes", label: "Mes" }]} /></Col> : null}
        {report === "por-cliente" ? <Col xs={24} sm={12} lg={7}><Typography.Text strong>RUC o DNI del cliente</Typography.Text><Input value={clientDocument} maxLength={15} onChange={(event) => { setClientDocument(event.target.value.replace(/\D/g, "")); setPreviewUrl(""); }} status={clientDocument && !validClient ? "error" : undefined} placeholder="Documento del cliente" style={{ marginTop: 6 }} /></Col> : null}
      </Row>
      <Alert type="info" showIcon message={selected.label} description={selected.description} style={{ marginTop: 16 }} />
      <Space wrap style={{ marginTop: 16 }}>
        <Button type="primary" icon={<SearchOutlined />} disabled={!validClient} loading={preview.isFetching} onClick={() => setPreviewUrl(buildUrl("json"))}>Generar vista previa</Button>
        <Button icon={<FilePdfOutlined />} disabled={!validClient} href={validClient ? buildUrl("pdf") : undefined}>Descargar PDF</Button>
        <Button icon={<FileExcelOutlined />} disabled={!validClient} href={validClient ? buildUrl("excel") : undefined}>Descargar Excel</Button>
      </Space>
    </Card>

    {preview.error ? <Alert type="error" showIcon message={preview.error.message} /> : null}
    {preview.data ? <Card title={String(preview.data.titulo ?? selected.label)} loading={preview.isLoading}>
      {metrics.length ? <Row gutter={[16, 16]} style={{ marginBottom: 18 }}>{metrics.map((item) => <Col xs={24} sm={12} lg={6} key={item.key}><Statistic title={item.label} value={metricValue(item.key, item.value)} /></Col>)}</Row> : null}
      <Table<JsonRecord> size="small" rowKey={(item, index) => String(item.id ?? item.numero_completo ?? item.cod_local ?? item.cod_motivo ?? index)} columns={reportColumns[report]} dataSource={detail} scroll={{ x: 780 }} pagination={{ pageSize: 10, pageSizeOptions: [10, 25, 50] }} locale={{ emptyText: <Empty description="El reporte no contiene detalle para este período" /> }} />
    </Card> : null}
  </Space>;
}
