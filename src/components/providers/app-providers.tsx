"use client";

import { AntdRegistry } from "@ant-design/nextjs-registry";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider, theme as antdTheme } from "antd";
import esES from "antd/locale/es_ES";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { useUiStore } from "@/stores/ui-store";

type AppProvidersProps = {
  children: React.ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  const themeMode = useUiStore((state) => state.themeMode);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 2 * 60_000,
            gcTime: 15 * 60_000,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            retry: 1,
          },
        },
      }),
  );

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.style.colorScheme = themeMode;
  }, [themeMode]);

  return (
    <AntdRegistry>
      <ConfigProvider
        locale={esES}
        theme={{
          algorithm: themeMode === "dark" ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          token: {
            colorPrimary: "#1d6f55",
            colorInfo: "#1d6f55",
            borderRadius: 12,
            colorBgLayout: themeMode === "dark" ? "#101713" : "#f3f6f4",
            colorBgContainer: themeMode === "dark" ? "#17211c" : "#ffffff",
            colorBorderSecondary: themeMode === "dark" ? "#2b3b33" : "#dce6e1",
            fontFamily:
              "var(--font-geist-sans), Inter, ui-sans-serif, system-ui, sans-serif",
          },
          components: {
            Button: { controlHeight: 40, fontWeight: 650 },
            Card: { paddingLG: 22 },
            Menu: { itemBorderRadius: 10, itemMarginInline: 8 },
          },
        }}
      >
        <QueryClientProvider client={queryClient}>
          {children}
          <Toaster richColors position="top-right" theme={themeMode} />
        </QueryClientProvider>
      </ConfigProvider>
    </AntdRegistry>
  );
}
