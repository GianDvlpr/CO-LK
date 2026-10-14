"use client";

import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Empty, Form, Input, Modal, Select, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ModuleHeadingIntro } from "@/components/common/module-heading-intro";

type Permission = { id: string; code: string; module: string; action: string; description?: string };
type Role = { id: string; code: string; name: string; description?: string; isSystem: boolean; permissions: { permission: Permission }[]; _count: { userRoles: number } };
type RoleForm = { code: string; name: string; description?: string; permissionIds: string[] };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo completar la operación.");
  return payload.data;
}

export function RolesWorkspace({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<RoleForm>();
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api<{ items: Role[]; permissions: Permission[] }>("/api/v1/roles") });
  const permissionOptions = useMemo(() => {
    const grouped = new Map<string, Permission[]>();
    for (const permission of roles.data?.permissions ?? []) grouped.set(permission.module, [...(grouped.get(permission.module) ?? []), permission]);
    return [...grouped.entries()].map(([module, permissions]) => ({ label: module.toUpperCase(), options: permissions.map((permission) => ({ value: permission.id, label: permission.description ? `${permission.code} · ${permission.description}` : permission.code })) }));
  }, [roles.data?.permissions]);
  const create = useMutation({
    mutationFn: (values: RoleForm) => api("/api/v1/roles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values) }),
    onSuccess: async () => { toast.success("Rol creado con sus permisos."); setOpen(false); form.resetFields(); await queryClient.invalidateQueries({ queryKey: ["roles"] }); },
    onError: (error) => toast.error(error.message),
  });

  const columns: ColumnsType<Role> = [
    { title: "Código", dataIndex: "code", width: 160, render: (value, row) => <Space><strong>{value}</strong>{row.isSystem ? <Tag color="purple">Sistema</Tag> : null}</Space> },
    { title: "Rol", width: 260, render: (_, row) => <><strong>{row.name}</strong>{row.description ? <><br /><Typography.Text type="secondary">{row.description}</Typography.Text></> : null}</> },
    { title: "Usuarios", width: 100, align: "center", render: (_, row) => row._count.userRoles },
    { title: "Permisos", width: 100, align: "center", render: (_, row) => row.permissions.length },
  ];

  return <>
    <div className="page-heading"><ModuleHeadingIntro title="Roles y permisos" eyebrow="Seguridad" description="Define perfiles de acceso con permisos atómicos; cada usuario puede tener uno o más roles." /><Space wrap className="module-actions"><Button icon={<ReloadOutlined />} onClick={() => roles.refetch()}>Actualizar</Button></Space></div>
    <Alert type="info" showIcon message="SUPERADMIN y ADMIN son roles del sistema. Los roles personalizados permiten adaptar el acceso de los usuarios operativos." style={{ marginBottom: 18 }} />
    <Card className="section-card" title="Roles disponibles" extra={canManage ? <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>Nuevo rol</Button> : null}>{roles.error ? <Alert type="error" showIcon message={roles.error.message} style={{ marginBottom: 16 }} /> : null}<Table rowKey="id" loading={roles.isLoading} columns={columns} dataSource={roles.data?.items ?? []} expandable={{ expandedRowRender: (row) => { const grouped = new Map<string, Permission[]>(); for (const { permission } of row.permissions) grouped.set(permission.module, [...(grouped.get(permission.module) ?? []), permission]); return <Space direction="vertical" size={12} style={{ width: "100%" }}>{[...grouped.entries()].map(([module, permissions]) => <div key={module}><Typography.Text strong>{module.toUpperCase()}</Typography.Text><div style={{ marginTop: 6 }}><Space size={[4, 4]} wrap>{permissions.map((permission) => <Tag key={permission.id}>{permission.code}</Tag>)}</Space></div></div>)}</Space>; } }} pagination={false} locale={{ emptyText: <Empty description="Aún no hay roles registrados" /> }} /></Card>
    <Modal title="Nuevo rol" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText="Crear rol" confirmLoading={create.isPending} width={760} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(values) => create.mutate(values)}>
        <div className="purchase-form-grid"><Form.Item name="code" label="Código" rules={[{ required: true, message: "Ingresa el código." }, { min: 2 }]}><Input placeholder="ALMACENERO" /></Form.Item><Form.Item name="name" label="Nombre" rules={[{ required: true, message: "Ingresa el nombre." }]}><Input placeholder="Responsable de almacén" /></Form.Item></div>
        <Form.Item name="description" label="Descripción"><Input.TextArea rows={2} maxLength={300} showCount /></Form.Item>
        <Form.Item name="permissionIds" label="Permisos" rules={[{ required: true, message: "Selecciona al menos un permiso." }]}><Select mode="multiple" allowClear showSearch optionFilterProp="label" placeholder="Selecciona los permisos del rol" options={permissionOptions} /></Form.Item>
      </Form>
    </Modal>
  </>;
}
