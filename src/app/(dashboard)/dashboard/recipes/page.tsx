import { RecipesWorkspace } from "@/components/recipes/recipes-workspace";
import { requirePagePermission } from "@/modules/auth/application/page-authorization";

export default async function RecipesPage() {
  const user = await requirePagePermission("recipes.read");
  return <RecipesWorkspace permissions={user.permissions} canCreate={user.permissions.includes("recipes.create")} canActivate={user.permissions.includes("recipes.activate")} />;
}
