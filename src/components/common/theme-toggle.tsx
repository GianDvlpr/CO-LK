"use client";

import { MoonOutlined, SunOutlined } from "@ant-design/icons";
import { Button, Tooltip } from "antd";
import { useUiStore } from "@/stores/ui-store";

export function ThemeToggle() {
  const mode = useUiStore((state) => state.themeMode);
  const toggle = useUiStore((state) => state.toggleTheme);
  const next = mode === "dark" ? "claro" : "oscuro";
  return <Tooltip title={`Activar modo ${next}`}><Button type="text" aria-label={`Activar modo ${next}`} icon={mode === "dark" ? <SunOutlined /> : <MoonOutlined />} onClick={toggle} /></Tooltip>;
}
