import type { Metadata } from "next";
import { AppProviders } from "@/components/providers/app-providers";
import { appConfig } from "@/lib/config/app";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: appConfig.name,
    template: `%s | ${appConfig.name}`,
  },
  description: appConfig.description,
  icons: {
    icon: [{ url: "/brand/lk-logo.jpeg", type: "image/jpeg" }],
    shortcut: "/brand/lk-logo.jpeg",
    apple: "/brand/lk-logo.jpeg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
