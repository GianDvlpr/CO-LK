"use client";

import { CalculatorOutlined, EditOutlined, ReloadOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Empty, Form, Input, InputNumber, Modal, Space, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import Decimal from "decimal.js";
import { useState } from "react";
import { toast } from "sonner";
import { ModuleHeadingIntro } from "@/components/common/module-heading-intro";
import { ResponsiveTable as Table } from "@/components/common/responsive-table";
import { TableSearch, matchesSearch } from "@/components/common/table-search";

type CostRow = {
  recipeId: string;
  recipeVersionId: string;
  recipeCode: string;
  recipeName: string;
  recipeStatus: string;
  version: number;
  isActive: boolean;
  destinationCode: string;
  destinationName: string;
  yieldQuantity: string;
  yieldUnit: string;
  materialCost: string;
  laborTariff: string;
  energyTariff: string;
  waterTariff: string;
  machineryCost: string;
  directCost: string;
  batchCost: string;
  unitCost: string;
  notes: string | null;
  updatedAt: string | null;
};

type CostForm = {
  laborTariff: number;
  energyTariff: number;
  waterTariff: number;
  machineryCost: number;
  notes?: string;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo completar la operación.");
  return payload.data;
}

const money = (value: string) => `S/ ${new Decimal(value || 0).toFixed(2)}`;

export function CostStructuresWorkspace({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CostRow>();
  const [form] = Form.useForm<CostForm>();
  const costs = useQuery({ queryKey: ["cost-structures"], queryFn: () => api<{ items: CostRow[] }>("/api/v1/costs") });
  const save = useMutation({
    mutationFn: (values: CostForm) => api("/api/v1/costs", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipeVersionId: editing?.recipeVersionId, ...values }) }),
    onSuccess: async () => {
      toast.success("Estructura de costos actualizada.");
      setEditing(undefined);
      form.resetFields();
      await queryClient.invalidateQueries({ queryKey: ["cost-structures"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const rows = (costs.data?.items ?? []).filter((row) => matchesSearch(search, row.recipeCode, row.recipeName, row.destinationCode, row.destinationName));
  const openEdit = (row: CostRow) => {
    setEditing(row);
    form.setFieldsValue({ laborTariff: Number(row.laborTariff), energyTariff: Number(row.energyTariff), waterTariff: Number(row.waterTariff), machineryCost: Number(row.machineryCost), notes: row.notes ?? undefined });
  };

  const columns: ColumnsType<CostRow> = [
    { title: "Receta", width: 250, render: (_, row) => <><strong>{row.recipeCode}</strong><br /><span className="table-secondary">{row.recipeName} · v{row.version}</span></> },
    { title: "Producto / resultado", width: 260, render: (_, row) => <><strong>{row.destinationName}</strong><br /><span className="table-secondary">{row.destinationCode}</span></> },
    { title: "Rendimiento", width: 130, align: "right", render: (_, row) => `${new Decimal(row.yieldQuantity).toFixed(3)} ${row.yieldUnit}` },
    { title: "Materiales", width: 125, align: "right", render: (_, row) => money(row.materialCost) },
    { title: "Mano de obra", width: 135, align: "right", render: (_, row) => money(row.laborTariff) },
    { title: "Energía", width: 115, align: "right", render: (_, row) => money(row.energyTariff) },
    { title: "Agua", width: 105, align: "right", render: (_, row) => money(row.waterTariff) },
    { title: "Maquinaria", width: 125, align: "right", render: (_, row) => money(row.machineryCost) },
    { title: "Costo del lote", width: 140, align: "right", render: (_, row) => <strong>{money(row.batchCost)}</strong> },
    { title: "Costo unitario", width: 145, align: "right", render: (_, row) => <strong>{money(row.unitCost)}</strong> },
    { title: "Estado", width: 105, render: (_, row) => row.isActive ? <Tag color="green">Activa</Tag> : <Tag>Borrador</Tag> },
    ...(canManage ? [{ title: "Acciones", width: 110, fixed: "right" as const, render: (_: unknown, row: CostRow) => <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>Tarifas</Button> }] : []),
  ];

  return <>
    <div className="page-heading">
      <ModuleHeadingIntro title="Estructura de costos" eyebrow="Costeo" description="Calcula el costo por lote y por unidad usando materiales más cuatro importes directos: mano de obra, energía, agua y maquinaria." />
      <Space wrap className="module-actions"><TableSearch value={search} onChange={setSearch} placeholder="Buscar receta o producto" /><Tooltip title="Actualizar"><Button icon={<ReloadOutlined />} aria-label="Actualizar" onClick={() => costs.refetch()} /></Tooltip></Space>
    </div>
    <Alert type="info" showIcon icon={<CalculatorOutlined />} message="Las cuatro tarifas son importes totales por una ejecución completa de la receta. No se solicitan horas, kWh ni consumo de agua." style={{ marginBottom: 16 }} />
    <Card className="section-card" title="Costos por receta">
      {costs.error ? <Alert type="error" showIcon message={costs.error.message} style={{ marginBottom: 16 }} /> : null}
      <Table rowKey="recipeVersionId" loading={costs.isLoading} columns={columns} dataSource={rows} scroll={{ x: 1700 }} pagination={{ pageSize: 8, pageSizeOptions: [8, 16, 32] }} locale={{ emptyText: <Empty description="Aún no hay recetas para costear" /> }} />
    </Card>
    <Modal className="compact-form-modal" title={`Tarifas · ${editing?.destinationName ?? "producto"}`} open={Boolean(editing)} onCancel={() => setEditing(undefined)} onOk={() => form.submit()} okText="Guardar tarifas" confirmLoading={save.isPending} width={760} destroyOnHidden>
      <Typography.Paragraph type="secondary">Ingresa el importe en soles correspondiente al lote completo de {editing ? `${new Decimal(editing.yieldQuantity).toFixed(3)} ${editing.yieldUnit}` : "la receta"}. El costo de materiales se obtiene automáticamente del almacén.</Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={(values) => save.mutate(values)} initialValues={{ laborTariff: 0, energyTariff: 0, waterTariff: 0, machineryCost: 0 }}>
        <div className="modal-form-grid modal-form-grid-2">
          <Form.Item name="laborTariff" label="Tarifa de mano de obra" rules={[{ required: true }]}><InputNumber min={0} precision={2} prefix="S/" style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="energyTariff" label="Tarifa de energía eléctrica" rules={[{ required: true }]}><InputNumber min={0} precision={2} prefix="S/" style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="waterTariff" label="Tarifa de agua" rules={[{ required: true }]}><InputNumber min={0} precision={2} prefix="S/" style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="machineryCost" label="Tarifa / costo de maquinaria" rules={[{ required: true }]}><InputNumber min={0} precision={2} prefix="S/" style={{ width: "100%" }} /></Form.Item>
          <Form.Item className="form-span-all" name="notes" label="Observaciones"><Input.TextArea rows={2} maxLength={500} /></Form.Item>
        </div>
      </Form>
    </Modal>
  </>;
}
