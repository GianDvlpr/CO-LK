import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChangePasswordCard } from "@/components/auth/change-password-card";
import { getCurrentUser } from "@/modules/auth/application/session-service";

export const metadata: Metadata = { title: "Cambiar contraseña" };
export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect("/dashboard");
  return (
    <main className="login-page">
      <section className="login-visual">
        <div className="brand" style={{ padding: 0 }}><span className="brand-mark">LK</span><span className="brand-copy"><strong>LK INNOVACION</strong><span>Gestión operativa</span></span></div>
        <div className="login-message"><h1>Protege tu cuenta.</h1><p>Esta contraseña temporal fue creada para el primer acceso y debe reemplazarse antes de usar la plataforma.</p></div>
      </section>
      <section className="login-panel"><ChangePasswordCard /></section>
    </main>
  );
}
