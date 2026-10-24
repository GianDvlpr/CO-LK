export const SUPERADMIN_ROLE_CODE = "SUPERADMIN";

export function isSuperadmin(roleCodes: readonly string[]) {
  return roleCodes.includes(SUPERADMIN_ROLE_CODE);
}

export function canSeeUser(actorRoleCodes: readonly string[], targetRoleCodes: readonly string[]) {
  return isSuperadmin(actorRoleCodes) || !isSuperadmin(targetRoleCodes);
}

export function canAssignRoles(actorRoleCodes: readonly string[], assignedRoleCodes: readonly string[]) {
  return isSuperadmin(actorRoleCodes) || !isSuperadmin(assignedRoleCodes);
}
