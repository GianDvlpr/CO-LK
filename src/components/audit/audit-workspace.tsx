"use client";

import { DownloadOutlined, EyeOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, DatePicker, Descriptions, Drawer, Empty, Input, Select, Space, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import "dayjs/locale/es";
import { useDeferredValue, useMemo, useState } from "react";
import { toast } from "sonner";
import { ModuleHeadingIntro } from "@/components/common/module-heading-intro";
import { ResponsiveTable as Table } from "@/components/common/responsive-table";
import { auditActionLabel, auditModuleLabel } from "@/modules/audit/domain/audit-catalog";

dayjs.locale("es");
const { RangePicker } = DatePicker;

type AuditItem = {
  id: string; module: string | null; entity: string; entityId: string; action: string; result: string;
  beforeData: unknown; afterData: unknown; ipAddress: string | null; userAgent: string | null; requestPath: string | null; createdAt: string;
  user: { id: string; name: string; username: string } | null;
};
type AuditResponse = {
  items: AuditItem[];
  pagination: { page: number; pageSize: number; total: number };
  summary: { today: number; activeUsers: number; filtered: number };
  facets: {
    users: { id: string; name: string; username: string }[];
    modules: { value: string; label: string; count: number }[];
    actions: { value: string; label: string; count: number }[];
  };
};

async function api<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo consultar la auditoría.");
  return payload.data;
}

function detail(value: unknown) {
  if (value === null || value === undefined) return <Typography.Text type="secondary">Sin información</Typography.Text>;
  return <pre className="audit-json">{JSON.stringify(value, null, 2)}</pre>;
}

function actionColor(action: string) {
  if (action === "DELETE" || action === "REJECT" || action === "REVOKE") return "red";
  if (action === "CREATE" || action === "APPROVE" || action === "COMPLETE") return "green";
  if (action === "UPDATE" || action.startsWith("STATUS_")) return "blue";
  if (action === "EXPORT" || action === "PRINT") return "purple";
  if (action === "ACCESS") return "cyan";
  return "default";
}

