"use client";

import { PlusOutlined, SettingOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Form, Input, InputNumber, Modal, Select, Space, Typography } from "antd";
import { useState } from "react";
import { toast } from "sonner";
import { apiJson } from "./api";

type Size = { id: string; code: string; name: string; sortOrder: number };
type Color = { id: string; code: string; name: string; hex?: string };
type Unit = { id: string; code: string; name: string; symbol: string };
type Options = { sizes: Size[]; colors: Color[]; units: Unit[] };
type ProductForm = { matrixCode: string; name: string; description?: string; unitId: string; minimumStock: number; variants: { sizeId: string; colorId: string; secondaryColorId?: string }[] };
type OptionForm = { code: string; name: string; sortOrder?: number; hex?: string };
export type QuickCreatedProduct = { id: string; code: string; name: string };

export function ProductCreateModal({ open, onCancel, onCreated }: { open: boolean; onCancel: () => void; onCreated: (created: QuickCreatedProduct) => void }) {
  const queryClient = useQueryClient();
  const [optionType, setOptionType] = useState<"SIZE" | "COLOR">();
  const [form] = Form.useForm<ProductForm>();
  const [optionForm] = Form.useForm<OptionForm>();
  const options = useQuery({ queryKey: ["product-options"], queryFn: () => apiJson<Options>("/api/v1/products/options"), enabled: open });
  const create = useMutation({
    mutationFn: (values: ProductForm) => apiJson<QuickCreatedProduct>("/api/v1/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values) }),
    onSuccess: async (created) => {
      toast.success("Producto y variantes creados.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["products"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-options"] }),
        queryClient.invalidateQueries({ queryKey: ["recipe-options"] }),
        queryClient.invalidateQueries({ queryKey: ["order-options"] }),
        queryClient.invalidateQueries({ queryKey: ["production-options"] }),
      ]);
      onCreated(created);
      form.resetFields();
    },
    onError: (error) => toast.error(error.message),
  });
  const createOption = useMutation({
    mutationFn: (values: OptionForm) => apiJson("/api/v1/products/options", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: optionType, ...values }) }),
    onSuccess: async () => { toast.success(optionType === "SIZE" ? "Talla creada." : "Color creado."); setOptionType(undefined); optionForm.resetFields(); await queryClient.invalidateQueries({ queryKey: ["product-options"] }); },
    onError: (error) => toast.error(error.message),
  });

  return <>
    <Modal title="Nuevo producto" open={open} onCancel={() => { form.resetFields(); onCancel(); }} onOk={() => form.submit()} okText="Crear producto" confirmLoading={create.isPending} width={900} destroyOnHidden>
      {(!options.data?.sizes.length || !options.data?.colors.length) ? <Alert type="warning" showIcon message="Crea al menos una talla y un color antes de registrar variantes." style={{ marginBottom: 16 }} /> : null}
      <Form form={form} layout="vertical" onFinish={(values) => create.mutate(values)} initialValues={{ minimumStock: 0, variants: [{}] }}>
        <Alert type="info" showIcon message="El código del producto y los SKU se generan automáticamente. Ejemplo: I0034-NEG-ROJ-39." style={{ marginBottom: 16 }} />
        <div className="modal-form-grid modal-form-grid-3">
          <Form.Item name="matrixCode" label="Código de matriz" rules={[{ required: true }]}><Input placeholder="I0034" /></Form.Item>
          <Form.Item name="name" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="unitId" label="Unidad de stock" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={options.data?.units.map((unit) => ({ value: unit.id, label: `${unit.code} · ${unit.name}` }))} /></Form.Item>
          <Form.Item name="minimumStock" label="Stock mínimo" tooltip="Stock mínimo aplicado a cada variante del producto." rules={[{ required: true }]}><InputNumber min={0} precision={0} style={{ width: "100%" }} /></Form.Item>
        </div>
        <Form.Item name="description" label="Descripción"><Input.TextArea rows={2} /></Form.Item>
        <Space wrap style={{ marginBottom: 8 }}>
          <Button size="small" icon={<SettingOutlined />} onClick={() => setOptionType("SIZE")}>Nueva talla</Button>
          <Button size="small" icon={<SettingOutlined />} onClick={() => setOptionType("COLOR")}>Nuevo color</Button>
        </Space>
        <Form.List name="variants">{(fields, { add, remove }) => <Space direction="vertical" style={{ width: "100%" }}>
          <Typography.Title level={5}>Variantes</Typography.Title>
          {fields.map((field, index) => <Card key={field.key} size="small" title={`Variante ${index + 1}`} extra={fields.length > 1 ? <Button type="link" danger onClick={() => remove(field.name)}>Quitar</Button> : null}>
            <div className="purchase-form-grid">
              <Form.Item name={[field.name, "sizeId"]} label="Talla" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={options.data?.sizes.map((size) => ({ value: size.id, label: `${size.code} · ${size.name}` }))} /></Form.Item>
              <Form.Item name={[field.name, "colorId"]} label="Color C1" tooltip="Color principal de la variante." rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={options.data?.colors.map((color) => ({ value: color.id, label: `${color.code} · ${color.name}` }))} /></Form.Item>
              <Form.Item name={[field.name, "secondaryColorId"]} label="Color C2" tooltip="Color secundario, solo para suelas bicolor."><Select allowClear showSearch optionFilterProp="label" options={options.data?.colors.map((color) => ({ value: color.id, label: `${color.code} · ${color.name}` }))} /></Form.Item>
            </div>
          </Card>)}
          <Button block icon={<PlusOutlined />} onClick={() => add({})}>Agregar variante</Button>
        </Space>}</Form.List>
      </Form>
    </Modal>
    <Modal title={optionType === "SIZE" ? "Nueva talla" : "Nuevo color"} open={Boolean(optionType)} onCancel={() => setOptionType(undefined)} onOk={() => optionForm.submit()} okText="Crear" confirmLoading={createOption.isPending} width={640} destroyOnHidden>
      <Form form={optionForm} layout="vertical" onFinish={(values) => createOption.mutate(values)} initialValues={{ sortOrder: 0 }}>
        <div className="modal-form-grid modal-form-grid-2">
          <Form.Item name="code" label="Código" rules={[{ required: true }]}><Input placeholder={optionType === "SIZE" ? "38" : "NEG"} /></Form.Item>
          <Form.Item name="name" label="Nombre" rules={[{ required: true }]}><Input placeholder={optionType === "SIZE" ? "Talla 38" : "Negro"} /></Form.Item>
          {optionType === "SIZE" ? <Form.Item name="sortOrder" label="Orden"><InputNumber min={0} precision={0} style={{ width: "100%" }} /></Form.Item> : <Form.Item name="hex" label="Color hexadecimal" rules={[{ pattern: /^#[0-9A-Fa-f]{6}$/, message: "Usa el formato #RRGGBB" }]}><Input placeholder="#000000" /></Form.Item>}
        </div>
      </Form>
    </Modal>
  </>;
}
