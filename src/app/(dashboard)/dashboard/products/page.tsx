import { ProductsWorkspace } from "@/components/products/products-workspace";
import { isCloudinaryConfigured } from "@/lib/cloudinary/server";
import { requirePagePermission } from "@/modules/auth/application/page-authorization";

export default async function ProductsPage() {
  const user = await requirePagePermission("products.read");
  return <ProductsWorkspace permissions={user.permissions} canCreate={user.permissions.includes("products.create")} canManageImages={user.permissions.includes("products.image_manage")} cloudinaryConfigured={isCloudinaryConfigured()} />;
}
