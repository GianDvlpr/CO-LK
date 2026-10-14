import { DashboardShell } from "@/components/common/dashboard-shell";
import { getCurrentUser } from "@/modules/auth/application/session-service";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser().catch((error: unknown) => {
    if (error instanceof AuthError) return null;
    throw error;
  });
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  return <DashboardShell user={user}>{children}</DashboardShell>;
}
