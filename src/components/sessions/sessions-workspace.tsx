"use client";

import { DisconnectOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Empty, Input, Modal, Select, Space, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/es";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ModuleHeadingIntro } from "@/components/common/module-heading-intro";
import { ResponsiveTable as Table } from "@/components/common/responsive-table";
import { describeUserAgent, type SessionEndReasonValue } from "@/modules/auth/application/session-monitoring";

dayjs.extend(relativeTime);
dayjs.locale("es");

type SessionItem = {
  id: string;
  current: boolean;
  status: "ACTIVE" | "CLOSED";
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  endedAt: string | null;
  effectiveEndedAt: string | null;
  effectiveEndReason: SessionEndReasonValue | null;
  endedBy: { name: string; username: string } | null;
  user: { id: string; name: string; username: string };
};

type SessionsResponse = {
  items: SessionItem[];
  pagination: { page: number; pageSize: number; total: number };
  summary: { active: number; activeUsers: number; signedInToday: number; closedToday: number };
};

const endReasonLabels: Record<SessionEndReasonValue, string> = {
  LOGOUT: "Cierre normal",
  REVOKED: "Cierre remoto",
  PASSWORD_RESET: "Contraseña restablecida",
  ACCOUNT_DISABLED: "Cuenta desactivada",
  EXPIRED: "Sesión vencida",
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo completar la operación.");
  return payload.data;
}

function formatDuration(start: string, end: string | null, now: number) {
  const startMs = dayjs(start).valueOf();
  const endMs = end ? dayjs(end).valueOf() : now;
  const totalMinutes = Math.max(0, Math.floor((endMs - startMs) / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days) return `${days} d ${hours} h`;
  if (hours) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

function exactDate(value: string) {
  return dayjs(value).format("DD/MM/YYYY HH:mm:ss");
}

export function SessionsWorkspace({ canRevoke }: { canRevoke: boolean }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"all" | "active" | "closed">("all");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const params = useMemo(() => new URLSearchParams({ status, search: deferredSearch, page: String(page), pageSize: "25" }).toString(), [status, deferredSearch, page]);
  const sessions = useQuery({
    queryKey: ["sessions", status, deferredSearch, page],
    queryFn: () => api<SessionsResponse>(`/api/v1/sessions?${params}`),
    refetchInterval: 30_000,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/api/v1/sessions/${id}/revoke`, { method: "POST" }),
    onSuccess: async () => {
      toast.success("La sesión fue cerrada. El usuario deberá volver a iniciar sesión.");
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const columns: ColumnsType<SessionItem> = [
    {
      title: "Usuario",
      width: 220,
      render: (_, row) => <><strong>{row.user.name}</strong><br /><Typography.Text type="secondary">@{row.user.username}</Typography.Text>{row.current ? <Tag color="blue" className="session-current-tag">Esta sesión</Tag> : null}</>,
    },
    {
      title: "Estado",
      width: 105,
      render: (_, row) => row.status === "ACTIVE" ? <Tag color="green">Activa</Tag> : <Tag>Cerrada</Tag>,
    },
    {
      title: "Inicio",
      dataIndex: "createdAt",
      width: 165,
      render: (value: string) => <Tooltip title={exactDate(value)}><span>{dayjs(value).format("DD/MM/YYYY HH:mm")}</span></Tooltip>,
    },
    {
      title: "Última actividad",
      dataIndex: "lastSeenAt",
      width: 150,
      render: (value: string) => <Tooltip title={exactDate(value)}><span>{dayjs(value).fromNow()}</span></Tooltip>,
    },
    {
      title: "Duración",
      width: 115,
      render: (_, row) => <strong>{formatDuration(row.createdAt, row.effectiveEndedAt, now)}</strong>,
    },
    {
      title: "IP",
      dataIndex: "ipAddress",
      width: 155,
      render: (value: string | null) => <Typography.Text code>{value && value !== "unknown" ? value : "No disponible"}</Typography.Text>,
    },
    {
      title: "Dispositivo",
      width: 190,
      render: (_, row) => <Tooltip title={row.userAgent || "El navegador no informó este dato."}><span>{describeUserAgent(row.userAgent)}</span></Tooltip>,
    },
    {
      title: "Cierre",
      width: 230,
      render: (_, row) => row.effectiveEndedAt ? <><span>{dayjs(row.effectiveEndedAt).format("DD/MM/YYYY HH:mm")}</span><br /><Typography.Text type="secondary">{row.effectiveEndReason ? endReasonLabels[row.effectiveEndReason] : "Finalizada"}{row.endedBy ? ` por @${row.endedBy.username}` : ""}</Typography.Text></> : <Typography.Text type="secondary">Vence {dayjs(row.expiresAt).fromNow()}</Typography.Text>,
    },
    {
      title: "Acción",
      width: 125,
      render: (_, row) => canRevoke && row.status === "ACTIVE" && !row.current ? <Button danger size="small" icon={<DisconnectOutlined />} loading={revoke.isPending} onClick={() => Modal.confirm({ title: `¿Cerrar la sesión de ${row.user.name}?`, content: "El acceso se invalidará en su siguiente solicitud y deberá iniciar sesión nuevamente.", okText: "Cerrar sesión", cancelText: "Cancelar", okButtonProps: { danger: true }, onOk: () => revoke.mutateAsync(row.id) })}>Cerrar</Button> : row.current ? <Typography.Text type="secondary">Sesión actual</Typography.Text> : null,
    },
  ];

  const summary = sessions.data?.summary;
  return <>
    <div className="page-heading">
      <ModuleHeadingIntro title="Sesiones" eyebrow="Seguridad" description="Consulta accesos, duración, IP aproximada, dispositivo y cierres. La última actividad se actualiza como máximo cada dos minutos." />
      <Space wrap className="module-actions"><Button icon={<ReloadOutlined />} loading={sessions.isFetching} onClick={() => sessions.refetch()}>Actualizar</Button></Space>
    </div>
    <div className="session-overview" aria-label="Resumen de sesiones">
      <span><strong>{summary?.active ?? 0}</strong> activas</span>
      <span><strong>{summary?.activeUsers ?? 0}</strong> usuarios conectados</span>
      <span><strong>{summary?.signedInToday ?? 0}</strong> iniciadas hoy</span>
      <span><strong>{summary?.closedToday ?? 0}</strong> cerradas hoy</span>
    </div>
    <Card className="section-card" title="Actividad de acceso">
      <div className="session-toolbar">
        <Input allowClear value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} prefix={<SearchOutlined />} placeholder="Buscar usuario o IP" />
        <Select value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={[{ value: "all", label: "Todas las sesiones" }, { value: "active", label: "Solo activas" }, { value: "closed", label: "Solo cerradas" }]} />
      </div>
      {sessions.error ? <Alert type="error" showIcon message={sessions.error.message} style={{ marginBottom: 16 }} /> : null}
      <Table
        rowKey="id"
        loading={sessions.isLoading}
        columns={columns}
        dataSource={sessions.data?.items ?? []}
        scroll={{ x: 1450 }}
        pagination={{ current: page, pageSize: 25, total: sessions.data?.pagination.total ?? 0, showSizeChanger: false, onChange: setPage, showTotal: (total) => `${total} sesiones` }}
        locale={{ emptyText: <Empty description="No hay sesiones para este filtro" /> }}
      />
    </Card>
  </>;
}
