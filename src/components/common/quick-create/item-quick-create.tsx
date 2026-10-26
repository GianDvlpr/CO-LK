"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Form, Input, InputNumber, Modal, Segmented, Select } from "antd";
import { useEffect } from "react";
import { toast } from "sonner";
import { apiJson } from "./api";

export type QuickItemType = "RAW_MATERIAL" | "INTERMEDIATE" | "WASTE";
export type QuickCreatedItem = { id: string; code: string; name: string };
type ItemForm = { name: string; abbreviation?: string; type: QuickItemType; unitId: string; lotTrackingMode: "NONE" | "OPTIONAL" | "REQUIRED"; minimumStock: number; supplierId?: string; currencyId?: string; defaultWarehouseId?: string; referenceTaxRate?: number };
type Options = {
  units: { id: string; code: string; name: string; symbol: string }[];
  warehouses: { id: string; code: string; name: string }[];
  suppliers: { id: string; code: string; name: string }[];
  currencies: { id: string; code: string; name: string; symbol: string; isBase: boolean }[];
  igvRate?: string;
};

const typeLabels: Record<QuickItemType, string> = { RAW_MATERIAL: "Materia prima", INTERMEDIATE: "Insumo elaborado", WASTE: "Merma" };

export function ItemQuickCreateModal({ open, defaultType, allowedTypes = ["RAW_MATERIAL", "INTERMEDIATE", "WASTE"], defaultSupplierId, defaultCurrencyId, onCancel, onCreated }: { open: boolean; defaultType: QuickItemType; allowedTypes?: QuickItemType[]; defaultSupplierId?: string; defaultCurrencyId?: string; onCancel: () => void; onCreated: (item: QuickCreatedItem) => void }) {
  const queryClient = useQueryClient();
  const [form] = Form.useForm<ItemForm>();
  const options = useQuery({ queryKey: ["inventory-options"], queryFn: () => apiJson<Options>("/api/v1/inventory/options"), enabled: open });
  const type = Form.useWatch("type", form) ?? defaultType;
  const referenceTaxRate = Form.useWatch("referenceTaxRate", form);
  const companyIgvRate = Number(options.data?.igvRate ?? 18);
  const create = useMutation({
    mutationFn: (values: ItemForm) => apiJson<QuickCreatedItem>("/api/v1/inventory", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...values, abbreviation: values.abbreviation || undefined }) }),
    onSuccess: async (created) => {
      toast.success("Ítem creado en Almacén.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-options"] }),
        queryClient.invalidateQueries({ queryKey: ["recipe-options"] }),
        queryClient.invalidateQueries({ queryKey: ["purchase-options"] }),
        queryClient.invalidateQueries({ queryKey: ["production-options"] }),
      ]);
      onCreated(created);
      form.resetFields();
    },
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ type: defaultType, lotTrackingMode: "NONE", minimumStock: 0, supplierId: defaultSupplierId, currencyId: defaultCurrencyId });
  }, [open, defaultType, defaultSupplierId, defaultCurrencyId, form]);

  const requiresSupplier = type !== "INTERMEDIATE";
  const requiresWarehouse = type === "RAW_MATERIAL";

  return <Modal title="Nuevo ítem de Almacén" open={open} onCancel={() => { form.resetFields(); onCancel(); }} onOk={() => form.submit()} okText="Crear ítem" confirmLoading={create.isPending} destroyOnHidden width={760}>
    <Alert type="info" showIcon message="El código se genera automáticamente. Puedes completar costo de referencia y presentación después en Almacén." style={{ marginBottom: 16 }} />
    <Form form={form} layout="vertical" onFinish={(values) => create.mutate(values)} initialValues={{ type: defaultType, lotTrackingMode: "NONE", minimumStock: 0 }}>
      <div className="modal-form-grid modal-form-grid-2">
        <Form.Item name="name" label="Nombre" rules={[{ required: true }]}><Input maxLength={150} /></Form.Item>
        <Form.Item name="abbreviation" label="Sigla (opcional)"><Input maxLength={30} /></Form.Item>
        {allowedTypes.length > 1 ? <Form.Item name="type" label="Tipo" rules={[{ required: true }]}><Select options={allowedTypes.map((value) => ({ value, label: typeLabels[value] }))} /></Form.Item> : <Form.Item name="type" hidden><Input /></Form.Item>}
        <Form.Item name="unitId" label="Unidad" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={options.data?.units.map((unit) => ({ value: unit.id, label: `${unit.code} · ${unit.name} (${unit.symbol})` }))} /></Form.Item>
        <Form.Item name="lotTrackingMode" label="Control por lote" rules={[{ required: true }]}><Select options={[{ value: "NONE", label: "No controla lote" }, { value: "OPTIONAL", label: "Lote opcional" }, { value: "REQUIRED", label: "Lote obligatorio" }]} /></Form.Item>
        <Form.Item name="minimumStock" label="Stock mínimo" rules={[{ required: true }]}><InputNumber min={0} precision={6} style={{ width: "100%" }} /></Form.Item>
        {requiresSupplier ? <Form.Item name="supplierId" label="Proveedor" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={options.data?.suppliers.map((supplier) => ({ value: supplier.id, label: `${supplier.code} · ${supplier.name}` }))} /></Form.Item> : null}
        {requiresSupplier ? <Form.Item name="currencyId" label="Moneda" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={options.data?.currencies.map((currency) => ({ value: currency.id, label: `${currency.code} · ${currency.symbol}` }))} /></Form.Item> : null}
        <Form.Item name="referenceTaxRate" hidden><Input /></Form.Item>
        <Form.Item label="IGV"><Segmented value={referenceTaxRate === 0 ? "EXCLUDED" : "INCLUDED"} onChange={(value) => form.setFieldValue("referenceTaxRate", value === "EXCLUDED" ? 0 : companyIgvRate)} options={[{ value: "INCLUDED", label: `Con IGV (${companyIgvRate} %)` }, { value: "EXCLUDED", label: "Sin IGV (0 %)" }]} /></Form.Item>
        <Form.Item name="defaultWarehouseId" label={requiresWarehouse ? "Sector / almacén" : "Almacén por defecto (opcional)"} rules={requiresWarehouse ? [{ required: true }] : undefined}><Select allowClear showSearch optionFilterProp="label" options={options.data?.warehouses.map((warehouse) => ({ value: warehouse.id, label: `${warehouse.code} · ${warehouse.name}` }))} /></Form.Item>
      </div>
    </Form>
  </Modal>;
}
