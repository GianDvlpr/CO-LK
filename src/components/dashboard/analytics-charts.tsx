"use client";

import { Empty } from "antd";
import dayjs from "dayjs";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useUiStore } from "@/stores/ui-store";

export type ActivityPoint = { date: string; purchases: number; orders: number; production: number };
export type ChartSlice = { name: string; value: number; color: string };
export type BarDatum = { label: string; value: number; fullName?: string };

export const money = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 });

export function truncateLabel(value: string, maxLength = 26) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

const STATUS_LABELS: Record<string, string> = { DRAFT: "Borrador", PENDING: "Pendiente", APPROVED: "Aprobado", REJECTED: "Rechazado", CANCELLED: "Cancelado", CONFIRMED: "Confirmado", IN_PRODUCTION: "En producción", READY: "Listo", DISPATCHED: "Despachado", RELEASED: "Liberada", IN_PROGRESS: "En proceso", COMPLETED: "Completada" };
const STATUS_COLORS: Record<string, string> = { DRAFT: "#2563eb", PENDING: "#d97706", APPROVED: "#16a34a", REJECTED: "#dc2626", CANCELLED: "#64748b", CONFIRMED: "#0ea5e9", IN_PRODUCTION: "#7c3aed", READY: "#0d9488", DISPATCHED: "#16a34a", RELEASED: "#f59e0b", IN_PROGRESS: "#2563eb", COMPLETED: "#16a34a" };

export function statusSlices(statuses: Record<string, number>): ChartSlice[] {
  return Object.entries(statuses).filter(([, value]) => value > 0).map(([key, value]) => ({ name: STATUS_LABELS[key] ?? key, value, color: STATUS_COLORS[key] ?? "#64748b" }));
}

function useChartTheme() {
  const mode = useUiStore((state) => state.themeMode);
  const dark = mode === "dark";
  return {
    axis: dark ? "#9fb3ab" : "#52606d",
    grid: dark ? "#2a3b34" : "#e5e7eb",
    tooltip: { backgroundColor: dark ? "#122019" : "#ffffff", border: `1px solid ${dark ? "#2a3b34" : "#e5e7eb"}`, borderRadius: 8, color: dark ? "#e6f0ea" : "#1f2937", fontSize: 12 },
  };
}

export function ActivityLineChart({ data }: { data: ActivityPoint[] }) {
  const theme = useChartTheme();
  if (!data.length || data.every((point) => !point.purchases && !point.orders && !point.production)) return <Empty description="Sin actividad en el periodo" />;
  return <ResponsiveContainer width="100%" height={280}>
    <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
      <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
      <XAxis dataKey="date" tickFormatter={(value) => dayjs(String(value)).format("DD/MM")} stroke={theme.axis} fontSize={12} minTickGap={24} />
      <YAxis allowDecimals={false} stroke={theme.axis} fontSize={12} />
      <Tooltip labelFormatter={(value) => dayjs(String(value)).format("DD/MM/YYYY")} contentStyle={theme.tooltip} />
      <Legend />
      <Line type="monotone" dataKey="purchases" name="Compras" stroke="#1d6f55" strokeWidth={2} dot={false} />
      <Line type="monotone" dataKey="orders" name="Pedidos" stroke="#d97706" strokeWidth={2} dot={false} />
      <Line type="monotone" dataKey="production" name="Producción" stroke="#2563eb" strokeWidth={2} dot={false} />
    </LineChart>
  </ResponsiveContainer>;
}

export function DonutChart({ data, valueFormatter }: { data: ChartSlice[]; valueFormatter?: (value: number) => string }) {
  const theme = useChartTheme();
  const slices = data.filter((slice) => slice.value > 0);
  if (!slices.length) return <Empty description="Sin datos en el periodo" />;
  return <ResponsiveContainer width="100%" height={260}>
    <PieChart>
      <Pie data={slices} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={2} stroke="none">
        {slices.map((slice) => <Cell key={slice.name} fill={slice.color} />)}
      </Pie>
      <Tooltip formatter={(value) => (valueFormatter ? valueFormatter(Number(value)) : Number(value))} contentStyle={theme.tooltip} />
      <Legend verticalAlign="bottom" height={36} />
    </PieChart>
  </ResponsiveContainer>;
}

export function VerticalBarChart({ data, valueFormatter, color = "#1d6f55" }: { data: BarDatum[]; valueFormatter?: (value: number) => string; color?: string }) {
  const theme = useChartTheme();
  if (!data.length) return <Empty description="Sin datos en el periodo" />;
  return <ResponsiveContainer width="100%" height={260}>
    <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
      <XAxis dataKey="label" stroke={theme.axis} fontSize={12} tickLine={false} />
      <YAxis stroke={theme.axis} fontSize={12} tickFormatter={(value) => (valueFormatter ? valueFormatter(Number(value)) : String(value))} />
      <Tooltip formatter={(value) => (valueFormatter ? valueFormatter(Number(value)) : Number(value))} labelFormatter={(label, payload) => String((payload?.[0]?.payload as BarDatum | undefined)?.fullName ?? label)} contentStyle={theme.tooltip} />
      <Bar dataKey="value" fill={color} radius={[6, 6, 0, 0]} />
    </BarChart>
  </ResponsiveContainer>;
}

export function HorizontalBarChart({ data, valueFormatter, color = "#1d6f55" }: { data: BarDatum[]; valueFormatter?: (value: number) => string; color?: string }) {
  const theme = useChartTheme();
  if (!data.length) return <Empty description="Sin datos en el periodo" />;
  return <ResponsiveContainer width="100%" height={Math.max(240, data.length * 40)}>
    <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
      <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} horizontal={false} />
      <XAxis type="number" stroke={theme.axis} fontSize={12} />
      <YAxis type="category" dataKey="label" width={170} stroke={theme.axis} fontSize={12} tickLine={false} tickFormatter={(value) => truncateLabel(String(value), 26)} />
      <Tooltip formatter={(value) => (valueFormatter ? valueFormatter(Number(value)) : Number(value))} labelFormatter={(label, payload) => String((payload?.[0]?.payload as BarDatum | undefined)?.fullName ?? label)} contentStyle={theme.tooltip} />
      <Bar dataKey="value" fill={color} radius={[0, 6, 6, 0]} />
    </BarChart>
  </ResponsiveContainer>;
}
