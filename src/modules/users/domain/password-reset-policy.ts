export type PasswordResetPolicyResult = "ALLOWED" | "SUPERADMIN_REQUIRED" | "SELF_RESET_NOT_ALLOWED";

export function passwordResetPolicy(input: { actorId: string; targetId: string; actorRoles: string[] }): PasswordResetPolicyResult {
  if (!input.actorRoles.includes("SUPERADMIN")) return "SUPERADMIN_REQUIRED";
  if (input.actorId === input.targetId) return "SELF_RESET_NOT_ALLOWED";
  return "ALLOWED";
}
