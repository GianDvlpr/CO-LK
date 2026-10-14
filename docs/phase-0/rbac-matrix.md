# Matriz RBAC propuesta

## Roles

| Rol | Finalidad |
|---|---|
| Superadministrador | Configuración, usuarios, roles, auditoría y acceso global de la empresa |
| Administrador | Administración operativa sin gestionar usuarios, roles ni auditoría completa |
| Compras | Proveedores, compras y documentos |
| Aprobador | Aprobaciones y rechazos de compras |
| Almacén | Ítems, kardex, reservas y ajustes operativos |
| Producción | Recetas y órdenes de producción |
| Ventas | Clientes y pedidos |
| Consulta | Lectura y reportes autorizados |

## Permisos iniciales

| Dominio | Permisos |
|---|---|
| Catálogos | `catalogs.read`, `catalogs.manage` |
| Usuarios | `users.read`, `users.create`, `users.update`, `users.deactivate` |
| Roles | `roles.read`, `roles.manage` |
| Compras | `purchases.read`, `purchases.create`, `purchases.update`, `purchases.submit`, `purchases.approve`, `purchases.reject`, `purchases.reverse`, `purchases.export` |
| Inventario | `inventory.read`, `inventory.create_item`, `inventory.adjust_request`, `inventory.adjust_approve`, `inventory.adjust_value_request`, `inventory.adjust_value_approve`, `inventory.opening_import`, `inventory.export` |
| Recetas | `recipes.read`, `recipes.create`, `recipes.update`, `recipes.activate`, `recipes.archive`, `recipes.export` |
| Producción | `production.read`, `production.create`, `production.release`, `production.start`, `production.complete`, `production.cancel`, `production.scrap` |
| Productos | `products.read`, `products.create`, `products.update`, `products.image_manage`, `products.export` |
| Pedidos | `orders.read`, `orders.create`, `orders.update`, `orders.confirm`, `orders.link_production`, `orders.dispatch`, `orders.deliver`, `orders.cancel`, `orders.export` |
| Importaciones | `imports.read`, `imports.preview`, `imports.confirm` |
| Auditoría | `audit.read` |

## Asignación recomendada

| Permiso / grupo | Superadmin | Admin | Compras | Aprobador | Almacén | Producción | Ventas | Consulta |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Lectura de su dominio | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Según asignación |
| Crear/editar en su dominio | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | — |
| Aprobar/rechazar compras | ✓ | ✓ | — | ✓ | — | — | — | — |
| Solicitar ajuste de valor | ✓ | ✓ | — | — | ✓ | — | — | — |
| Aprobar ajuste de valor | ✓ | ✓ | — | ✓ | — | — | — | — |
| Usuarios y roles | ✓ | — | — | — | — | — | — | — |
| Auditoría completa | ✓ | — | — | ✓ | — | — | — | — |

La misma persona no debe solicitar y aprobar un ajuste de valor. La API evalúa permisos; ocultar botones en la interfaz no constituye autorización.
