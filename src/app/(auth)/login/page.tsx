import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginCard } from "@/components/auth/login-card";
import { AuthError } from "@/modules/auth/application/auth-errors";
import { getCurrentUser } from "@/modules/auth/application/session-service";

export const metadata: Metadata = { title: "Iniciar sesión" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser().catch((error: unknown) => {
    if (error instanceof AuthError) return null;
    throw error;
  });
  if (user) redirect(user.mustChangePassword ? "/change-password" : "/dashboard");

  return (
    <main className="login-page">
      <section className="login-visual">
        <div className="brand" style={{ padding: 0 }}>
          <span className="brand-mark">LK</span>
          <span className="brand-copy">
            <strong>LK INNOVACION</strong>
            <span>Gestión operativa</span>
          </span>
        </div>
        <div className="login-message">
          <h1>Del insumo al producto terminado.</h1>
          <p>
            Compras, almacén, recetas, producción y pedidos conectados por un
            kardex confiable y trazable.
          </p>
        </div>
        <span style={{ position: "relative", zIndex: 1, opacity: 0.58 }}>
          Plataforma interna · Lima, Perú
        </span>
      </section>
      <section className="login-panel">
        <LoginCard />
      </section>
    </main>
  );
}
