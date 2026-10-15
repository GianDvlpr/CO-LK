import { describe, expect, it } from "vitest";
import { passwordResetPolicy } from "@/modules/users/domain/password-reset-policy";

describe("política de restablecimiento de contraseña", () => {
  it("permite que un superadministrador restablezca la cuenta de otro usuario", () => {
    expect(passwordResetPolicy({ actorId: "superadmin", targetId: "usuario", actorRoles: ["SUPERADMIN"] })).toBe("ALLOWED");
  });

  it("rechaza administradores y roles operativos", () => {
    expect(passwordResetPolicy({ actorId: "admin", targetId: "usuario", actorRoles: ["ADMIN"] })).toBe("SUPERADMIN_REQUIRED");
  });

  it("evita que el superadministrador use el flujo de recuperación sobre su propia sesión", () => {
    expect(passwordResetPolicy({ actorId: "superadmin", targetId: "superadmin", actorRoles: ["SUPERADMIN"] })).toBe("SELF_RESET_NOT_ALLOWED");
  });
});
