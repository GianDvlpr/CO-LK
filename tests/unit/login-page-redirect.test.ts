import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/modules/auth/application/session-service", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/components/auth/login-card", () => ({ LoginCard: () => null }));

import LoginPage from "@/app/(auth)/login/page";

describe("LoginPage", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset();
    mocks.redirect.mockReset();
  });

  it("muestra el login cuando no existe una sesión vigente", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const page = await LoginPage();

    expect(page).toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirige al dashboard cuando el usuario ya inició sesión", async () => {
    mocks.getCurrentUser.mockResolvedValue({ mustChangePassword: false });

    await LoginPage();

    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("redirige al cambio de contraseña cuando todavía es obligatorio", async () => {
    mocks.getCurrentUser.mockResolvedValue({ mustChangePassword: true });

    await LoginPage();

    expect(mocks.redirect).toHaveBeenCalledWith("/change-password");
  });
});
