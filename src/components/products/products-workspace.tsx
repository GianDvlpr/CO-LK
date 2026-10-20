"use client";

import { DeleteOutlined, EditOutlined, PictureOutlined, PlusOutlined, ReloadOutlined, SettingOutlined, UploadOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Avatar, Button, Card, Checkbox, Empty, Form, Image, Input, InputNumber, Modal, Popconfirm, Select, Space, Tag, Typography, Upload } from "antd";
import type { ColumnsType } from "antd/es/table";
import Decimal from "decimal.js";
import { ModuleImportButton } from "@/components/imports/module-import-button";
import { ModuleHeadingIntro } from "@/components/common/module-heading-intro";
import { ResponsiveTable as Table } from "@/components/common/responsive-table";
import { useState } from "react";
import { toast } from "sonner";

type Size = { id: string; code: string; name: string; sortOrder: number };
type Color = { id: string; code: string; name: string; hex?: string };
type Unit = { id: string; code: string; name: string; symbol: string };
type Variant = { id: string; sku: string; active: boolean; size: Size; color: Color; secondaryColor?: Color; inventoryItem: { unit: { symbol: string }; balances: { onHandQuantity: string }[] } };
type ProductImage = { id: string; secureUrl: string; fileName: string; mimeType: string; sizeBytes: number; sortOrder: number };
type Product = { id: string; code: string; matrixCode: string; name: string; description?: string; active: boolean; variants: Variant[]; images: ProductImage[]; _count: { recipes: number } };
type Options = { sizes: Size[]; colors: Color[]; units: Unit[] };
type ProductForm = { matrixCode: string; name: string; description?: string; unitId: string; minimumStock: number; variants: { sizeId: string; colorId: string; secondaryColorId?: string }[] };
type OptionForm = { code: string; name: string; sortOrder?: number; hex?: string };
type EditProductForm = { matrixCode: string; name: string; description?: string; active: boolean };

