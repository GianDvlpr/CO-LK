"use client";

import { LockOutlined } from "@ant-design/icons";
import { Alert, Button, Form, Input } from "antd";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { BrandIdentity } from "@/components/common/brand-identity";

type Values = { currentPassword: string; newPassword: string; confirmation: string };

export function ChangePasswordCard() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSubmit(values: Values) {
    setSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch("/api/v1/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: values.currentPassword, newPassword: values.newPassword }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo cambiar la contraseña.");
      toast.success("Contraseña actualizada.");
      router.replace("/dashboard");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cambiar la contraseña.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-card">
      <div className="login-mobile-brand"><BrandIdentity subtitle="Gestión operativa" priority /></div>
      <div className="login-theme-toggle"><ThemeToggle /></div>
      <span className="header-kicker">Primer acceso</span>
      <h2>Cambia tu contraseña</h2>
      <p>Define una contraseña privada de al menos 6 caracteres para continuar.</p>
      {error ? <Alert showIcon type="error" message={error} style={{ marginBottom: 24 }} /> : null}
      <Form<Values> layout="vertical" onFinish={handleSubmit}>
        <Form.Item label="Contraseña temporal" name="currentPassword" rules={[{ required: true, message: "Ingresa la contraseña temporal" }]}>
          <Input.Password size="large" prefix={<LockOutlined />} autoComplete="current-password" />
        </Form.Item>
        <Form.Item label="Nueva contraseña" name="newPassword" rules={[{ required: true, min: 6, message: "Usa al menos 6 caracteres" }]}>
          <Input.Password size="large" prefix={<LockOutlined />} autoComplete="new-password" />
        </Form.Item>
        <Form.Item label="Confirma la nueva contraseña" name="confirmation" dependencies={["newPassword"]} rules={[
          { required: true, message: "Confirma la nueva contraseña" },
          ({ getFieldValue }) => ({ validator(_, value) { return !value || getFieldValue("newPassword") === value ? Promise.resolve() : Promise.reject(new Error("Las contraseñas no coinciden")); } }),
        ]}>
          <Input.Password size="large" prefix={<LockOutlined />} autoComplete="new-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" size="large" block loading={submitting}>Guardar y continuar</Button>
      </Form>
    </div>
  );
}
