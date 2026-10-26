# Contexto técnico para continuar LK INNOVACION

Actualizado: 26/10/2026.

## 1. Qué es el sistema

LK INNOVACION es una webapp interna para una fábrica peruana de suelas para calzado. Controla abastecimiento, inventario valorizado, formulaciones, producción por talla y color, maquinaria, pedidos, preparación de despacho, usuarios y alertas.

El producto está en etapa MVP avanzada y usa datos reales en Neon junto con una empresa demo aislada. No es una tienda en línea ni un ERP contable completo.

## 2. Stack vigente

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16, App Router |
| Interfaz | React 19, Ant Design 6, CSS global responsive |
| Datos cliente | TanStack Query; Zustand solo para estado efímero de UI |
| Lenguaje | TypeScript estricto |
| Base de datos | PostgreSQL en Neon |
| ORM | Prisma 6 con `@prisma/adapter-neon` |
| Validación | Zod |
| Decimales | decimal.js y columnas Prisma `Decimal` |
| Tiempo real | Pusher mediante patrón outbox |
| Imágenes | Cloudinary |
| Excel | ExcelJS |
| PDF | pdf-lib |
| Gráficos | Recharts |
| Pruebas | Vitest y Playwright |
| Contraseñas | Argon2 |

Versiones de ejecución requeridas: Node `>=24 <25` y npm `>=11 <12`.

## 3. Arquitectura

Se usa un monolito modular desplegable como una sola aplicación Next.js. PostgreSQL es la fuente de verdad; Pusher solo notifica y Cloudinary solo almacena binarios.

Flujo esperado de una escritura:

```text
UI React
  → Route Handler /api/v1
  → sesión y permiso
  → validación Origin y Zod
  → servicio de aplicación
  → transacción Prisma
  → datos + auditoría + outbox
  → respuesta { data, meta }
  → invalidación de TanStack Query
```

Responsabilidades:

- `src/app/`: páginas, layouts y Route Handlers.
- `src/components/`: workspaces de interfaz por módulo y componentes compartidos.
- `src/modules/*/domain`: reglas puras sin React, Next.js ni Prisma cuando sea posible.
- `src/modules/*/application`: casos de uso y límites transaccionales.
- `src/lib/`: base de datos, configuración, HTTP e integraciones compartidas.
- `prisma/schema.prisma`: modelo físico vigente.
- `prisma/migrations/`: historial inmutable de cambios del esquema.
- `tests/unit/`: reglas puras y formatos.
- `tests/integration/`: transacciones reales sobre una rama Neon temporal.
- `tests/e2e/`: flujos de navegador.

La separación modular todavía es pragmática: varios módulos tienen Route Handlers con lógica local. Al ampliar una operación crítica, preferir moverla a un servicio de aplicación reutilizable en lugar de duplicarla.

## 4. Módulos y rutas principales

| Módulo | UI | API principal |
|---|---|---|
| Analítica | `/dashboard` | `/api/v1/dashboard/analytics` |
| Compras | `/dashboard/purchases` | `/api/v1/purchases` |
| Almacén / Kardex | `/dashboard/inventory` | `/api/v1/inventory` |
| Recetas | `/dashboard/recipes` | `/api/v1/recipes` |
| Estructura de costos | `/dashboard/costs` | `/api/v1/costs` |
| Producción | `/dashboard/production` | `/api/v1/production` |
| Maquinaria | `/dashboard/machinery` | `/api/v1/machinery` |
| Productos | `/dashboard/products` | `/api/v1/products` |
| Pedidos | `/dashboard/orders` | `/api/v1/orders` |
| Pick & Pack | `/dashboard/pick-pack` | `/api/v1/pick-pack` |
| Calendario | `/dashboard/calendar` | `/api/v1/calendar` |
| Pizarra | `/dashboard/whiteboard` | `/api/v1/whiteboard` |
| Catálogos | `/dashboard/catalogs` | `/api/v1/catalogs` |
| Usuarios | `/dashboard/users` | `/api/v1/users` |
| Roles | `/dashboard/roles` | `/api/v1/roles` |
| Sesiones | `/dashboard/sessions` | `/api/v1/sessions` |
| Auditoría | `/dashboard/audit` | `/api/v1/audit` |
| Importaciones | `/dashboard/imports` | `/api/v1/imports` |
| Guía | `/dashboard/guide` | Sin API propia |

La navegación visible se define en `src/lib/config/modules.ts` y se filtra por permisos.

## 5. Patrones técnicos importantes

### Respuestas HTTP

Usar `apiSuccess` y `apiError` de `src/lib/http/api-response.ts`.

```json
{ "data": {}, "meta": { "requestId": "..." } }
```

```json
{ "error": { "code": "...", "message": "...", "fields": {}, "requestId": "..." } }
```

Los códigos de error deben ser estables y los mensajes legibles en español.

### Autenticación y empresa

- Login solo por nombre de usuario.
- Cookie opaca `HttpOnly`, `SameSite=Lax`; `Secure` en producción.
- El servidor guarda únicamente el HMAC del token.
- Todas las sesiones vencen 8 horas después de iniciarse. No existe opción de sesión prolongada.
- `requirePermission()` devuelve usuario, empresa, roles y permisos.
- Toda consulta multiempresa debe filtrar por `companyId` de la sesión.
- Las escrituras validan `requireSameOrigin()`.
- Un superadministrador puede restablecer una contraseña temporal, pero nunca ver la contraseña actual.

