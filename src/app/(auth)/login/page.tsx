import type { Metadata } from "next";
import { LoginCard } from "@/components/auth/login-card";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default function LoginPage() {
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
