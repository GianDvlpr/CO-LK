"use client";

import {
  AppstoreOutlined,
  BookOutlined,
  DatabaseOutlined,
  FileExcelOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MoreOutlined,
  ProductOutlined,
  QuestionCircleOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  TagsOutlined,
  TeamOutlined,
  ToolOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Avatar, Button, Dropdown, Layout, Menu, Space } from "antd";
import type { MenuProps } from "antd";
import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";
import {
  administrationModules,
  appModules,
  findModuleByHref,
  helpModules,
} from "@/lib/config/modules";
import type { AppModule } from "@/lib/config/modules";
import { useUiStore } from "@/stores/ui-store";
import type { AuthenticatedUser } from "@/modules/auth/application/session-service";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { ExchangeRateIndicator } from "@/components/exchange-rates/exchange-rate-indicator";

const { Header, Sider, Content } = Layout;

const moduleIcons: Record<string, React.ReactNode> = {
  dashboard: <AppstoreOutlined />,
  guide: <QuestionCircleOutlined />,
  purchases: <ShoppingCartOutlined />,
  inventory: <DatabaseOutlined />,
  recipes: <BookOutlined />,
  production: <ToolOutlined />,
  products: <ProductOutlined />,
  orders: <TagsOutlined />,
  catalogs: <SettingOutlined />,
  users: <TeamOutlined />,
  roles: <SafetyCertificateOutlined />,
  imports: <FileExcelOutlined />,
};

function toMenuItem(module: AppModule) {
  return {
    key: module.href,
    icon: moduleIcons[module.key],
    label: module.label,
  };
}

type DashboardShellProps = {
  children: React.ReactNode;
  user: AuthenticatedUser;
};

export function DashboardShell({ children, user }: DashboardShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const collapsed = useUiStore((state) => state.menuCollapsed);
  const setCollapsed = useUiStore((state) => state.setMenuCollapsed);

  const selectedKey = useMemo(() => {
    const candidates = [...appModules, ...administrationModules, ...helpModules]
      .filter((module) => pathname.startsWith(module.href))
      .sort((a, b) => b.href.length - a.href.length);
    return candidates[0]?.href ?? "/dashboard";
  }, [pathname]);

  const currentModule = findModuleByHref(selectedKey);

  const allowedAppModules = appModules.filter((module) => user.permissions.includes(module.permission));
  const allowedAdministrationModules = administrationModules.filter((module) => user.permissions.includes(module.permission));
  const allowedHelpModules = helpModules.filter((module) => user.permissions.includes(module.permission));
  const menuItems: MenuProps["items"] = [
    {
      type: "group",
      label: "OPERACIÓN",
      children: allowedAppModules.map(toMenuItem),
    },
    {
      type: "group",
      label: "ADMINISTRACIÓN",
      children: allowedAdministrationModules.map(toMenuItem),
    },
    {
      type: "group",
      label: "AYUDA",
      children: allowedHelpModules.map(toMenuItem),
    },
  ];

  return (
    <Layout className="app-layout">
      <Sider
        className="app-sider"
        width={254}
        collapsedWidth={0}
        collapsed={collapsed}
        breakpoint="lg"
        trigger={null}
        onBreakpoint={setCollapsed}
      >
        <div className="brand">
          <span className="brand-mark">LK</span>
          <span className="brand-copy">
            <strong>LK INNOVACION</strong>
            <span>Operaciones</span>
          </span>
        </div>
        <Menu
          className="app-menu"
          mode="inline"
          theme="dark"
          items={menuItems}
          selectedKeys={[selectedKey]}
          onClick={({ key }) => {
            router.push(key);
            if (window.innerWidth < 992) setCollapsed(true);
          }}
        />
      </Sider>
      <Layout>
        <Header className="app-header">
          <Space size={14}>
            <Button
              type="text"
              aria-label={collapsed ? "Abrir menú" : "Cerrar menú"}
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
            />
            <div className="header-context">
              <span className="header-kicker">Centro de operaciones</span>
              <h2 className="header-title">
                {currentModule?.label ?? "LK INNOVACION"}
              </h2>
            </div>
          </Space>
          <Space size={10}>
            <ExchangeRateIndicator canManage={user.permissions.includes("catalogs.manage")} />
            <ThemeToggle />
            <NotificationCenter companyId={user.companyId} permissions={user.permissions} />
            <Dropdown
              menu={{
                items: [
                  { key: "profile", label: "Mi perfil", icon: <UserOutlined /> },
                  { type: "divider" },
                  { key: "logout", label: "Cerrar sesión" },
                ],
                onClick: async ({ key }) => {
                  if (key === "logout") {
                    await fetch("/api/v1/auth/logout", { method: "POST" });
                    router.replace("/login");
                    router.refresh();
                  }
                },
              }}
              trigger={["click"]}
            >
              <Button type="text">
                <Space>
                  <Avatar size="small" style={{ background: "#1d6f55" }}>
                    {user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
                  </Avatar>
                  <span className="desktop-only user-identity"><strong>{user.name}</strong><small>@{user.username}</small></span>
                  <MoreOutlined />
                </Space>
              </Button>
            </Dropdown>
          </Space>
        </Header>
        <Content>
          <main className="app-content">{children}</main>
        </Content>
      </Layout>
    </Layout>
  );
}
