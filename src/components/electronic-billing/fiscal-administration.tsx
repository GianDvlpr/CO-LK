"use client";

import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Checkbox, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Tabs } from "antd";
import { useState } from "react";
import { toast } from "sonner";

type Series = { id: number; tipo: string; tipo_documento: string; serie: string; correlativo: number; siguiente_numero: string; sucursal: { id: number; nombre: string; cod_local: string } | null; activo: boolean };
type Branch = { id: number; nombre: string; cod_local: string; direccion: string; ubigeo: string; telefono?: string; email?: string; es_principal: boolean; activo: boolean; total_series: number };
type Data = { series: Series[]; branches: Branch[] };

async function api<T>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, init); const body = await response.json(); if (!response.ok) throw new Error(body.error?.message ?? "No se pudo completar la operación."); return body.data; }
const seriesTypes = [
  ["factura", "Factura"], ["boleta", "Boleta"], ["nota_credito", "Nota de crédito"], ["nota_debito", "Nota de débito"],
  ["guia_remision", "Guía remitente"], ["guia_transportista", "Guía transportista"], ["retencion", "Retención"],
  ["percepcion", "Percepción"], ["liquidacion_compra", "Liquidación de compra"],
].map(([value, label]) => ({ value, label }));

export function FiscalAdministration() {
  const queryClient = useQueryClient();
  const [seriesOpen, setSeriesOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [editingSeries, setEditingSeries] = useState<Series>();
  const [editingBranch, setEditingBranch] = useState<Branch>();
  const [seriesForm] = Form.useForm();
  const [branchForm] = Form.useForm();
  const queryKey = ["fiscal-administration"];
  const administration = useQuery({ queryKey, queryFn: () => api<Data>("/api/v1/electronic-billing/administration") });
  const mutate = useMutation({
    mutationFn: (body: Record<string, unknown>) => api("/api/v1/electronic-billing/administration", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: async () => { toast.success("Configuración fiscal actualizada."); setSeriesOpen(false); setBranchOpen(false); setEditingSeries(undefined); setEditingBranch(undefined); seriesForm.resetFields(); branchForm.resetFields(); await queryClient.invalidateQueries({ queryKey }); },
    onError: (error) => toast.error(error.message),
  });
  const openSeries = (item?: Series) => { setEditingSeries(item); seriesForm.setFieldsValue(item ? { correlativo: item.correlativo, sucursal_id: item.sucursal?.id, activo: item.activo } : { correlativo_inicial: 0 }); setSeriesOpen(true); };
  const openBranch = (item?: Branch) => { setEditingBranch(item); branchForm.setFieldsValue(item ? { ...item, activo: item.activo } : { es_principal: false }); setBranchOpen(true); };
  const branches = administration.data?.branches ?? [];
  return <Card className="section-card" title="Administración fiscal" extra={<Button icon={<ReloadOutlined />} onClick={() => administration.refetch()}>Actualizar</Button>}>
    <Alert type="info" showIcon message="Solo los superadministradores pueden modificar series y sucursales." style={{ marginBottom: 16 }} />
    {administration.error ? <Alert type="error" showIcon message={administration.error.message} /> : null}
    <Tabs items={[
      { key: "series", label: "Series", children: <>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openSeries()} style={{ marginBottom: 12 }}>Nueva serie</Button>
        <Table<Series> rowKey="id" size="small" loading={administration.isLoading} dataSource={administration.data?.series ?? []} scroll={{ x: 850 }} columns={[
          { title: "Tipo", dataIndex: "tipo", render: (value) => value.replaceAll("_", " ") }, { title: "Serie", dataIndex: "serie" },
          { title: "Correlativo", dataIndex: "correlativo", align: "right" }, { title: "Siguiente", dataIndex: "siguiente_numero" },
          { title: "Sucursal", render: (_, item) => item.sucursal ? `${item.sucursal.cod_local} · ${item.sucursal.nombre}` : "Sin asignar" },
          { title: "Estado", dataIndex: "activo", render: (value) => value ? <Tag color="green">Activa</Tag> : <Tag>Inactiva</Tag> },
          { title: "Acciones", render: (_, item) => <Space><Button size="small" icon={<EditOutlined />} onClick={() => openSeries(item)}>Editar</Button>{item.activo ? <Button size="small" danger icon={<DeleteOutlined />} onClick={() => Modal.confirm({ title: `¿Desactivar ${item.serie}?`, okText: "Desactivar", okButtonProps: { danger: true }, cancelText: "Cancelar", onOk: () => mutate.mutateAsync({ entity: "series", action: "delete", id: item.id }) })}>Desactivar</Button> : null}</Space> },
        ]} />
      </> },
      { key: "branches", label: "Sucursales", children: <>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openBranch()} style={{ marginBottom: 12 }}>Nueva sucursal</Button>
        <Table<Branch> rowKey="id" size="small" loading={administration.isLoading} dataSource={branches} scroll={{ x: 900 }} columns={[
          { title: "Código", dataIndex: "cod_local" }, { title: "Nombre", dataIndex: "nombre" }, { title: "Dirección", dataIndex: "direccion" }, { title: "Ubigeo", dataIndex: "ubigeo" },
          { title: "Series", dataIndex: "total_series", align: "right" }, { title: "Tipo", render: (_, item) => item.es_principal ? <Tag color="gold">Principal</Tag> : item.activo ? <Tag color="green">Activa</Tag> : <Tag>Inactiva</Tag> },
          { title: "Acciones", render: (_, item) => <Space><Button size="small" icon={<EditOutlined />} onClick={() => openBranch(item)}>Editar</Button>{!item.es_principal && item.total_series === 0 ? <Button size="small" danger icon={<DeleteOutlined />} onClick={() => Modal.confirm({ title: `¿Eliminar ${item.nombre}?`, okText: "Eliminar", okButtonProps: { danger: true }, cancelText: "Cancelar", onOk: () => mutate.mutateAsync({ entity: "branches", action: "delete", id: item.id }) })}>Eliminar</Button> : null}</Space> },
        ]} />
      </> },
    ]} />
    <Modal title={editingSeries ? `Editar ${editingSeries.serie}` : "Nueva serie"} open={seriesOpen} onCancel={() => setSeriesOpen(false)} onOk={() => seriesForm.submit()} confirmLoading={mutate.isPending}>
      <Form form={seriesForm} layout="vertical" onFinish={(values) => mutate.mutate(editingSeries ? { entity: "series", action: "update", id: editingSeries.id, payload: values } : { entity: "series", action: "create", payload: values })}>
        {!editingSeries ? <><Form.Item name="tipo" label="Tipo" rules={[{ required: true }]}><Select options={seriesTypes} /></Form.Item><Form.Item name="serie" label="Serie" normalize={(value) => String(value ?? "").toUpperCase()} rules={[{ required: true }, { pattern: /^[A-Z][A-Z0-9]{3}$/, message: "Usa cuatro caracteres, por ejemplo F004." }]}><Input maxLength={4} /></Form.Item></> : null}
        <Form.Item name="sucursal_id" label="Sucursal" rules={[{ required: true }]}><Select options={branches.filter((item) => item.activo).map((item) => ({ value: item.id, label: `${item.cod_local} · ${item.nombre}` }))} /></Form.Item>
        <Form.Item name={editingSeries ? "correlativo" : "correlativo_inicial"} label="Correlativo"><InputNumber min={0} precision={0} style={{ width: "100%" }} /></Form.Item>
        {editingSeries ? <Form.Item name="activo" valuePropName="checked"><Checkbox>Serie activa</Checkbox></Form.Item> : null}
      </Form>
    </Modal>
    <Modal title={editingBranch ? `Editar ${editingBranch.nombre}` : "Nueva sucursal"} open={branchOpen} onCancel={() => setBranchOpen(false)} onOk={() => branchForm.submit()} confirmLoading={mutate.isPending}>
      <Form form={branchForm} layout="vertical" onFinish={(values) => mutate.mutate(editingBranch ? { entity: "branches", action: "update", id: editingBranch.id, payload: values } : { entity: "branches", action: "create", payload: values })}>
        <Form.Item name="nombre" label="Nombre" rules={[{ required: true }]}><Input maxLength={100} /></Form.Item>
        {!editingBranch ? <Form.Item name="cod_local" label="Código SUNAT del local" rules={[{ required: true }, { pattern: /^\d{4}$/, message: "Debe tener cuatro dígitos." }]}><Input maxLength={4} /></Form.Item> : null}
        <Form.Item name="direccion" label="Dirección" rules={[{ required: true }]}><Input maxLength={500} /></Form.Item>
        <Form.Item name="ubigeo" label="Ubigeo" rules={[{ required: true }, { pattern: /^\d{4,6}$/, message: "Debe tener entre 4 y 6 dígitos." }]}><Input maxLength={6} /></Form.Item>
        <Form.Item name="telefono" label="Teléfono"><Input maxLength={20} /></Form.Item><Form.Item name="email" label="Correo" rules={[{ type: "email" }]}><Input /></Form.Item>
        <Form.Item name="es_principal" valuePropName="checked"><Checkbox>Sucursal principal</Checkbox></Form.Item>
        {editingBranch ? <Form.Item name="activo" valuePropName="checked"><Checkbox>Sucursal activa</Checkbox></Form.Item> : null}
      </Form>
    </Modal>
  </Card>;
}
