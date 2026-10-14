"use client";

import { CloudDownloadOutlined, DollarOutlined, ReloadOutlined, SyncOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Empty, Popover, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { toast } from "sonner";

type Rate = { id: string; date: string; buyRate: number | null; sellRate: number; source: string | null; variation: number | null };
type Overview = { current: Rate | null; rows: Rate[]; stats: { min: number | null; max: number | null; average: number | null } };
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  let payload: { data?: T; error?: { message?: string } } | null = null;
  try { payload = text ? JSON.parse(text) : null; } catch { /* A proxy or upstream may return a non-JSON error page. */ }
  if (!response.ok || !payload) throw new Error(payload?.error?.message ?? "No se pudo consultar el tipo de cambio. Intenta nuevamente.");
  return payload.data as T;
}

export function ExchangeRateIndicator({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const rates = useQuery({ queryKey: ["exchange-rates", 30], queryFn: () => api<Overview>("/api/v1/exchange-rates?days=30"), staleTime: 30 * 60 * 1000, refetchInterval: 60 * 60 * 1000 });
  const sync = useMutation({ mutationFn: (action: "TODAY" | "HISTORY") => api("/api/v1/exchange-rates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, days: 90 }) }), onSuccess: async (_, action) => { toast.success(action === "TODAY" ? "Tipo de cambio actualizado." : "Histórico BCRP actualizado."); await queryClient.invalidateQueries({ queryKey: ["exchange-rates"] }); }, onError: (error) => toast.error(error.message) });
  const current = rates.data?.current;
  const columns: ColumnsType<Rate> = [
    { title: "Fecha", dataIndex: "date", width: 95, render: (value) => dayjs(value).format("DD/MM/YYYY") },
    { title: "Compra", dataIndex: "buyRate", width: 78, align: "right", render: (value) => value === null ? "—" : Number(value).toFixed(3) },
    { title: "Venta", dataIndex: "sellRate", width: 78, align: "right", render: (value) => <strong>{Number(value).toFixed(3)}</strong> },
    { title: "Var.", dataIndex: "variation", width: 70, align: "right", render: (value) => value === null ? "—" : <Typography.Text type={value > 0 ? "danger" : value < 0 ? "success" : "secondary"}>{value > 0 ? "+" : ""}{Number(value).toFixed(3)}</Typography.Text> },
  ];
  const content = <div className="exchange-rate-popover">
    <div className="exchange-rate-popover-heading"><div><Typography.Text strong>Histórico del dólar</Typography.Text><br /><Typography.Text type="secondary">Compra / venta en soles por USD</Typography.Text></div><Button type="text" icon={<ReloadOutlined />} loading={rates.isFetching} onClick={() => rates.refetch()} /></div>
    {rates.data?.rows.length ? <Table size="small" rowKey="id" columns={columns} dataSource={rates.data.rows} pagination={{ pageSize: 7, size: "small", showSizeChanger: false }} scroll={{ x: 330 }} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Aún no hay tipos de cambio registrados" />}
    {rates.data?.stats.average !== null && rates.data?.stats.average !== undefined ? <Space wrap className="exchange-rate-stats"><Tag>Mín. {rates.data.stats.min?.toFixed(3)}</Tag><Tag>Prom. {rates.data.stats.average.toFixed(3)}</Tag><Tag>Máx. {rates.data.stats.max?.toFixed(3)}</Tag></Space> : null}
    {canManage ? <Space wrap style={{ marginTop: 12 }}><Button icon={<SyncOutlined />} loading={sync.isPending} onClick={() => sync.mutate("TODAY")}>Sincronizar hoy</Button><Button icon={<CloudDownloadOutlined />} loading={sync.isPending} onClick={() => sync.mutate("HISTORY")}>Cargar 90 días</Button></Space> : null}
  </div>;
  return <Popover content={content} title={null} trigger="click" placement="bottomRight" classNames={{ root: "exchange-rate-overlay" }}>
    <Button type="text" className="exchange-rate-indicator" loading={rates.isLoading} icon={<DollarOutlined />}>
      <span><small>TC USD</small><strong>{current ? `${current.buyRate?.toFixed(3) ?? "—"} / ${current.sellRate.toFixed(3)}` : "Sin TC"}</strong></span>
    </Button>
  </Popover>;
}
