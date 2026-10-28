"use client";

import {
  AppstoreOutlined,
  BookOutlined,
  CalendarOutlined,
  CalculatorOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  FileExcelOutlined,
  FileSearchOutlined,
  InboxOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MoreOutlined,
  ProductOutlined,
  HighlightOutlined,
  QuestionCircleOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  TagsOutlined,
  TeamOutlined,
  ToolOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Avatar, Button, Dropdown, Layout, Menu, Tabs } from "antd";
import type { MenuProps } from "antd";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import {
  administrationModules,
  allModules,
  appModules,
  findModuleByHref,
  helpModules,
} from "@/lib/config/modules";
import type { AppModule } from "@/lib/config/modules";
import { useUiStore } from "@/stores/ui-store";
import type { StoredWorkspaceTab } from "@/stores/ui-store";
import type { AuthenticatedUser } from "@/modules/auth/application/session-service";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { ExchangeRateIndicator } from "@/components/exchange-rates/exchange-rate-indicator";
import { BrandIdentity } from "@/components/common/brand-identity";

const { Header, Sider, Content } = Layout;
const MAX_WORKSPACE_TABS = 8;

type WorkspaceTab = {
  key: string;
  href: string;
  label: string;
  moduleKey: string;
};

const moduleIcons: Record<string, React.ReactNode> = {
  dashboard: <AppstoreOutlined />,
  guide: <QuestionCircleOutlined />,
  purchases: <ShoppingCartOutlined />,
  inventory: <DatabaseOutlined />,
  recipes: <BookOutlined />,
  costs: <CalculatorOutlined />,
  production: <ToolOutlined />,
  machinery: <RobotOutlined />,
  products: <ProductOutlined />,
  orders: <TagsOutlined />,
  "pick-pack": <InboxOutlined />,
  calendar: <CalendarOutlined />,
  whiteboard: <HighlightOutlined />,
  catalogs: <SettingOutlined />,
  users: <TeamOutlined />,
  roles: <SafetyCertificateOutlined />,
  sessions: <ClockCircleOutlined />,
  audit: <FileSearchOutlined />,
  imports: <FileExcelOutlined />,
};

function toMenuItem(module: AppModule) {
  return {
    key: module.href,
    icon: moduleIcons[module.key],
    label: module.label,
  };
}

function workspaceTab(module: AppModule, href = module.href): WorkspaceTab {
  return { key: module.href, href, label: module.label, moduleKey: module.key };
}

function upsertWorkspaceTab(tabs: WorkspaceTab[], module: AppModule, href: string) {
  const existing = tabs.find((tab) => tab.key === module.href);
  if (existing) return tabs.map((tab) => tab.key === module.href ? { ...tab, href } : tab);

  const next = [...tabs, workspaceTab(module, href)];
  if (next.length <= MAX_WORKSPACE_TABS) return next;
  const removableIndex = next.findIndex((tab) => tab.key !== "/dashboard" && tab.key !== module.href);
  if (removableIndex >= 0) next.splice(removableIndex, 1);
  return next.slice(-MAX_WORKSPACE_TABS);
}

