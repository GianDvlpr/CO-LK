import { redirect } from "next/navigation";
import { AuthError } from "./auth-errors";
import { getCurrentUser } from "./session-service";

export async function requirePagePermission(permission: string) {
  const user = await getCurrentUser().catch((error: unknown) => {
    if (error instanceof AuthError) return null;
    throw error;
  });

  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  if (!user.permissions.includes(permission)) redirect("/dashboard");
  return user;
}
