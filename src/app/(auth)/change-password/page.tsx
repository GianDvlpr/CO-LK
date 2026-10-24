import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChangePasswordCard } from "@/components/auth/change-password-card";
import { getCurrentUser } from "@/modules/auth/application/session-service";
import { BrandIdentity } from "@/components/common/brand-identity";

export const metadata: Metadata = { title: "Cambiar contraseña" };
export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect("/dashboard");
  return (
    <main className="login-page">
      <section className="login-visual">
        <BrandIdentity subtitle="Gestión operativa" priority />
        <div className="login-message"><h1>Protege tu cuenta.</h1><p>Esta contraseña temporal fue creada para el primer acceso y debe reemplazarse antes de usar la plataforma.</p></div>
      </section>
      <section className="login-panel"><ChangePasswordCard /></section>
    </main>
  );
}