export function AuditWorkspace() {
  const [dates, setDates] = useState<[Dayjs | null, Dayjs | null] | null>([dayjs().subtract(29, "day"), dayjs()]);
  const [module, setModule] = useState<string>();
  const [action, setAction] = useState<string>();
  const [userId, setUserId] = useState<string>();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditItem | null>(null);
  const [downloading, setDownloading] = useState(false);

  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), pageSize: "25", search: deferredSearch });
    if (dates?.[0]) value.set("from", dates[0].format("YYYY-MM-DD"));
    if (dates?.[1]) value.set("to", dates[1].format("YYYY-MM-DD"));
    if (module) value.set("module", module);
    if (action) value.set("action", action);
    if (userId) value.set("userId", userId);
    return value;
  }, [action, dates, deferredSearch, module, page, userId]);

  const audit = useQuery({ queryKey: ["audit", params.toString()], queryFn: () => api<AuditResponse>(`/api/v1/audit?${params}`) });
  const resetPage = () => setPage(1);
  const download = async () => {
    setDownloading(true);
    try {
      const exportParams = new URLSearchParams(params); exportParams.set("format", "xlsx"); exportParams.delete("page"); exportParams.delete("pageSize");
      const response = await fetch(`/api/v1/audit?${exportParams}`);
      if (!response.ok) { const payload = await response.json(); throw new Error(payload.error?.message ?? "No se pudo descargar el reporte."); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `auditoria-${dayjs().format("YYYY-MM-DD")}.xlsx`; anchor.click(); URL.revokeObjectURL(url);
      toast.success("Reporte de auditoría descargado.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo descargar el reporte."); }
    finally { setDownloading(false); }
  };

  const columns: ColumnsType<AuditItem> = [
    { title: "Fecha y hora", dataIndex: "createdAt", width: 165, render: (value: string) => <span>{dayjs(value).format("DD/MM/YYYY HH:mm:ss")}</span> },
    { title: "Usuario", width: 190, render: (_, row) => row.user ? <><strong>{row.user.name}</strong><br /><Typography.Text type="secondary">@{row.user.username}</Typography.Text></> : <Typography.Text type="secondary">Sistema</Typography.Text> },
    { title: "Módulo", dataIndex: "module", width: 145, render: (value: string | null) => <Tag>{auditModuleLabel(value)}</Tag> },
    { title: "Acción", dataIndex: "action", width: 190, render: (value: string) => <Tag color={actionColor(value)}>{auditActionLabel(value)}</Tag> },
    { title: "Registro", width: 210, render: (_, row) => <><strong>{row.entity}</strong><br /><Typography.Text copyable={{ text: row.entityId }} ellipsis={{ tooltip: row.entityId }} style={{ maxWidth: 180 }}>{row.entityId}</Typography.Text></> },
    { title: "IP", dataIndex: "ipAddress", width: 145, render: (value: string | null) => <Typography.Text code>{value && value !== "unknown" ? value : "No disponible"}</Typography.Text> },
    { title: "Resultado", dataIndex: "result", width: 105, render: (value: string) => <Tag color={value === "SUCCESS" ? "green" : "red"}>{value === "SUCCESS" ? "Correcto" : "Fallido"}</Tag> },
    { title: "Detalle", width: 90, align: "center", render: (_, row) => <Button type="text" icon={<EyeOutlined />} aria-label="Ver detalle" onClick={() => setSelected(row)} /> },
  ];

  return <>
    <div className="page-heading">
      <ModuleHeadingIntro title="Auditoría" eyebrow="Seguridad" description="Trazabilidad de accesos, registros, cambios, eliminaciones, cargas, descargas y acciones operativas por usuario." />
      <Space wrap className="module-actions">
        <Button icon={<ReloadOutlined />} loading={audit.isFetching} onClick={() => audit.refetch()}>Actualizar</Button>
        <Button type="primary" icon={<DownloadOutlined />} loading={downloading} onClick={download}>Descargar Excel</Button>
      </Space>
    </div>
    <div className="session-overview" aria-label="Resumen de auditoría">
      <span><strong>{audit.data?.summary.today ?? 0}</strong> acciones hoy</span>
      <span><strong>{audit.data?.summary.activeUsers ?? 0}</strong> usuarios hoy</span>
      <span><strong>{audit.data?.summary.filtered ?? 0}</strong> resultados filtrados</span>
    </div>
    <Card className="section-card" title="Actividad de usuarios">
      <div className="audit-toolbar">
        <RangePicker value={dates} onChange={(value) => { setDates(value); resetPage(); }} format="DD/MM/YYYY" allowClear />
        <Select allowClear showSearch optionFilterProp="label" value={userId} placeholder="Todos los usuarios" onChange={(value) => { setUserId(value); resetPage(); }} options={(audit.data?.facets.users ?? []).map((item) => ({ value: item.id, label: `${item.name} (@${item.username})` }))} />
        <Select allowClear showSearch optionFilterProp="label" value={module} placeholder="Todos los módulos" onChange={(value) => { setModule(value); resetPage(); }} options={(audit.data?.facets.modules ?? []).map((item) => ({ value: item.value, label: `${item.label} (${item.count})` }))} />
        <Select allowClear showSearch optionFilterProp="label" value={action} placeholder="Todas las acciones" onChange={(value) => { setAction(value); resetPage(); }} options={(audit.data?.facets.actions ?? []).map((item) => ({ value: item.value, label: `${item.label} (${item.count})` }))} />
        <Input allowClear prefix={<SearchOutlined />} value={search} onChange={(event) => { setSearch(event.target.value); resetPage(); }} placeholder="Buscar registro, ruta, IP o usuario" />
      </div>
      {audit.error ? <Alert type="error" showIcon message={audit.error.message} style={{ marginBottom: 16 }} /> : null}
      <Table rowKey="id" loading={audit.isLoading} columns={columns} dataSource={audit.data?.items ?? []} scroll={{ x: 1240 }} pagination={{ current: page, pageSize: 25, total: audit.data?.pagination.total ?? 0, showSizeChanger: false, onChange: setPage, showTotal: (total) => `${total} eventos` }} locale={{ emptyText: <Empty description="No hay actividad para estos filtros" /> }} />
    </Card>
    <Drawer title="Detalle de la actividad" width={620} open={Boolean(selected)} onClose={() => setSelected(null)}>
      {selected ? <Space direction="vertical" size={18} style={{ width: "100%" }}>
        <Descriptions bordered size="small" column={1}>
          <Descriptions.Item label="Fecha">{dayjs(selected.createdAt).format("DD/MM/YYYY HH:mm:ss")}</Descriptions.Item>
          <Descriptions.Item label="Usuario">{selected.user ? `${selected.user.name} (@${selected.user.username})` : "Sistema"}</Descriptions.Item>
          <Descriptions.Item label="Acción">{auditActionLabel(selected.action)}</Descriptions.Item>
          <Descriptions.Item label="Módulo">{auditModuleLabel(selected.module)}</Descriptions.Item>
          <Descriptions.Item label="Registro">{selected.entity} · {selected.entityId}</Descriptions.Item>
          <Descriptions.Item label="IP">{selected.ipAddress && selected.ipAddress !== "unknown" ? selected.ipAddress : "No disponible"}</Descriptions.Item>
          <Descriptions.Item label="Ruta">{selected.requestPath ?? "No disponible"}</Descriptions.Item>
          <Descriptions.Item label="Navegador">{selected.userAgent ?? "No disponible"}</Descriptions.Item>
        </Descriptions>
        <div><Typography.Title level={5}>Antes</Typography.Title>{detail(selected.beforeData)}</div>
        <div><Typography.Title level={5}>Después</Typography.Title>{detail(selected.afterData)}</div>
      </Space> : null}
    </Drawer>
  </>;
}
