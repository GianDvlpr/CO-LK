import { RecipesWorkspace } from "@/components/recipes/recipes-workspace";
import { requirePermission } from "@/modules/auth/application/session-service";

export default async function RecipesPage() {
  const user = await requirePermission("recipes.read");
  return <RecipesWorkspace permissions={user.permissions} canCreate={user.permissions.includes("recipes.create")} canActivate={user.permissions.includes("recipes.activate")} />;
}
