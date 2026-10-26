"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Form, Input, InputNumber, Modal, Select } from "antd";
import { toast } from "sonner";
import { apiJson } from "./api";

export type QuickCreatedCatalog = { id: string; code: string; name: string };

function useCatalogCreate<T>(type: string, dependencies: string[][], successMessage: string, onCreated: (created: QuickCreatedCatalog) => void, onError?: (error: Error) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: T) => apiJson<QuickCreatedCatalog>("/api/v1/catalogs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type, ...values }) }),
    onSuccess: async (created) => {
      toast.success(successMessage);
      await Promise.all(dependencies.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      onCreated(created);
    },
    onError: (error) => { toast.error(error.message); onError?.(error); },
  });
}

const invalidations = [["catalogs"], ["warehouse-layout"], ["inventory-options"], ["purchase-options"], ["production-options"], ["recipe-options"], ["order-options"], ["product-options"]];

export function WarehouseQuickCreateModal({ open, onCancel, onCreated }: { open: boolean; onCancel: () => void; onCreated: (created: QuickCreatedCatalog) => void }) {
  const [form] = Form.useForm<{ code: string; name: string }>();
  const create = useCatalogCreate<{ code: string; name: string }>("WAREHOUSE", invalidations, "Almacén creado.", onCreated);
  return <Modal title="Nuevo almacén" open={open} onCancel={() => { form.resetFields(); onCancel(); }} onOk={() => form.submit()} okText="Crear almacén" confirmLoading={create.isPending} destroyOnHidden>
    <Form form={form} layout="vertical" onFinish={(values) => create.mutate(values, { onSuccess: () => form.resetFields() })}>
      <div className="modal-form-grid modal-form-grid-2">
        <Form.Item name="code" label="Código" rules={[{ required: true }]}><Input maxLength={50} placeholder="Ejemplo: SEC-H" /></Form.Item>
        <Form.Item name="name" label="Nombre" rules={[{ required: true }]}><Input maxLength={150} placeholder="Zona de despacho" /></Form.Item>
      </div>
    </Form>
  </Modal>;
}

export function ContactQuickCreateModal({ kind, open, onCancel, onCreated }: { kind: "SUPPLIER" | "CUSTOMER"; open: boolean; onCancel: () => void; onCreated: (created: QuickCreatedCatalog) => void }) {
  const [form] = Form.useForm<{ documentType: "DNI" | "RUC"; taxId?: string; name: string }>();
  const create = useCatalogCreate<{ documentType: "DNI" | "RUC"; taxId?: string; name: string }>(kind, invalidations, kind === "SUPPLIER" ? "Proveedor creado." : "Cliente creado.", onCreated);
  const documentType = Form.useWatch("documentType", form) ?? "RUC";
  return <Modal title={kind === "SUPPLIER" ? "Nuevo proveedor" : "Nuevo cliente"} open={open} onCancel={() => { form.resetFields(); onCancel(); }} onOk={() => form.submit()} okText="Crear" confirmLoading={create.isPending} destroyOnHidden>
    <Form form={form} layout="vertical" onFinish={(values) => create.mutate(values, { onSuccess: () => form.resetFields() })} initialValues={{ documentType: "RUC" }}>
      <div className="catalog-document-grid">
        <Form.Item name="documentType" label="Tipo de documento" rules={[{ required: true }]}><Select options={[{ value: "RUC", label: "RUC" }, { value: "DNI", label: "DNI" }]} /></Form.Item>
        <Form.Item name="taxId" label="Número de documento" rules={[{ required: true }, { pattern: documentType === "DNI" ? /^\d{8}$/ : /^\d{11}$/, message: `Ingresa un ${documentType} válido.` }]}><Input inputMode="numeric" maxLength={documentType === "DNI" ? 8 : 11} /></Form.Item>
      </div>
      <Form.Item name="name" label="Nombre o razón social" rules={[{ required: true }]}><Input maxLength={150} /></Form.Item>
    </Form>
  </Modal>;
}

export function CurrencyQuickCreateModal({ open, onCancel, onCreated }: { open: boolean; onCancel: () => void; onCreated: (created: QuickCreatedCatalog) => void }) {
  const [form] = Form.useForm<{ code: string; name: string; symbol: string }>();
  const create = useCatalogCreate<{ code: string; name: string; symbol: string }>("CURRENCY", invalidations, "Moneda creada.", onCreated);
  return <Modal title="Nueva moneda" open={open} onCancel={() => { form.resetFields(); onCancel(); }} onOk={() => form.submit()} okText="Crear moneda" confirmLoading={create.isPending} destroyOnHidden>
    <Form form={form} layout="vertical" onFinish={(values) => create.mutate(values, { onSuccess: () => form.resetFields() })}>
      <div className="modal-form-grid modal-form-grid-3">
        <Form.Item name="code" label="Código ISO" rules={[{ required: true }, { len: 3, message: "Usa 3 letras." }]}><Input maxLength={3} placeholder="USD" /></Form.Item>
        <Form.Item name="name" label="Nombre" rules={[{ required: true }]}><Input maxLength={150} placeholder="Dólar estadounidense" /></Form.Item>
        <Form.Item name="symbol" label="Símbolo" rules={[{ required: true }]}><Input maxLength={10} placeholder="$" /></Form.Item>
      </div>
    </Form>
  </Modal>;
}

export function UnitQuickCreateModal({ open, onCancel, onCreated }: { open: boolean; onCancel: () => void; onCreated: (created: QuickCreatedCatalog) => void }) {
  const [form] = Form.useForm<{ code: string; name: string; symbol: string; decimalPlaces: number }>();
  const create = useCatalogCreate<{ code: string; name: string; symbol: string; decimalPlaces: number }>("UNIT", invalidations, "Unidad creada.", onCreated);
  return <Modal title="Nueva unidad" open={open} onCancel={() => { form.resetFields(); onCancel(); }} onOk={() => form.submit()} okText="Crear unidad" confirmLoading={create.isPending} destroyOnHidden>
    <Form form={form} layout="vertical" onFinish={(values) => create.mutate(values, { onSuccess: () => form.resetFields() })} initialValues={{ decimalPlaces: 3 }}>
      <div className="modal-form-grid modal-form-grid-2">
        <Form.Item name="code" label="Código" rules={[{ required: true }]}><Input maxLength={50} placeholder="KG" /></Form.Item>
        <Form.Item name="name" label="Nombre" rules={[{ required: true }]}><Input maxLength={150} placeholder="Kilogramo" /></Form.Item>
        <Form.Item name="symbol" label="Símbolo" rules={[{ required: true }]}><Input maxLength={20} placeholder="kg" /></Form.Item>
        <Form.Item name="decimalPlaces" label="Decimales" rules={[{ required: true }]}><InputNumber min={0} max={6} precision={0} style={{ width: "100%" }} /></Form.Item>
      </div>
    </Form>
  </Modal>;
}