function restoreWorkspaceTabs(stored: StoredWorkspaceTab[], allowedModules: AppModule[]) {
  const moduleByHref = new Map(allowedModules.map((appModule) => [appModule.href, appModule]));
  const restored: WorkspaceTab[] = [];
  for (const item of stored) {
    const appModule = moduleByHref.get(item.key);
    if (!appModule || (item.href !== appModule.href && !item.href.startsWith(`${appModule.href}/`))) continue;
    if (!restored.some((tab) => tab.key === appModule.href)) restored.push(workspaceTab(appModule, item.href));
  }
  const dashboard = moduleByHref.get("/dashboard");
  const tabs = dashboard && !restored.some((tab) => tab.key === dashboard.href)
    ? [workspaceTab(dashboard), ...restored]
    : restored;
  return tabs.slice(0, MAX_WORKSPACE_TABS);
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
  const storedTabs = useUiStore((state) => state.workspaceTabsByUser[user.id] ?? []);
  const setWorkspaceTabs = useUiStore((state) => state.setWorkspaceTabs);

  const selectedKey = useMemo(() => {
    const candidates = [...appModules, ...administrationModules, ...helpModules]
      .filter((module) => pathname.startsWith(module.href))
      .sort((a, b) => b.href.length - a.href.length);
    return candidates[0]?.href ?? "/dashboard";
  }, [pathname]);

  const currentModule = findModuleByHref(selectedKey);
  const allowedModules = useMemo(() => allModules.filter((module) => user.permissions.includes(module.permission)), [user.permissions]);
  const openTabs = useMemo(() => {
    const restored = restoreWorkspaceTabs(storedTabs, allowedModules);
    return currentModule && user.permissions.includes(currentModule.permission)
      ? upsertWorkspaceTab(restored, currentModule, pathname)
      : restored;
  }, [allowedModules, currentModule, pathname, storedTabs, user.permissions]);

  useEffect(() => {
    const next = openTabs.map(({ key, href }) => ({ key, href }));
    if (JSON.stringify(next) !== JSON.stringify(storedTabs)) setWorkspaceTabs(user.id, next);
  }, [openTabs, setWorkspaceTabs, storedTabs, user.id]);

  useEffect(() => {
    if (!currentModule) return;
    void fetch("/api/v1/audit/module-access", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: pathname }),
      keepalive: true,
    });
  }, [currentModule, pathname]);

  const allowedAppModules = appModules.filter((module) => user.permissions.includes(module.permission));
  const allowedAdministrationModules = administrationModules.filter((module) => user.permissions.includes(module.permission));
  const allowedHelpModules = helpModules.filter((module) => user.permissions.includes(module.permission));
  const closeTab = (key: string) => {
    if (key === "/dashboard") return;
    const index = openTabs.findIndex((tab) => tab.key === key);
    if (index < 0) return;
    const next = openTabs.filter((tab) => tab.key !== key);
    setWorkspaceTabs(user.id, next.map(({ key: tabKey, href }) => ({ key: tabKey, href })));
    if (selectedKey === key) router.push(next[Math.max(0, index - 1)]?.href ?? "/dashboard");
  };
  const closeOtherTabs = () => {
    const next = openTabs.filter((tab) => tab.key === "/dashboard" || tab.key === selectedKey);
    setWorkspaceTabs(user.id, next.map(({ key, href }) => ({ key, href })));
  };
  const closeAllTabs = () => {
    const dashboard = openTabs.find((tab) => tab.key === "/dashboard") ?? workspaceTab(appModules[0]);
    setWorkspaceTabs(user.id, [{ key: dashboard.key, href: dashboard.href }]);
    router.push("/dashboard");
  };
  const tabItems = openTabs.map((tab) => ({
    key: tab.key,
    closable: tab.key !== "/dashboard",
    label: <span className="workspace-tab-label">{moduleIcons[tab.moduleKey]}<span>{tab.label}</span></span>,
  }));
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
      {!collapsed ? <button className="mobile-sider-backdrop" type="button" aria-label="Cerrar menú" onClick={() => setCollapsed(true)} /> : null}
      <Sider
        className="app-sider"
        width={254}
        collapsedWidth={0}
        collapsed={collapsed}
        breakpoint="lg"
        trigger={null}
        onBreakpoint={setCollapsed}
      >
        <BrandIdentity priority />
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
          <div className="header-navigation">
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
          </div>
          <div className="header-actions">
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
              <Button type="text" className="user-menu-trigger" aria-label={`Cuenta de ${user.name}`}>
                <span className="user-trigger-content">
                  <Avatar size="small" src={user.avatarUrl ?? undefined} style={{ background: "#1d6f55" }}>
                    {user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
                  </Avatar>
                  <span className="desktop-only user-identity"><strong>{user.name}</strong><small>@{user.username}</small></span>
                  <MoreOutlined className="user-more-icon" />
                </span>
              </Button>
            </Dropdown>
          </div>
        </Header>
        <div className="workspace-tabs-bar">
          <Tabs
            type="editable-card"
            hideAdd
            size="small"
            activeKey={selectedKey}
            items={tabItems}
            onChange={(key) => {
              const tab = openTabs.find((item) => item.key === key);
              if (tab) router.push(tab.href);
            }}
            onEdit={(targetKey, action) => {
              if (action === "remove" && typeof targetKey === "string") closeTab(targetKey);
            }}
            tabBarExtraContent={<Dropdown menu={{ items: [
              { key: "others", label: "Cerrar otras", disabled: openTabs.length <= 1 },
              { key: "all", label: "Cerrar todas", disabled: openTabs.length <= 1 },
            ], onClick: ({ key }) => key === "others" ? closeOtherTabs() : closeAllTabs() }} trigger={["click"]}><Button type="text" size="small" icon={<MoreOutlined />} aria-label="Opciones de pestañas" /></Dropdown>}
          />
        </div>
        <Content>
          <main className="app-content">{children}</main>
        </Content>
      </Layout>
    </Layout>
  );
}
