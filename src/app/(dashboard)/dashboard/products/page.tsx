import { ProductsWorkspace } from "@/components/products/products-workspace";
import { isCloudinaryConfigured } from "@/lib/cloudinary/server";
import { requirePermission } from "@/modules/auth/application/session-service";

export default async function ProductsPage() {
  const user = await requirePermission("products.read");
  return <ProductsWorkspace permissions={user.permissions} canCreate={user.permissions.includes("products.create")} canManageImages={user.permissions.includes("products.image_manage")} cloudinaryConfigured={isCloudinaryConfigured()} />;
}
