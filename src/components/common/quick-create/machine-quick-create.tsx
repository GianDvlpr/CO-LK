"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Form, Input, Modal, Select } from "antd";
import { toast } from "sonner";
import { apiJson } from "./api";

export type QuickCreatedMachine = { id: string; code: string; name: string; type: string; status: string };
type MachineForm = { name: string; type: "PRESS" | "INJECTOR" | "OTHER"; brand?: string; model?: string };

export function MachineQuickCreateModal({ open, onCancel, onCreated }: { open: boolean; onCancel: () => void; onCreated: (created: QuickCreatedMachine) => void }) {
  const queryClient = useQueryClient();
  const [form] = Form.useForm<MachineForm>();
  const create = useMutation({
    mutationFn: (values: MachineForm) => apiJson<QuickCreatedMachine>("/api/v1/machinery", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values) }),
    onSuccess: async (created) => {
      toast.success("Máquina creada.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["machinery"] }),
        queryClient.invalidateQueries({ queryKey: ["production-options"] }),
      ]);
      onCreated(created);
      form.resetFields();
    },
    onError: (error) => toast.error(error.message),
  });
  return <Modal title="Nueva máquina" open={open} onCancel={() => { form.resetFields(); onCancel(); }} onOk={() => form.submit()} okText="Crear máquina" confirmLoading={create.isPending} destroyOnHidden>
    <Form form={form} layout="vertical" onFinish={(values) => create.mutate(values)} initialValues={{ type: "PRESS" }}>
      <div className="modal-form-grid modal-form-grid-2">
        <Form.Item name="name" label="Nombre" rules={[{ required: true }]}><Input maxLength={150} placeholder="Prensa 2" /></Form.Item>
        <Form.Item name="type" label="Tipo" rules={[{ required: true }]}><Select options={[{ value: "PRESS", label: "Prensa" }, { value: "INJECTOR", label: "Inyectora" }, { value: "OTHER", label: "Otra" }]} /></Form.Item>
        <Form.Item name="brand" label="Marca"><Input maxLength={100} /></Form.Item>
        <Form.Item name="model" label="Modelo"><Input maxLength={100} /></Form.Item>
      </div>
    </Form>
  </Modal>;
}