async function api<T>(url: string, init?: RequestInit): Promise<T> { const response = await fetch(url, init); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo completar la operación."); return payload.data; }

export function ProductsWorkspace({ permissions, canCreate, canManageImages, cloudinaryConfigured }: { permissions: string[]; canCreate: boolean; canManageImages: boolean; cloudinaryConfigured: boolean }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [optionType, setOptionType] = useState<"SIZE" | "COLOR">();
  const [imageProductId, setImageProductId] = useState<string>();
  const [editingProduct, setEditingProduct] = useState<Product>();
  const [form] = Form.useForm<ProductForm>();
  const [optionForm] = Form.useForm<OptionForm>();
  const [editForm] = Form.useForm<EditProductForm>();
  const products = useQuery({ queryKey: ["products"], queryFn: () => api<{ items: Product[] }>("/api/v1/products") });
  const options = useQuery({ queryKey: ["product-options"], queryFn: () => api<Options>("/api/v1/products/options") });
  const create = useMutation({ mutationFn: (values: ProductForm) => api("/api/v1/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values) }), onSuccess: async () => { toast.success("Producto y variantes creados."); setOpen(false); form.resetFields(); await Promise.all([queryClient.invalidateQueries({ queryKey: ["products"] }), queryClient.invalidateQueries({ queryKey: ["inventory"] }), queryClient.invalidateQueries({ queryKey: ["inventory-options"] })]); }, onError: (error) => toast.error(error.message) });
  const createOption = useMutation({ mutationFn: (values: OptionForm) => api("/api/v1/products/options", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: optionType, ...values }) }), onSuccess: async () => { toast.success(optionType === "SIZE" ? "Talla creada." : "Color creado."); setOptionType(undefined); optionForm.resetFields(); await queryClient.invalidateQueries({ queryKey: ["product-options"] }); }, onError: (error) => toast.error(error.message) });
  const uploadImage = useMutation({ mutationFn: async (file: File) => { const body = new FormData(); body.append("file", file); return api(`/api/v1/products/${imageProductId}/images`, { method: "POST", body }); }, onSuccess: async () => { toast.success("Imagen cargada en Cloudinary."); await queryClient.invalidateQueries({ queryKey: ["products"] }); }, onError: (error) => toast.error(error.message) });
  const deleteImage = useMutation({ mutationFn: (imageId: string) => api(`/api/v1/products/${imageProductId}/images/${imageId}`, { method: "DELETE" }), onSuccess: async () => { toast.success("Imagen eliminada."); await queryClient.invalidateQueries({ queryKey: ["products"] }); }, onError: (error) => toast.error(error.message) });
  const updateProduct = useMutation({ mutationFn: (values: EditProductForm) => api(`/api/v1/products/${editingProduct?.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(values) }), onSuccess: async () => { toast.success("Producto actualizado."); setEditingProduct(undefined); editForm.resetFields(); await queryClient.invalidateQueries({ queryKey: ["products"] }); }, onError: (error) => toast.error(error.message) });
  const imageProduct = products.data?.items.find((product) => product.id === imageProductId);

  const variantColumns: ColumnsType<Variant> = [
    { title: "SKU", dataIndex: "sku", render: (value) => <strong>{value}</strong> },
    { title: "Talla", render: (_, row) => row.size.name },
    { title: "Color", render: (_, row) => <Space><span style={{ width: 14, height: 14, borderRadius: "50%", background: row.color.hex ?? "#d7d7d2", border: "1px solid #bbb" }} />{row.color.name}{row.secondaryColor ? ` / ${row.secondaryColor.name}` : ""}</Space> },
    { title: "Stock", align: "right", render: (_, row) => `${row.inventoryItem.balances.reduce((sum, balance) => sum.add(balance.onHandQuantity), new Decimal(0)).toFixed(0)} ${row.inventoryItem.unit.symbol}` },
    { title: "Estado", render: (_, row) => row.active ? <Tag color="green">Activo</Tag> : <Tag>Inactivo</Tag> },
  ];
  const columns: ColumnsType<Product> = [
    { title: "", width: 70, render: (_, row) => row.images[0] ? <Avatar shape="square" size={44} src={row.images[0].secureUrl} /> : <Avatar shape="square" size={44}>{row.code.slice(0, 2)}</Avatar> },
    { title: "Código", dataIndex: "code", width: 130, render: (value) => <strong>{value}</strong> },
    { title: "Matriz", dataIndex: "matrixCode", width: 120, render: (value) => <strong>{value}</strong> },
    { title: "Producto", width: 300, render: (_, row) => <><strong>{row.name}</strong>{row.description ? <><br /><Typography.Text type="secondary">{row.description}</Typography.Text></> : null}</> },
    { title: "Variantes", width: 110, align: "center", render: (_, row) => row.variants.length },
    { title: "Stock total", width: 130, align: "right", render: (_, row) => row.variants.reduce((sum, variant) => sum.add(variant.inventoryItem.balances.reduce((subtotal, balance) => subtotal.add(balance.onHandQuantity), new Decimal(0))), new Decimal(0)).toFixed(0) },
    { title: "Recetas", width: 100, align: "center", render: (_, row) => row._count.recipes },
    { title: "Estado", width: 100, render: (_, row) => row.active ? <Tag color="green">Activo</Tag> : <Tag>Inactivo</Tag> },
    ...((permissions.includes("products.update") || canManageImages) ? [{ title: "Acciones", width: 210, fixed: "right" as const, render: (_: unknown, row: Product) => <Space>{permissions.includes("products.update") ? <Button size="small" icon={<EditOutlined />} onClick={() => { setEditingProduct(row); editForm.setFieldsValue({ matrixCode: row.matrixCode, name: row.name, description: row.description, active: row.active }); }}>Editar</Button> : null}{canManageImages ? <Button size="small" icon={<PictureOutlined />} onClick={() => setImageProductId(row.id)}>Imágenes</Button> : null}</Space> }] : []),
  ];

  return <>
    <div className="page-heading"><ModuleHeadingIntro title="Productos" eyebrow="Operativo" description={`Gestiona modelos de calzado y variantes por talla, color y SKU vinculadas al inventario.${cloudinaryConfigured ? "" : " Las imágenes estarán disponibles cuando Cloudinary esté configurado."}`} /><Space wrap className="module-actions"><Button icon={<ReloadOutlined />} onClick={() => products.refetch()}>Actualizar</Button><ModuleImportButton module="products" permissions={permissions} /></Space></div>
    <Card className="section-card" title="Productos y variantes" extra={canCreate ? <Space wrap><Button icon={<SettingOutlined />} onClick={() => setOptionType("SIZE")}>Nueva talla</Button><Button icon={<SettingOutlined />} onClick={() => setOptionType("COLOR")}>Nuevo color</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>Nuevo producto</Button></Space> : null}>{products.error ? <Alert type="error" showIcon message={products.error.message} style={{ marginBottom: 16 }} /> : null}<Table rowKey="id" loading={products.isLoading} columns={columns} dataSource={products.data?.items ?? []} expandable={{ expandedRowRender: (row) => <Table rowKey="id" size="small" pagination={false} columns={variantColumns} dataSource={row.variants} /> }} scroll={{ x: 950 }} pagination={{ pageSize: 15 }} locale={{ emptyText: <Empty description="Aún no hay productos registrados" /> }} /></Card>
    <Modal title="Nuevo producto" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="Crear producto" confirmLoading={create.isPending} width={850} destroyOnHidden>
      {(!options.data?.sizes.length || !options.data?.colors.length) ? <Alert type="warning" showIcon message="Crea al menos una talla y un color antes de registrar variantes." style={{ marginBottom: 16 }} /> : null}
      <Form form={form} layout="vertical" onFinish={(values) => create.mutate(values)} initialValues={{ minimumStock: 0, variants: [{}] }}>
        <Alert type="info" showIcon message="El código del producto y los SKU se generan automáticamente. Ejemplo: I0034-NEG-ROJ-39." style={{ marginBottom: 16 }} />
        <div className="purchase-form-grid"><Form.Item name="matrixCode" label="Código de matriz" rules={[{ required: true }]}><Input placeholder="I0034" /></Form.Item><Form.Item name="name" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="unitId" label="Unidad de stock" rules={[{ required: true }]}><Select options={options.data?.units.map((unit) => ({ value: unit.id, label: `${unit.code} · ${unit.name}` }))} /></Form.Item><Form.Item name="minimumStock" label="Stock mínimo" tooltip="Stock mínimo aplicado a cada variante del producto." rules={[{ required: true }]}><InputNumber min={0} precision={0} style={{ width: "100%" }} /></Form.Item></div>
        <Form.Item name="description" label="Descripción"><Input.TextArea rows={2} /></Form.Item>
        <Form.List name="variants">{(fields, { add, remove }) => <Space direction="vertical" style={{ width: "100%" }}><Typography.Title level={5}>Variantes</Typography.Title>{fields.map((field, index) => <Card key={field.key} size="small" title={`Variante ${index + 1}`} extra={fields.length > 1 ? <Button type="link" danger onClick={() => remove(field.name)}>Quitar</Button> : null}><div className="purchase-form-grid"><Form.Item name={[field.name, "sizeId"]} label="Talla" rules={[{ required: true }]}><Select options={options.data?.sizes.map((size) => ({ value: size.id, label: `${size.code} · ${size.name}` }))} /></Form.Item><Form.Item name={[field.name, "colorId"]} label="Color C1" tooltip="Color principal de la variante." rules={[{ required: true }]}><Select options={options.data?.colors.map((color) => ({ value: color.id, label: `${color.code} · ${color.name}` }))} /></Form.Item><Form.Item name={[field.name, "secondaryColorId"]} label="Color C2" tooltip="Color secundario, solo para suelas bicolor."><Select allowClear options={options.data?.colors.map((color) => ({ value: color.id, label: `${color.code} · ${color.name}` }))} /></Form.Item></div></Card>)}<Button block icon={<PlusOutlined />} onClick={() => add({})}>Agregar variante</Button></Space>}</Form.List>
      </Form>
    </Modal>
    <Modal title={optionType === "SIZE" ? "Nueva talla" : "Nuevo color"} open={Boolean(optionType)} onCancel={() => setOptionType(undefined)} onOk={() => optionForm.submit()} okText="Crear" confirmLoading={createOption.isPending} destroyOnHidden>
      <Form form={optionForm} layout="vertical" onFinish={(values) => createOption.mutate(values)} initialValues={{ sortOrder: 0 }}><Form.Item name="code" label="Código" rules={[{ required: true }]}><Input placeholder={optionType === "SIZE" ? "38" : "NEG"} /></Form.Item><Form.Item name="name" label="Nombre" rules={[{ required: true }]}><Input placeholder={optionType === "SIZE" ? "Talla 38" : "Negro"} /></Form.Item>{optionType === "SIZE" ? <Form.Item name="sortOrder" label="Orden"><InputNumber min={0} precision={0} style={{ width: "100%" }} /></Form.Item> : <Form.Item name="hex" label="Color hexadecimal" rules={[{ pattern: /^#[0-9A-Fa-f]{6}$/, message: "Usa el formato #RRGGBB" }]}><Input placeholder="#000000" /></Form.Item>}</Form>
    </Modal>
    <Modal title={`Editar ${editingProduct?.code ?? "producto"}`} open={Boolean(editingProduct)} onCancel={() => setEditingProduct(undefined)} onOk={() => editForm.submit()} okText="Guardar cambios" confirmLoading={updateProduct.isPending} destroyOnHidden>
      <Form form={editForm} layout="vertical" onFinish={(values) => updateProduct.mutate(values)}><Form.Item name="matrixCode" label="Código de matriz" rules={[{ required: true }]} extra="Al cambiarlo se regenerarán los SKU de todas las variantes."><Input /></Form.Item><Form.Item name="name" label="Nombre" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="description" label="Descripción"><Input.TextArea rows={3} /></Form.Item><Form.Item name="active" valuePropName="checked"><Checkbox>Producto activo</Checkbox></Form.Item></Form>
    </Modal>
    <Modal title={`Imágenes · ${imageProduct?.name ?? "Producto"}`} open={Boolean(imageProductId)} onCancel={() => setImageProductId(undefined)} footer={null} width={760} destroyOnHidden>
      {!cloudinaryConfigured ? <Alert type="warning" showIcon message="Cloudinary no está configurado en el servidor." /> : <>
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Typography.Text type="secondary">JPEG, PNG o WebP · máximo 5 MB · hasta 8 imágenes. La primera imagen es la portada del catálogo.</Typography.Text>
          <Upload accept="image/jpeg,image/png,image/webp" showUploadList={false} disabled={uploadImage.isPending || (imageProduct?.images.length ?? 0) >= 8} beforeUpload={(file) => { uploadImage.mutate(file as File); return Upload.LIST_IGNORE; }}>
            <Button type="primary" icon={<UploadOutlined />} loading={uploadImage.isPending} disabled={(imageProduct?.images.length ?? 0) >= 8}>Subir imagen</Button>
          </Upload>
          {imageProduct?.images.length ? <div className="product-image-grid">{imageProduct.images.map((item, index) => <Card key={item.id} size="small" cover={<Image src={item.secureUrl} alt={item.fileName} height={180} style={{ objectFit: "cover" }} />} actions={[<Popconfirm key="delete" title="¿Eliminar esta imagen?" description="También se eliminará de Cloudinary." okText="Eliminar" cancelText="Cancelar" okButtonProps={{ danger: true, loading: deleteImage.isPending }} onConfirm={() => deleteImage.mutate(item.id)}><DeleteOutlined /></Popconfirm>]}><Card.Meta title={index === 0 ? <Space><span>{item.fileName}</span><Tag color="blue">Portada</Tag></Space> : item.fileName} description={`${(item.sizeBytes / 1024).toFixed(0)} KB`} /></Card>)}</div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Este producto todavía no tiene imágenes" />}
        </Space>
      </>}
    </Modal>
  </>;
}
