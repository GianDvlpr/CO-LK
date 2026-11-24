"use client";

import { ClockCircleOutlined, EyeOutlined, RedoOutlined, ReloadOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Col, Empty, Row, Space, Statistic, Table, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";

export type FiscalAttentionDocument = {
  id: string;
  kind: string;
  status: string;
  remoteId?: string;
  number?: string;
  series?: string;
  correlativo?: string;
  remoteStatus?: string;
  sunatCode?: string;
  sunatDescription?: string;
  lastError?: string;
  attempts?: number;
  createdAt: string;
  submittedAt?: string;
  lastCheckedAt?: string;
  sale?: { number: string; customer: { name: string } } | null;
};

const labels: Record<string, string> = { INVOICE: "Factura", RECEIPT: "Boleta", CREDIT_NOTE: "Nota de crédito", DEBIT_NOTE: "Nota de débito", SENDER_GUIDE: "Guía remitente", CARRIER_GUIDE: "Guía transportista", RETENTION: "Retención", PERCEPTION: "Percepción", PURCHASE_SETTLEMENT: "Liquidación", DAILY_SUMMARY: "Resumen diario", VOIDED_DOCUMENT: "Baja", REVERSION: "Reversión" };
const statusLabels: Record<string, [string, string]> = { SUBMITTING: ["Enviando", "processing"], PENDING: ["Pendiente", "gold"], SENT: ["Enviado", "blue"], PROCESSING: ["Procesando", "processing"], REJECTED: ["Rechazado", "red"], ERROR: ["Error", "red"] };
const attentionStatuses = ["SUBMITTING", "PENDING", "SENT", "PROCESSING", "REJECTED", "ERROR"];

function elapsed(value: string) {
  const hours = Math.max(0, dayjs().diff(dayjs(value), "hour"));
  if (hours < 1) return "Menos de una hora";
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

export function FiscalAttentionInbox({ documents, loading, canResend, refreshingId, resendingId, onRefresh, onResend, onOpen, onReload }: {
  documents: FiscalAttentionDocument[];
  loading: boolean;
  canResend: boolean;
  refreshingId?: string;
  resendingId?: string;
  onRefresh: (id: string) => void;
  onResend: (id: string) => void;
  onOpen: (id: string) => void;
  onReload: () => void;
}) {
  const items = documents.filter((item) => attentionStatuses.includes(item.status));
  const pending = items.filter((item) => ["SUBMITTING", "PENDING", "SENT", "PROCESSING"].includes(item.status)).length;
  const rejected = items.filter((item) => item.status === "REJECTED").length;
  const errors = items.filter((item) => item.status === "ERROR").length;
  const columns: ColumnsType<FiscalAttentionDocument> = [
    { title: "Prioridad", width: 115, render: (_, item) => ["REJECTED", "ERROR"].includes(item.status) ? <Tag color="red" icon={<WarningOutlined />}>Alta</Tag> : <Tag color="gold" icon={<ClockCircleOutlined />}>Seguimiento</Tag> },
    { title: "Documento", width: 190, render: (_, item) => <><strong>{labels[item.kind] ?? item.kind}</strong><br /><Typography.Text type="secondary">{item.number ?? (item.series ? `${item.series}-${item.correlativo ?? "pendiente"}` : "Sin numeración")}</Typography.Text></> },
    { title: "Cliente / origen", width: 190, render: (_, item) => item.sale ? <>{item.sale.customer.name}<br /><Typography.Text type="secondary">{item.sale.number}</Typography.Text></> : "Registro fiscal" },
    { title: "Estado", width: 145, render: (_, item) => { const [label, color] = statusLabels[item.status] ?? [item.status, "default"]; return <><Tag color={color}>{label}</Tag>{item.remoteStatus ? <Typography.Text type="secondary" style={{ display: "block" }}>{item.remoteStatus}</Typography.Text> : null}</>; } },
    { title: "Motivo", render: (_, item) => <><Typography.Text type={["REJECTED", "ERROR"].includes(item.status) ? "danger" : undefined}>{item.lastError ?? item.sunatDescription ?? "Esperando respuesta de SUNAT"}</Typography.Text>{item.sunatCode ? <Tag style={{ marginLeft: 6 }}>{item.sunatCode}</Tag> : null}</> },
    { title: "Antigüedad", width: 125, render: (_, item) => <Tooltip title={dayjs(item.submittedAt ?? item.createdAt).format("DD/MM/YYYY HH:mm")}><span>{elapsed(item.submittedAt ?? item.createdAt)}</span></Tooltip> },
    { title: "Intentos", dataIndex: "attempts", width: 80, align: "right", render: (value) => value ?? 0 },
    { title: "Acciones", width: 250, render: (_, item) => <Space wrap>
      {item.remoteId ? <Button size="small" icon={<EyeOutlined />} onClick={() => onOpen(item.id)}>Detalle</Button> : null}
      {item.remoteId ? <Button size="small" icon={<ReloadOutlined />} loading={refreshingId === item.id} onClick={() => onRefresh(item.id)}>Consultar</Button> : null}
      {item.remoteId && canResend && ["PENDING", "REJECTED", "ERROR"].includes(item.status) ? <Button size="small" danger={item.status !== "PENDING"} icon={<RedoOutlined />} loading={resendingId === item.id} onClick={() => onResend(item.id)}>Reenviar</Button> : null}
    </Space> },
  ];

  return <Space direction="vertical" size="middle" style={{ width: "100%" }}>
    <Alert type={rejected + errors > 0 ? "warning" : "info"} showIcon message={rejected + errors > 0 ? "Hay comprobantes que requieren corrección o reenvío." : "No hay rechazos ni errores activos."} description="Consulta primero la respuesta de SUNAT. Reenvía únicamente cuando el documento siga pendiente o el problema ya haya sido corregido." action={<Button size="small" icon={<ReloadOutlined />} onClick={onReload}>Actualizar bandeja</Button>} />
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={8}><Card><Statistic title="En proceso o pendientes" value={pending} valueStyle={{ color: pending ? "#d97706" : undefined }} /></Card></Col>
      <Col xs={24} sm={8}><Card><Statistic title="Rechazados" value={rejected} valueStyle={{ color: rejected ? "#cf1322" : undefined }} /></Card></Col>
      <Col xs={24} sm={8}><Card><Statistic title="Errores de integración" value={errors} valueStyle={{ color: errors ? "#cf1322" : undefined }} /></Card></Col>
    </Row>
    <Card className="section-card" title="Bandeja de pendientes y rechazados" extra={<Tag>{items.length} por atender</Tag>}>
      <Table rowKey="id" loading={loading} columns={columns} dataSource={items} scroll={{ x: 1250 }} pagination={{ pageSize: 12, pageSizeOptions: [12, 24, 48] }} locale={{ emptyText: <Empty description="No hay comprobantes pendientes, rechazados o con error" /> }} />
    </Card>
  </Space>;
}
