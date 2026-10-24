import { describe, expect, it } from "vitest";
import { canAssignRoles, canSeeUser, isSuperadmin } from "@/modules/users/domain/privileged-user-policy";

describe("privileged user policy", () => {
  it("permite que un superadministrador vea usuarios de cualquier rango", () => {
    expect(canSeeUser(["SUPERADMIN"], ["SUPERADMIN"])).toBe(true);
    expect(canSeeUser(["SUPERADMIN"], ["ADMIN"])).toBe(true);
  });

  it("oculta al superadministrador para administradores y roles inferiores", () => {
    expect(canSeeUser(["ADMIN"], ["SUPERADMIN"])).toBe(false);
    expect(canSeeUser(["OPERADOR"], ["SUPERADMIN", "ADMIN"])).toBe(false);
    expect(canSeeUser(["ADMIN"], ["OPERADOR"])).toBe(true);
  });

  it("impide que un rango inferior asigne el rol de superadministrador", () => {
    expect(canAssignRoles(["ADMIN"], ["SUPERADMIN"])).toBe(false);
    expect(canAssignRoles(["ADMIN"], ["OPERADOR"])).toBe(true);
    expect(canAssignRoles(["SUPERADMIN"], ["SUPERADMIN"])).toBe(true);
    expect(isSuperadmin(["ADMIN", "SUPERADMIN"])).toBe(true);
  });
});
