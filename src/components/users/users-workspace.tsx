"use client";

import { EditOutlined, KeyOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Empty, Form, Input, Modal, Select, Space, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useState } from "react";
import { toast } from "sonner";
import { ModuleHeadingIntro } from "@/components/common/module-heading-intro";
import { ResponsiveTable as Table } from "@/components/common/responsive-table";
import { TableSearch, matchesSearch } from "@/components/common/table-search";

type Role = { id: string; code: string; name: string };
type User = {
  id: string;
  username: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  mustChangePassword: boolean;
  createdAt: string;
  userRoles: { role: Role }[];
};
type UserForm = { username: string; name: string; password?: string; roleIds: string[] };
type ResetPasswordForm = { temporaryPassword: string; confirmPassword: string };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo completar la operación.");
  return payload.data;
}

export function UsersWorkspace({ currentUserId, canCreate, canUpdate, canDeactivate, canResetPassword }: { currentUserId: string; canCreate: boolean; canUpdate: boolean; canDeactivate: boolean; canResetPassword: boolean }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<User>();
  const [resetting, setResetting] = useState<User>();
  const [form] = Form.useForm<UserForm>();
  const [resetForm] = Form.useForm<ResetPasswordForm>();
  const users = useQuery({ queryKey: ["users"], queryFn: () => api<{ items: User[]; roles: Role[] }>("/api/v1/users") });
  const filteredUsers = (users.data?.items ?? []).filter((user) => matchesSearch(search, user.username, user.name, user.userRoles.map((entry) => entry.role.name).join(" ")));
  const create = useMutation({
    mutationFn: (values: UserForm) => api("/api/v1/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values) }),
    onSuccess: async () => {
      toast.success("Usuario creado. Deberá cambiar su contraseña al ingresar.");
      setOpen(false);
      form.resetFields();
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const changeStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: User["status"] }) => api(`/api/v1/users/${id}/status`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) }),
    onSuccess: async (_, variables) => {
      toast.success(variables.status === "ACTIVE" ? "Usuario activado." : "Usuario desactivado y sesiones cerradas.");
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const update = useMutation({ mutationFn: (values: UserForm) => api(`/api/v1/users/${editing?.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(values) }), onSuccess: async () => { toast.success("Usuario actualizado."); setOpen(false); setEditing(undefined); form.resetFields(); await queryClient.invalidateQueries({ queryKey: ["users"] }); }, onError: (error) => toast.error(error.message) });
  const resetPassword = useMutation({ mutationFn: (values: ResetPasswordForm) => api(`/api/v1/users/${resetting?.id}/reset-password`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values) }), onSuccess: async () => { toast.success("Contraseña restablecida. El usuario deberá cambiarla al ingresar."); setResetting(undefined); resetForm.resetFields(); await queryClient.invalidateQueries({ queryKey: ["users"] }); }, onError: (error) => toast.error(error.message) });

  const columns: ColumnsType<User> = [
    { title: "Usuario", width: 240, render: (_, row) => <><strong>{row.name}</strong><br /><Typography.Text type="secondary">@{row.username}</Typography.Text></> },
    { title: "Roles", width: 230, render: (_, row) => <Space size={[4, 4]} wrap>{row.userRoles.map(({ role }) => <Tag color={role.code === "SUPERADMIN" ? "purple" : role.code === "ADMIN" ? "blue" : "default"} key={role.id}>{role.name}</Tag>)}</Space> },
    { title: "Contraseña", width: 170, render: (_, row) => row.mustChangePassword ? <Tag color="gold">Cambio pendiente</Tag> : <Tag color="green">Actualizada</Tag> },
    { title: "Creado", dataIndex: "createdAt", width: 120, render: (value) => dayjs(value).format("DD/MM/YYYY") },
    { title: "Estado", dataIndex: "status", width: 100, render: (value) => value === "ACTIVE" ? <Tag color="green">Activo</Tag> : <Tag>Inactivo</Tag> },
    { title: "Acciones", fixed: "right", width: 350, render: (_, row) => <Space wrap>{canUpdate ? <Button size="small" icon={<EditOutlined />} onClick={() => { setEditing(row); form.setFieldsValue({ username: row.username, name: row.name, roleIds: row.userRoles.map(({ role }) => role.id) }); setOpen(true); }}>Editar</Button> : null}{canResetPassword && row.id !== currentUserId ? <Button size="small" icon={<KeyOutlined />} onClick={() => { resetForm.resetFields(); setResetting(row); }}>Restablecer</Button> : null}{canDeactivate ? <Button size="small" danger={row.status === "ACTIVE"} loading={changeStatus.isPending} onClick={() => { const nextStatus = row.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"; Modal.confirm({ title: `${nextStatus === "ACTIVE" ? "¿Activar" : "¿Desactivar"} a ${row.name}?`, content: nextStatus === "INACTIVE" ? "Se cerrarán inmediatamente todas sus sesiones activas." : "La cuenta podrá volver a iniciar sesión.", okText: nextStatus === "ACTIVE" ? "Activar" : "Desactivar", okButtonProps: { danger: nextStatus === "INACTIVE" }, onOk: () => changeStatus.mutateAsync({ id: row.id, status: nextStatus }) }); }}>{row.status === "ACTIVE" ? "Desactivar" : "Activar"}</Button> : null}</Space> },
  ];

  return <>
    <div className="page-heading"><ModuleHeadingIntro title="Usuarios" eyebrow="Seguridad" description="Administra cuentas y roles. Las cuentas nuevas deben cambiar su contraseña en el primer ingreso y usar al menos 6 caracteres." /><Space wrap className="module-actions"><TableSearch value={search} onChange={setSearch} placeholder="Buscar nombre, usuario o rol" /><Tooltip title="Actualizar"><Button icon={<ReloadOutlined />} aria-label="Actualizar" onClick={() => users.refetch()} /></Tooltip></Space></div>
    <Card className="section-card" title="Usuarios registrados" extra={canCreate ? <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(undefined); form.resetFields(); setOpen(true); }}>Nuevo usuario</Button> : null}>{users.error ? <Alert type="error" showIcon message={users.error.message} style={{ marginBottom: 16 }} /> : null}<Table rowKey="id" loading={users.isLoading} columns={columns} dataSource={filteredUsers} scroll={{ x: 1240 }} pagination={{ pageSize: 8, pageSizeOptions: [8, 16, 32] }} locale={{ emptyText: <Empty description="Aún no hay usuarios registrados" /> }} /></Card>
    <Modal title={editing ? "Editar usuario" : "Nuevo usuario"} open={open} onCancel={() => { setOpen(false); setEditing(undefined); }} onOk={() => form.submit()} okText={editing ? "Guardar cambios" : "Crear usuario"} confirmLoading={create.isPending || update.isPending} width={720} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={(values) => editing ? update.mutate(values) : create.mutate(values)}>
        <div className="modal-form-grid modal-form-grid-2"><Form.Item name="name" label="Nombre completo" rules={[{ required: true, message: "Ingresa el nombre." }]}><Input /></Form.Item><Form.Item name="username" label="Usuario" rules={[{ required: true, message: "Ingresa el usuario." }, { min: 3 }, { pattern: /^[a-zA-Z0-9._-]+$/, message: "Usa letras, números, punto, guion o guion bajo." }]}><Input autoComplete="off" /></Form.Item>{!editing ? <Form.Item name="password" label="Contraseña temporal" rules={[{ required: true, message: "Ingresa la contraseña." }, { min: 6, message: "Debe tener al menos 6 caracteres." }]}><Input.Password autoComplete="new-password" /></Form.Item> : null}<Form.Item className={!editing ? undefined : "form-span-all"} name="roleIds" label="Roles" rules={[{ required: true, message: "Selecciona al menos un rol." }]}><Select mode="multiple" placeholder="Selecciona uno o más roles" options={users.data?.roles.map((role) => ({ value: role.id, label: `${role.code} · ${role.name}` }))} /></Form.Item></div>
        {!editing ? <Alert type="warning" showIcon message="El usuario deberá establecer una nueva contraseña después de su primer inicio de sesión." /> : null}
      </Form>
    </Modal>
    <Modal title={`Restablecer contraseña · ${resetting?.name ?? "Usuario"}`} open={Boolean(resetting)} onCancel={() => { setResetting(undefined); resetForm.resetFields(); }} onOk={() => resetForm.submit()} okText="Restablecer contraseña" okButtonProps={{ danger: true }} confirmLoading={resetPassword.isPending} destroyOnHidden>
      <Alert type="warning" showIcon message="Se cerrarán todas las sesiones de este usuario y deberá cambiar la contraseña temporal en su próximo ingreso." style={{ marginBottom: 16 }} />
      <Form form={resetForm} layout="vertical" onFinish={(values) => resetPassword.mutate(values)}>
        <Form.Item name="temporaryPassword" label="Contraseña temporal" rules={[{ required: true, message: "Ingresa una contraseña temporal." }, { min: 6, message: "Debe tener al menos 6 caracteres." }]}><Input.Password autoComplete="new-password" /></Form.Item>
        <Form.Item name="confirmPassword" label="Confirmar contraseña temporal" dependencies={["temporaryPassword"]} rules={[{ required: true, message: "Confirma la contraseña temporal." }, ({ getFieldValue }) => ({ validator(_, value) { return !value || getFieldValue("temporaryPassword") === value ? Promise.resolve() : Promise.reject(new Error("Las contraseñas no coinciden.")); } })]}><Input.Password autoComplete="new-password" /></Form.Item>
      </Form>
    </Modal>
  </>;
}