### Inventario

- `StockMovement` es el historial inmutable.
- `StockBalance` es una proyección actualizada en la misma transacción.
- Reservar reduce disponibilidad, no cantidad física.
- No permitir stock físico ni reservado incoherente.
- Costear con promedio ponderado y `Decimal`.
- Los movimientos se ordenan con `postingSequence` monotónica.
- Los lotes se consumen FIFO cuando corresponde.

### Tiempo real

La transacción crea un `OutboxEvent`. El procesador publica a Pusher y crea notificaciones persistentes. El cliente invalida consultas; el evento nunca reemplaza la lectura de la API.

### Códigos de negocio

Se generan dentro de la transacción con bloqueo consultivo y `CorrelativeCounter` en `src/lib/database/business-code.ts`.

| Entidad | Formato |
|---|---|
| Compra | `CMP-AAAA-000001` |
| Materia prima | `MP-000001` |
| Merma recuperable | `MER-000001` |
| Producto terminado | `PT-000001` |
| Producto | `PROD-AAAA-000001` |
| Receta | `REC-000001` |
| Producción | `OP-AAAA-000001` |
| Maquinaria | `MAQ-000001` |
| Pedido | `PED-AAAA-000001` |
| Pick & Pack | `PP-AAAA-000001` |
| Proveedor | `PROV-000001` |
| Cliente | `CLI-000001` |

No reutilizar correlativos ni permitir edición manual del código generado.

## 6. Configuración y secretos

Copiar `.env.example` a `.env.local`. Variables principales:

- `DATABASE_URL`: conexión agrupada usada por la aplicación.
- `DATABASE_URL_UNPOOLED`: conexión directa para operaciones que la requieran.
- `SESSION_SECRET`: mínimo 32 caracteres.
- `SESSION_COOKIE_NAME`.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
- `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER`.
- `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER`.
- `SUNAT_RUC_API_TOKEN_1`, `SUNAT_RUC_API_TOKEN_2` y URLs de consulta.
- `WORKER_SECRET` para el procesador outbox programado.
- Variables `SEED_*` únicamente durante bootstrap.

No copiar valores reales en prompts, logs, documentación o commits. La clave pública de Pusher y el identificador del proyecto Neon pueden estar documentados; las URLs con contraseña y los secretos no.

## 7. Comandos habituales

```powershell
npm ci
npm run dev
npm run db:generate
npm run db:validate
npm run typecheck
npm run test:sandbox
npm run lint
npm run build
```

Base de datos y datos:

```powershell
npm run db:deploy-neon
npm run db:seed-neon
npm run demo:seed
npm run demo:cleanup
```

`demo:seed` recrea únicamente la empresa aislada `LK INNOVACION · DEMO`. No usar scripts de limpieza alternativos sobre la empresa real.

## 8. Estado funcional actual

El sistema ya implementa:

- autenticación, cambio y restablecimiento seguro de contraseña, RBAC y monitoreo/revocación de sesiones;
- auditoría filtrable de accesos, operaciones, importaciones y exportaciones con reporte Excel;
- catálogos editables, activación/inactivación y consulta DNI/RUC;
- compras con presentación, IGV, aprobación e ingreso valorizado;
- almacén, stock inicial controlado, kardex, lotes y mínimos;
- productos con matriz, tallas, hasta dos colores, SKU e imágenes;
- recetas versionadas con rendimiento manual y cantidades estándar;
- estructura de costos por receta con materiales, tarifas directas y costo unitario;
- producción por pedido, talla, color, formulaciones C1/C2, máquina, turnos, componentes, reserva, consumo, merma real al cierre y entrada terminada;
- Excel y PDF de la orden de producción;
- pedidos, Pick & Pack, formato imprimible y despacho;
- maquinaria y mantenimientos;
- analítica, calendario, Kanban, biblioteca de pizarras compartidas y notificaciones;
- plantillas, reportes e importaciones Excel para Compras, Almacén, Recetas, Productos y Pedidos.

Para el detalle de reglas, consultar `docs/ai/DOMAIN_RULES.md`.

## 9. Fuentes de verdad y documentos históricos

- Modelo actual: `prisma/schema.prisma`.
- Transacciones críticas: `src/modules/*/application`.
- Contratos efectivos: `src/app/api/v1/**/route.ts`.
- Formatos Excel actuales: `src/modules/imports/application/workbook.ts`.
- Permisos sembrados: `prisma/seed.ts`.
- Estado resumido: `docs/implementation-status.md`.
- Decisiones históricas: `docs/phase-0/` y `Plan_de_trabajo_LK_INNOVACION.md`.

No asumir que una plantilla binaria antigua de `docs/phase-0/excel-templates/` coincide con la plantilla dinámica actual. La generación en código es la fuente vigente.

## 10. Riesgos y límites conocidos

- No hay contabilidad general, planilla, facturación electrónica ni integración oficial directa con SUNAT.
- DNI/RUC depende de un proveedor externo y debe permitir ingreso manual si falla.
- El outbox necesita un programador externo en producción para operar sin usuarios conectados.
- Las pruebas E2E pueden fallar en sandboxes Windows que bloquean procesos; documentar la limitación sin omitir las demás comprobaciones.
- Hay documentación histórica con estados ya retirados, como `SCRAPPED` o `DELIVERED`; el esquema Prisma vigente manda.

