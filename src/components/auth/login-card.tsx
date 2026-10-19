"use client";

import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { Alert, Button, Form, Input } from "antd";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/common/theme-toggle";

type LoginValues = {
  username: string;
  password: string;
};

export function LoginCard() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSubmit(values: LoginValues) {
    setSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "No se pudo iniciar sesión.");
      toast.success("Sesión iniciada.");
      router.replace(payload.data?.mustChangePassword ? "/change-password" : "/dashboard");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo iniciar sesión.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-card">
      <div className="login-theme-toggle"><ThemeToggle /></div>
      <span className="header-kicker">Acceso seguro</span>
      <h2>Bienvenido</h2>
      <p>Ingresa tus credenciales para acceder al centro de operaciones.</p>
      {error ? <Alert showIcon type="error" message={error} style={{ marginBottom: 24 }} /> : null}
      <Form<LoginValues>
        layout="vertical"
        onFinish={handleSubmit}
      >
        <Form.Item
          label="Usuario"
          name="username"
          rules={[{ required: true, message: "Ingresa tu usuario" }]}
        >
          <Input size="large" prefix={<UserOutlined />} placeholder="usuario" autoComplete="username" />
        </Form.Item>
        <Form.Item
          label="Contraseña"
          name="password"
          rules={[{ required: true, message: "Ingresa tu contraseña" }]}
        >
          <Input.Password size="large" prefix={<LockOutlined />} placeholder="••••••••••••" />
        </Form.Item>
        <Button type="primary" htmlType="submit" size="large" block loading={submitting}>
          Ingresar
        </Button>
      </Form>
    </div>
  );
}
