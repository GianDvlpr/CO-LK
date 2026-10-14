export type AppModule = {
  key: string;
  label: string;
  href: string;
  description: string;
  permission: string;
  phase: number;
};

export const appModules = [
  {
    key: "dashboard",
    label: "Analítica",
    href: "/dashboard",
    description: "Indicadores operativos, alertas y compromisos.",
    permission: "dashboard.read",
    phase: 1,
  },
  {
    key: "purchases",
    label: "Compras",
    href: "/dashboard/purchases",
    description: "Recepciones, aprobación, documentos e ingreso al kardex.",
    permission: "purchases.read",
    phase: 3,
  },
  {
    key: "inventory",
    label: "Almacén",
    href: "/dashboard/inventory",
    description: "Ítems, saldos, lotes, mínimos y movimientos.",
    permission: "inventory.read",
    phase: 2,
  },
  {
    key: "recipes",
    label: "Recetas",
    href: "/dashboard/recipes",
    description: "Versiones, rendimiento e ingredientes.",
    permission: "recipes.read",
    phase: 4,
  },
  {
    key: "production",
    label: "Producción",
    href: "/dashboard/production",
    description: "Órdenes, reservas, consumos y terminaciones.",
    permission: "production.read",
    phase: 4,
  },
  {
    key: "products",
    label: "Productos",
    href: "/dashboard/products",
    description: "Productos de calzado, tallas, colores y SKU.",
    permission: "products.read",
    phase: 2,
  },
  {
    key: "orders",
    label: "Pedidos",
    href: "/dashboard/orders",
    description: "Pedidos, reservas, faltantes y despacho.",
    permission: "orders.read",
    phase: 5,
  },
  {
    key: "catalogs",
    label: "Catálogos",
    href: "/dashboard/catalogs",
    description: "Proveedores, clientes, unidades, monedas y almacenes.",
    permission: "catalogs.read",
    phase: 2,
  },
] satisfies AppModule[];

export const administrationModules = [
  {
    key: "users",
    label: "Usuarios",
    href: "/dashboard/users",
    description: "Cuentas, estado y asignación de roles.",
    permission: "users.read",
    phase: 1,
  },
  {
    key: "roles",
    label: "Roles y permisos",
    href: "/dashboard/roles",
    description: "Matriz RBAC y permisos atómicos.",
    permission: "roles.read",
    phase: 1,
  },
  {
    key: "imports",
    label: "Importaciones",
    href: "/dashboard/imports",
    description: "Historial, previsualizaciones y errores de Excel.",
    permission: "imports.read",
    phase: 6,
  },
] satisfies AppModule[];

export const helpModules = [
  {
    key: "guide",
    label: "Guía",
    href: "/dashboard/guide",
    description: "Orden recomendado, dependencias y campos obligatorios.",
    permission: "dashboard.read",
    phase: 1,
  },
] satisfies AppModule[];

export const allModules = [...appModules, ...administrationModules, ...helpModules];

export function findModuleByHref(href: string) {
  return allModules.find((module) => module.href === href);
}
