# Plan de trabajo — LK INNOVACION

**Documento base para el MVP**  
**Fecha:** 13 de octubre de 2026  
**Destinatarios:** equipo de producto, desarrollo, QA y operaciones  
**Condición:** este documento es autosuficiente; no requiere revisar ningún otro proyecto

## 1. Recomendación ejecutiva

LK INNOVACION debe construirse como un **monolito modular full-stack con Next.js**:

- React y Next.js para la interfaz y las APIs del servidor.
- TypeScript en toda la solución.
- Prisma sobre PostgreSQL alojado en Neon.
- Ant Design para la interfaz.
- TanStack Query para consultas y caché del cliente.
- Zustand para estado global ligero.
- Zod para validar entradas.
- Cloudinary para imágenes y documentos.
- Pusher para avisos en tiempo real.
- ExcelJS para plantillas, importaciones y exportaciones XLSX.

El equipo implementará el sistema desde una base nueva siguiendo exclusivamente las decisiones, estructuras y criterios definidos en este plan. No se presupone acceso a código previo ni conocimiento de otra aplicación.

La estimación base, antes de cerrar la fase 0, es de **37 a 51 persona-semanas**. Equivale a **17 a 22 semanas calendario** con dos desarrolladores full-stack, QA parcial y participación del negocio; con aproximadamente tres FTE efectivos el rango base es de 13 a 18 semanas. Para autorización inicial de presupuesto y fecha se recomienda reservar 15–20% adicional: **43 a 61 persona-semanas y 20 a 27 semanas**. Al cerrar la fase 0 se reemplazará esa reserva por un pronóstico de backlog.

## 2. Especificación técnica obligatoria

Esta sección fija la base del proyecto. Cualquier cambio importante deberá documentarse mediante una decisión técnica breve antes de implementarse.

Convención del documento: **“se usará/debe”** es una decisión fija; **“valor de partida/supuesto”** requiere ratificación durante la fase 0 antes de desarrollar dominio; **“fuera del MVP”** no se implementa ni se incluye en la estimación. Una alternativa aprobada en fase 0 reemplaza el supuesto en este mismo documento y en el backlog.

### Versiones iniciales

| Área | Tecnología definida |
|---|---|
| Runtime | Node.js 24 LTS; npm fijado mediante `packageManager` y lockfile |
| Framework | Next.js 16.2.6, App Router |
| UI | React 19.2.4, TypeScript 5.9.3 |
| Componentes | Ant Design 6.4.3, Ant Design Icons 6.2.5 |
| Datos en cliente | TanStack Query 5.100.14 |
| Estado cliente | Zustand 5.0.14 |
| Validación | Zod 4.4.3 |
| ORM | Prisma 6.19.3 |
| Base de datos | PostgreSQL en Neon, con URL agrupada y URL directa |
| Archivos | Cloudinary 2.11.0 |
| Tiempo real | Pusher servidor + Pusher JS cliente |
| Excel | ExcelJS |
| Autenticación | Credenciales propias, sesión opaca en PostgreSQL y Argon2id |
| Pruebas | Vitest, Testing Library y Playwright |
| Correo/PDF | Nodemailer y PDFKit solo cuando el alcance los requiera |
| Gestor de paquetes | npm con `package-lock` v3 |

Las versiones se fijarán en `package.json` y `package-lock.json`. Una actualización mayor requiere ejecutar toda la suite de pruebas y registrar el motivo del cambio.

### Forma de la aplicación

- Un único repositorio y un único despliegue Next.js.
- Interfaz en React con App Router.
- API interna mediante Route Handlers bajo `/api/v1`.
- Reglas de negocio encapsuladas en `src/modules`; las rutas no contienen lógica de inventario, costos o estados.
- Persistencia únicamente mediante servicios de aplicación y Prisma.
- PostgreSQL es la fuente de verdad; Pusher solo notifica cambios.
- Cloudinary almacena binarios; PostgreSQL conserva identificadores, metadatos y relaciones.
- Excel se procesa en el servidor; ninguna fila se aplica sin validación y confirmación.

### Flujo obligatorio de una operación

```text
request → sesión → permiso → Zod → servicio de aplicación
        → transacción Prisma → auditoría/outbox → respuesta JSON
        → invalidación de React Query → actualización de interfaz
```

### Principios no negociables

- Contraseñas siempre cifradas con hash Argon2id; nunca se guardan o registran en texto plano.
- TypeScript con `strict: true`, sin `any` implícito y alias `@/*` hacia `src/*`.
- Sesiones revocables almacenadas en base de datos y cookies `httpOnly`, `secure` y `sameSite`.
- Dinero, costos y cantidades con `Decimal`; nunca `Float`.
- Estados finitos con enums de Prisma y transiciones validadas por servidor.
- Stock derivado de un kardex inmutable; no se modifica directamente.
- Operaciones de stock, aprobación y producción dentro de transacciones.
- Claves de idempotencia para aprobaciones, importaciones, consumos y publicación de eventos.
- Correlativos mediante secuencia o contador transaccional, nunca buscando `MAX + 1`.
- Permisos comprobados en servidor en cada endpoint.
- Auditoría para toda acción sensible.
- Pruebas automatizadas y pipeline CI obligatorios antes de desplegar.

## 3. Arquitectura objetivo

Se propone mantener un único despliegue para el MVP y separar claramente los módulos en el código.

```text
┌──────────────────────────────────────────────────────────────┐
│ Navegador                                                    │
│ React + Ant Design + TanStack Query + Zustand                │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTPS / JSON
┌──────────────────────────────▼───────────────────────────────┐
│ Next.js App Router                                           │
│ Páginas + Route Handlers + control de sesión/RBAC            │
├──────────────────────────────────────────────────────────────┤
│ Módulos de aplicación                                        │
│ Compras | Inventario | Recetas | Producción | Productos      │
│ Pedidos | Usuarios/RBAC | Excel | Notificaciones             │
├──────────────────────────────────────────────────────────────┤
│ Servicios compartidos                                        │
│ Zod | Auditoría | Idempotencia | Cloudinary | Pusher         │
│ Importación/Exportación | Logging                            │
└───────────────┬────────────────┬────────────────┬─────────────┘
                │                │                │
        ┌───────▼──────┐ ┌──────▼──────┐ ┌──────▼─────────┐
        │ Prisma       │ │ Cloudinary  │ │ Pusher         │
        │ PostgreSQL   │ │ documentos │ │ tiempo real    │
        │ Neon         │ │ e imágenes │ │                │
        └──────────────┘ └─────────────┘ └────────────────┘
```

### Organización propuesta

```text
src/
  app/
    (auth)/
    (dashboard)/
    api/v1/
  components/
    common/
    purchases/
    inventory/
    recipes/
    production/
    products/
    orders/
    users/
  modules/
    purchases/
      domain/
      application/
      infrastructure/
    inventory/
    recipes/
    production/
    products/
    orders/
  lib/
    auth/
    db/
    audit/
    cloudinary/
    pusher/
    excel/
    notifications/
  stores/
prisma/
tests/
  integration/
  e2e/
```

Cada carpeta tiene una responsabilidad definida: `app` compone páginas y endpoints, `components` contiene UI, `modules` concentra casos de uso y reglas, `lib` encapsula integraciones compartidas, `stores` mantiene solo estado cliente y `prisma` administra el esquema y las migraciones.

Dentro de cada módulo:

- `domain`: entidades, estados, cálculos, reglas y errores del negocio; no importa React, Next.js ni Prisma.
- `application`: casos de uso, permisos requeridos y límites transaccionales.
- `infrastructure`: repositorios Prisma y adaptadores externos.

La UI vive únicamente en `src/components/<module>`: formularios, tablas, modales y hooks visuales. No se crearán carpetas de componentes dentro de `src/modules`, evitando duplicar responsabilidades.

Un Route Handler solamente traduce HTTP, autentica, valida con Zod e invoca un caso de uso. No calcula IGV, no cambia estados por su cuenta y nunca modifica stock directamente. La coordinación entre módulos ocurre mediante casos de uso públicos, no accediendo a sus tablas desde componentes o rutas.

### Contrato de la API

La base será `/api/v1`. Los recursos se nombrarán en plural y en inglés dentro del código; las etiquetas visibles estarán en español.

Ejemplo de rutas de Compras:

```text
GET    /api/v1/purchases
POST   /api/v1/purchases
GET    /api/v1/purchases/:id
PATCH  /api/v1/purchases/:id
POST   /api/v1/purchases/:id/submit
POST   /api/v1/purchases/:id/approve
POST   /api/v1/purchases/:id/reject
POST   /api/v1/purchases/imports/preview
POST   /api/v1/purchases/imports/commit
GET    /api/v1/purchases/export
```

Respuesta correcta:

```json
{
  "data": {},
  "meta": { "requestId": "..." }
}
```

Listado paginado:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 125,
    "requestId": "..."
  }
}
```

Error:

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "No existe stock suficiente.",
    "fields": { "items.0.quantity": "Disponible: 8 kg" },
    "requestId": "..."
  }
}
```

Reglas del contrato:

- Fechas y horas por API en ISO 8601 y UTC; la interfaz las muestra en `America/Lima`.
- Cantidades, precios, tasas y totales decimales se intercambian como cadenas.
- Moneda mediante código ISO 4217, inicialmente `PEN` y `USD`.
- Paginación, filtros y ordenamiento se validan con Zod.
- Operaciones críticas aceptan `Idempotency-Key`.
- `preview` nunca escribe datos de negocio; solo `commit` puede hacerlo.
- Los códigos HTTP serán consistentes: `400` datos inválidos, `401` sin sesión, `403` sin permiso, `404` inexistente, `409` conflicto de estado/idempotencia y `422` regla de negocio.

### Mapa mínimo de pantallas

| Ruta | Pantalla y acciones principales |
|---|---|
| `/login` | Inicio de sesión |
| `/dashboard` | Indicadores: compras pendientes, stock bajo, producción y pedidos |
| `/dashboard/purchases` | Listar, filtrar, crear, editar borrador, enviar, aprobar/rechazar, adjuntar, importar y exportar |
| `/dashboard/inventory` | Ítems, saldos por almacén, stock mínimo, ajustes y acceso al kardex |
| `/dashboard/inventory/kardex` | Movimientos, filtros, trazabilidad y exportación |
| `/dashboard/recipes` | Recetas, versiones, ingredientes, activación, importación y exportación |
| `/dashboard/production` | Órdenes, requerimientos, reserva, inicio, consumo, terminación y cancelación |
| `/dashboard/products` | Productos, imágenes, tallas, colores, variantes/SKU, importación y exportación |
| `/dashboard/orders` | Pedidos, líneas, reserva, estado, vínculo a producción, despacho, importación y exportación |
| `/dashboard/catalogs` | Proveedores, clientes, almacenes, unidades, conversiones, monedas, tipos de cambio, presentaciones, tallas, colores y categorías; cada pestaña aplica su permiso |
| `/dashboard/users` | Usuarios, activación y asignación de roles |
| `/dashboard/roles` | Matriz de permisos por rol |
| `/dashboard/audit` | Consulta de acciones sensibles |
| `/dashboard/imports` | Historial, errores y resultado de cargas masivas |

El layout será responsive. Toda tabla tendrá carga, vacío, error, paginación, filtros persistentes en la URL y control de acceso por acción. Los Server Components construirán el shell y harán cargas iniciales cuando convenga; los Client Components se limitarán a interacción. TanStack Query mantendrá datos remotos y Zustand solo estado efímero de interfaz, como tema o menú, nunca una copia paralela del inventario.

## 4. Tecnología y librerías

### Dependencias principales

- Next.js, React y TypeScript.
- Ant Design e iconos.
- TanStack Query.
- Zustand.
- Zod.
- Prisma y PostgreSQL/Neon.
- Cloudinary.
- Sonner para avisos breves de UI.
- Nodemailer y PDFKit no se instalarán hasta que correo o PDF sean aprobados dentro del alcance.

### Dependencias de soporte

| Necesidad | Propuesta |
|---|---|
| Autenticación | Servicio propio de sesiones opacas; token aleatorio en cookie segura, hash del token en PostgreSQL y contraseñas con Argon2id |
| Hash de contraseña | `@node-rs/argon2` usando Argon2id |
| Tiempo real | `pusher` en servidor y `pusher-js` en cliente |
| Excel | ExcelJS para generar y procesar libros con varias hojas |
| Pruebas unitarias | Vitest |
| Pruebas de componentes | Testing Library |
| Pruebas end-to-end | Playwright |
| Fechas | Declarar Day.js como dependencia directa |
| Calidad | ESLint, formato automático y validación en CI |
| Runtime | Node.js 24 fijado en `engines` y archivo de versión |

### Despliegue sugerido

- Aplicación: Vercel, salvo que infraestructura apruebe otro destino compatible con Next.js.
- Base de datos: Neon PostgreSQL.
- Archivos: Cloudinary.
- Tiempo real: Pusher.
- Entornos separados: desarrollo, pruebas y producción.
- `DATABASE_URL` agrupada para ejecución y `DATABASE_URL_UNPOOLED` para migraciones.
- Variables documentadas en `.env.example`; nunca se guardarán secretos reales en Git.
- Imágenes públicas de producto y documentos privados con entrega mediante URL firmada.
- Logs estructurados, monitoreo de errores, rate limiting en login/importaciones y procedimiento de rollback.

### Variables de entorno

El repositorio incluirá `.env.example` sin valores secretos y una validación Zod que detenga el arranque si falta una variable requerida.

```dotenv
DATABASE_URL=
DATABASE_URL_UNPOOLED=

SESSION_SECRET=
SESSION_COOKIE_NAME=lk_innovacion_session

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

PUSHER_APP_ID=
PUSHER_KEY=
PUSHER_SECRET=
PUSHER_CLUSTER=
NEXT_PUBLIC_PUSHER_KEY=
NEXT_PUBLIC_PUSHER_CLUSTER=

NEXT_PUBLIC_APP_URL=
WORKER_SECRET=
```

Solo las claves públicas de Pusher y la URL pública de la aplicación usarán el prefijo `NEXT_PUBLIC_`. Los secretos se administrarán en el proveedor de despliegue.

### Scripts mínimos del proyecto

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:integration": "vitest run --config vitest.integration.config.ts",
  "test:e2e": "playwright test",
  "db:generate": "prisma generate",
  "db:migrate": "prisma migrate dev",
  "db:deploy": "prisma migrate deploy",
  "db:seed": "prisma db seed",
  "db:studio": "prisma studio"
}
```

El `README` explicará instalación con `npm ci`, variables, creación de la base de datos, migraciones, seed, creación segura del primer administrador, ejecución local y pruebas.

## 5. Decisiones de diseño del dominio

### 5.1 Catálogo inventariable unificado

Se recomienda un catálogo común `InventoryItem` para materias primas, insumos, empaques y productos terminados. Esto evita mantener tres motores de stock separados.

```text
InventoryItem
  ├─ RAW_MATERIAL
  ├─ SUPPLY
  ├─ PACKAGING
  └─ FINISHED_GOOD

Product 1 ── N ProductVariant 1 ── 1 InventoryItem
```

Cada combinación de producto, talla y color tendrá un SKU único y su propio ítem inventariable.

### 5.2 Precisión numérica

- Cantidades: `Decimal(18,6)`.
- Precios unitarios, costos unitarios y tipos de cambio: `Decimal(18,6)`.
- Totales monetarios y valor acumulado de inventario: `Decimal(18,4)`.
- Porcentajes: `Decimal(7,4)`.
- Nunca usar `Float` para importes o cálculos de inventario.
- Redondeo monetario visible a dos decimales, conservando precisión interna.

### 5.3 Unidades de medida

Cada ítem tendrá una unidad base, por ejemplo `KG`, `L`, `M`, `UND` o `PAR`.

La presentación de compra debe almacenarse de forma estructurada:

```text
cantidad_presentaciones = 25
tipo_presentacion       = SACO
contenido_presentacion  = 20
unidad_contenido        = KG
cantidad_base           = 500 KG
```

La fórmula será:

```text
cantidad_base = cantidad_presentaciones
              × contenido_por_presentacion
              × factor_conversion
```

No se convertirán litros a kilos automáticamente. Si un líquido se compra en litros y se valoriza por kilo, será obligatorio definir su densidad o una conversión específica.

### 5.4 IGV y precio final

Como valor de partida a ratificar en fase 0, el precio ingresado se interpreta como precio neto por unidad base:

```text
subtotal_neto = cantidad_base × precio_neto_unidad_base
igv           = subtotal_neto × 0.18
total         = subtotal_neto + igv
precio_unitario_con_igv = precio_neto_unidad_base × 1.18
```

Multiplicar únicamente por 18% calcula el impuesto, no el precio final. La interfaz mostrará por separado precio neto unitario, precio unitario con IGV, subtotal neto, IGV y total de línea. La tasa será 18% por defecto, pero quedará configurable. El valor de inventario excluirá el IGV recuperable. En la fase 0, Contabilidad únicamente deberá ratificar esa condición y definir si el redondeo tributario se realiza por línea o sobre el total del documento.

### 5.5 Política de costeo del inventario

El valor de partida del MVP será **promedio ponderado móvil por ítem y almacén, expresado en PEN**. El seguimiento por lote sirve para trazabilidad y vencimientos; no implica costeo FIFO.

`StockMovement` será el libro mayor y la fuente auditable de verdad. `StockBalance` será su proyección materializada para consulta y mantendrá como mínimo `onHandQuantity`, `reservedQuantity`, `inventoryValue` y `averageUnitCost`; solo el servicio de inventario podrá actualizarla, en la misma transacción que crea el movimiento. Un proceso de conciliación comprobará periódicamente que la proyección coincide con el kardex.

La secuencia de valorización será exclusivamente `postedAt` más un `postingSequence` monotónico asignado en la transacción. `occurredAt` conserva la fecha física del hecho para trazabilidad y reportes, pero no reordena ni recalcula el costo. Una recepción antigua aprobada hoy se contabiliza hoy; el MVP no permite insertar movimientos retroactivos en medio del libro valorizado.

Al aprobar una compra:

```text
costo_neto_unitario_PEN = costo_neto_unitario_moneda × tipo_cambio_PEN_por_unidad_moneda
valor_nuevo              = valor_anterior + cantidad_entrada × costo_neto_unitario_PEN
stock_nuevo              = stock_anterior + cantidad_entrada
promedio_nuevo           = valor_nuevo / stock_nuevo
```

- Si el stock anterior es cero, el promedio será el costo neto unitario de la entrada.
- El tipo de cambio representa PEN por una unidad de USD, con seis decimales; para PEN siempre es `1`. La barra superior muestra compra/venta vigente y permite consultar el histórico. `catalogs.manage` autoriza la sincronización con SUNAT y BCRP. Moneda, fuente, fecha y tasa quedan congeladas al aprobar una compra; si falta la tasa, la operación no puede aprobarse.
- El IGV recuperable no forma parte del costo. Fletes, seguros, mano de obra y costos indirectos quedan fuera del costo del MVP salvo aprobación expresa de un cambio de alcance.
- Una salida se valoriza con el promedio vigente al contabilizarse. Ese costo queda congelado en `StockMovement` y reduce `inventoryValue` por `cantidad × costo_movimiento`.
- Una reserva no cambia cantidad física, promedio ni valor; solo reduce stock disponible.
- La reversa de una **salida** crea una entrada por la cantidad y el costo congelado del movimiento original; luego recalcula el promedio.
- La cancelación de una **entrada** retira las unidades disponibles al promedio vigente, no al costo histórico, y registra por separado `originalUnitCost`, `reversalUnitCost` y `costVariance` para auditoría. Se bloquea cuando el lote o el stock disponible no cubren la cantidad. La diferencia no se contabiliza en un libro mayor financiero porque la contabilidad general está fuera del MVP.
- Una corrección solo de valor se realiza mediante `VALUE_ADJUSTMENT`, exige solicitud con `inventory.adjust_value_request`, aprobación por otro usuario con `inventory.adjust_value_approve` y motivo; nunca altera silenciosamente un movimiento histórico.
- Después de cada movimiento deben cumplirse `onHandQuantity ≥ 0`, `0 ≤ reservedQuantity ≤ onHandQuantity` e `inventoryValue ≥ 0`. Si la cantidad queda en cero, valor y promedio se normalizan a cero en la misma transacción y el residuo de redondeo queda registrado en el movimiento.
- El costo del producto terminado será la suma del costo congelado de los consumos reales de materiales dividida entre las unidades buenas terminadas. La merma absorbe costo; no se incluyen mano de obra ni costos indirectos en el MVP. Completar exige al menos una unidad buena. Si el resultado es cero, la orden se cierra como `SCRAPPED`, no genera entrada y conserva el costo consumido como pérdida de producción para el reporte operativo.
- El MVP registra una sola terminación por orden. Producción parcial y WIP quedan fuera del alcance base; si se aprueban en fase 0 se deberán modelar acumulación de costo, múltiples salidas, asignación provisional y ajuste final antes de estimar la historia.
- Los cálculos se ejecutan con `Decimal`, sin convertir a `number`, y se redondean solo en los puntos definidos por Contabilidad.

Este método es el supuesto vinculante para diseño y estimación. Contabilidad puede sustituirlo únicamente durante la fase 0; cualquier alternativa deberá actualizar modelo, reglas, pruebas y estimación **antes de crear migraciones o el corte vertical de inventario de la fase 1**.

### 5.6 Convenciones de Prisma y PostgreSQL

- Identificadores UUID en todas las entidades de negocio.
- Propiedades TypeScript en `camelCase`; tablas y columnas físicas en `snake_case` mediante `@map` y `@@map`.
- Todas las entidades llevan `createdAt`, `updatedAt` y, cuando aplica, `createdById` y `updatedById`.
- `companyId` es obligatorio en datos de negocio y se obtiene de la sesión, nunca del cuerpo enviado por un usuario normal.
- Códigos, SKU, documentos e idempotency keys tienen índices únicos explícitos dentro de la empresa.
- No se utiliza `prisma db push` en staging o producción; todos los cambios se entregan como migraciones revisadas.
- El pipeline aplica `prisma migrate deploy` antes de iniciar una nueva versión.
- Una operación de stock revalida disponibilidad dentro de la misma transacción y utiliza actualización condicional o aislamiento serializable con reintento controlado.
- Las consultas de módulos siempre filtran por `companyId`; el acceso global, si algún día existe, tendrá un caso de uso administrativo separado.

Correlativos iniciales:

| Entidad | Formato |
|---|---|
| Materia prima/ítem | `MP-000001` o código externo único proporcionado |
| Producto | `PRO-000001` |
| Compra | `COM-YYYY-000001` |
| Receta | `REC-000001` con versión independiente |
| Orden de producción | `OP-YYYY-000001` |
| Pedido | `PED-YYYY-000001` |

El SKU de variante se forma inicialmente como `{PRODUCT_CODE}-{SIZE}-{COLOR_CODE}`, normalizado en mayúsculas y sin espacios. El usuario podrá proporcionar un SKU externo siempre que sea único dentro de la empresa.

## 6. Modelo de datos de alto nivel

### Seguridad y trazabilidad

- `Company`
- `User`
- `Session`
- `Role`
- `Permission`
- `UserRole`
- `RolePermission`
- `AuditLog`

Aunque el MVP opere con una sola empresa, se conservará `companyId` para aislamiento y crecimiento futuro.

### Catálogos e inventario

- `UnitOfMeasure`
- `UnitConversion`
- `Currency`
- `ExchangeRate`
- `Warehouse`
- `InventoryItem`
- `InventoryLot`
- `StockPolicy`
- `StockBalance`
- `StockMovement`
- `StockReservation`
- `InventoryAdjustment`

### Compras

- `Supplier`
- `Purchase`
- `PurchaseLine`
- `PurchaseLineLot`
- `PurchaseApproval`
- `Attachment`

### Productos y recetas

- `Product`
- `Size`
- `Color`
- `ProductVariant`
- `ProductImage`
- `Recipe`
- `RecipeVersion`
- `RecipeIngredient`

### Producción

- `ProductionOrder`
- `ProductionMaterial`
- `ProductionConsumption`
- `ProductionOutput`

### Pedidos

- `Customer`
- `SalesOrder`
- `SalesOrderLine`

### Integraciones

- `ImportJob`
- `ImportError`
- `Notification`
- `OutboxEvent`
- `CorrelativeCounter`
- `RateLimitBucket`

Se utilizarán enums de Prisma para estados, tipos de movimiento y categorías realmente finitas. Las monedas se administrarán con códigos ISO en `Currency`; cada operación en otra moneda conservará el tipo de cambio utilizado. Los correlativos se generarán con una secuencia o contador transaccional. Los registros con historial no se eliminarán físicamente; se desactivarán o revertirán.

## 7. Alcance funcional por módulo

### 7.1 Compras

Datos principales:

- Código interno.
- Proveedor.
- Fecha de recepción.
- Tipo, serie y número de documento o guía.
- Referencia de orden de origen y secuencia de recepción, cuando existan entregas parciales.
- Materias primas o insumos por línea.
- Número de línea estable dentro de la recepción.
- Lote del proveedor opcional.
- Presentación: cantidad, tipo, contenido y unidad.
- Cantidad base calculada.
- Precio neto por unidad base.
- Moneda y tipo de cambio cuando corresponda.
- IGV, subtotal y total.
- Estado: borrador, pendiente, aprobado, rechazado y cancelado.
- Documento adjunto en Cloudinary.

En el MVP, `Purchase` representa una **recepción física concreta**, no una orden de compra previa. Puede contener varias líneas identificadas por `lineNumber` y cada línea puede dividirse en uno o más lotes mediante `PurchaseLineLot`. Si un proveedor entrega parcialmente, cada entrega se registra como una compra/recepción independiente y guarda `sourceOrderReference` y `receiptSequence` para agruparlas. La aprobación se realiza por cada `Purchase`; aprobarla genera exactamente una entrada por línea/lote. Una futura gestión de órdenes de compra previas queda fuera del MVP.

Reglas:

- Un registro importado queda en borrador; enviarlo a pendiente exige una acción posterior con permiso y nunca se aprueba automáticamente.
- Solo la aprobación genera una entrada al kardex.
- Reintentar la aprobación no debe duplicar stock.
- Una compra rechazada no afecta inventario.
- Una compra aprobada queda bloqueada; una corrección se hace con reversa o ajuste auditado.
- La combinación empresa/proveedor/tipo/serie/número/secuencia de recepción será única; `receiptSequence` será `1` cuando no existan entregas parciales y `lineNumber` será único dentro de la recepción.
- El kardex conservará `occurredAt` como fecha efectiva de recepción y `postedAt` como fecha/hora de aprobación.
- Los documentos de compra se almacenarán como recursos privados; se validarán MIME, extensión y tamaño y se entregarán con URL firmada de corta duración.

### 7.2 Almacén y kardex

- Registro de materias primas, insumos y productos terminados.
- Código, nombre, tipo, unidad base, stock mínimo y estado.
- Un almacén principal en el MVP, con modelo preparado para varios.
- Stock físico, reservado y disponible.
- Kardex por ítem, almacén y lote.
- Entradas, salidas, ajustes y reversas.
- Stock mínimo y alertas por combinación de ítem y almacén, almacenados en una única política `StockPolicy`. Para una variante, la pantalla y el Excel de Productos editan esa misma política; no existe un segundo valor independiente.

Reglas:

- El saldo se deriva de movimientos; nunca se edita directamente.
- No se permite stock negativo.
- Todo movimiento registra origen, documento, usuario, fecha, cantidad, costo unitario congelado, valor del movimiento y saldo posterior.
- Los ajustes requieren permiso y motivo.
- Las operaciones que modifican stock se ejecutan en una transacción PostgreSQL.
- Cada ítem define `lotTrackingMode = NONE | OPTIONAL | REQUIRED`. Los movimientos usan `lotId` según esa política; no se inventan números de lote para ítems sin trazabilidad.
- La selección operativa automática será FIFO por `receivedAt` y luego por ID. El usuario puede cambiar la asignación antes de contabilizar si tiene `inventory.select_lot`; FEFO no forma parte del MVP.
- Reservas, consumos y despachos se asignan por lote cuando el ítem lo requiere. Se valida disponibilidad tanto en el saldo global como en cada lote dentro de la misma transacción.
- Un ajuste positivo exige cantidad y costo unitario en PEN y recalcula el promedio; un ajuste negativo usa el promedio vigente. Un ajuste solo de valor sigue la regla `VALUE_ADJUSTMENT` de 5.5.

### 7.3 Recetas

- Código, nombre, producto y variante opcional.
- Versión de receta.
- Rendimiento esperado por ejecución.
- Lista de materias primas y cantidades.
- La receta no incluye merma teórica; la merma real se registra por material al finalizar la orden de producción.
- Estados: borrador, activa e inactiva.

Crear o modificar una receta no descuenta stock. Una versión activa que ya fue usada no se edita; cualquier cambio crea una nueva versión.

Si la fórmula cambia por talla o color, podrá definirse una receta específica para la variante. En caso contrario, se usará la receta del producto base.

### 7.4 Producción

La orden de producción contendrá:

- Código.
- Variante a fabricar.
- Versión exacta de receta.
- Número de ejecuciones de receta.
- Cantidad esperada de producto.
- Fechas previstas y reales.
- Almacén.
- Estado y observaciones.
- Pedido de origen opcional.

Flujo recomendado:

```text
DRAFT → RELEASED → IN_PROGRESS → COMPLETED
DRAFT ───────────────→ CANCELLED
RELEASED ────────────→ CANCELLED
IN_PROGRESS ─────────→ SCRAPPED
```

- Crear la orden no mueve inventario.
- Liberarla valida disponibilidad y reserva materiales.
- Iniciarla libera las reservas y crea, en una sola transacción, las salidas por las cantidades planificadas de la receta. Este es el único evento normal de consumo del MVP.
- Antes de completar se pueden registrar devoluciones físicas de material no usado y consumos adicionales autorizados; ambos generan movimientos explícitos y nunca editan la salida inicial.
- Completarla exige al menos una unidad buena y registra una única entrada de producto terminado, además de la merma informada.
- Antes de iniciar, cancelar solo libera reservas. Después del consumo ya no se permite una cancelación automática: el material físicamente recuperado vuelve mediante `PRODUCTION_RETURN` al costo de su consumo y el resto se cierra como producto terminado o como `SCRAPPED`.
- El costo del producto terminado sigue la política de promedio ponderado móvil descrita en 5.5: suma el valor de los consumos reales y lo distribuye entre las unidades buenas. Mano de obra y costos indirectos quedan fuera del MVP.
- Producciones parciales y múltiples entradas de terminado quedan fuera del MVP base. Cuando se necesiten entregas parciales se crearán órdenes de producción separadas; habilitar WIP y cierres parciales requiere cambio de alcance.

### 7.5 Productos

- Código y nombre.
- Categoría y descripción.
- Imágenes en Cloudinary.
- Variantes por talla y color.
- SKU único por variante.
- Unidad de inventario `PAR` o `UND`, según se acuerde.
- Precio de venta opcional.
- Stock mínimo por variante y almacén, persistido en la `StockPolicy` del ítem inventariable asociado.
- Estado activo/inactivo.

### 7.6 Usuarios, roles y permisos

- Alta, edición, activación y desactivación de usuarios.
- Roles múltiples por usuario.
- Permisos atómicos por acción.
- Protección en API y no solo ocultamiento de botones.
- Auditoría de cambios de roles y operaciones críticas.

Permisos iniciales sugeridos:

```text
purchases.view/create/update/approve/reject/reverse/import/export
inventory.view/adjust/adjust_value_request/adjust_value_approve/select_lot/import/opening_import/export
exchange_rates.view/manage
recipes.view/create/update/activate/import/export
production.view/create/release/start/return_material/consume_extra/complete/scrap/cancel
products.view/create/update/import/export
orders.view/create/update/confirm/link_production/dispatch/deliver/cancel/import/export
users.view/create/update
roles.view/update_permissions
audit.view
```

Roles iniciales de seed:

- `Administrador`: todos los permisos del negocio y administración de usuarios/roles.
- `Compras`: proveedores, compras, importación y solicitud de aprobación; aprobar puede separarse.
- `Almacén`: inventario, kardex, recepción y ajustes autorizados.
- `Producción`: recetas y órdenes de producción.
- `Ventas`: productos, clientes y pedidos.
- `Consulta`: lectura y exportación sin operaciones que modifiquen datos.

El servicio de autenticación generará un token criptográficamente aleatorio de al menos 256 bits, guardará solo su HMAC-SHA-256 con `SESSION_SECRET` en `Session` y enviará el token en una cookie `httpOnly`, `secure`, `sameSite=lax`. La sesión tendrá ocho horas de inactividad máxima y siete días de vida absoluta. `Session` conservará usuario, expiración, revocación, último uso, IP y user-agent. Las solicitudes mutables validarán `Origin`/`Host` y usarán protección CSRF cuando no puedan garantizar el mismo origen. Un middleware protegerá las rutas privadas y cada caso de uso verificará nuevamente su permiso. Un cambio de contraseña, roles o estado del usuario revoca todas sus sesiones. Habrá rate limiting persistente, contraseña mínima de 6 caracteres, recuperación administrativa controlada y un comando de seed para crear el primer administrador sin incluir una contraseña fija en el repositorio.

### 7.7 Pedidos

La estimación base asume que se trata de pedidos de venta a clientes.

- Número de pedido.
- Cliente.
- Fecha y fecha requerida.
- Moneda.
- Líneas por variante/SKU.
- Cantidad, precio y total.
- Estado y observaciones.
- Orden de producción vinculada cuando falte stock.

El precio de venta se interpreta como neto por unidad; subtotal, IGV y total se calculan con la misma regla de 5.4. En moneda distinta de PEN se exige y congela `tipo_cambio_pen` al confirmar para reportes; esta tasa comercial no modifica el costo de salida del inventario, que siempre usa el promedio vigente en PEN.

Flujo recomendado:

```text
DRAFT → CONFIRMED ───────────────→ READY → DISPATCHED → DELIVERED
             └→ IN_PRODUCTION ──────┘
DRAFT / CONFIRMED / IN_PRODUCTION → CANCELLED
```

Al confirmar, el sistema reserva por línea todo el stock disponible, por lote cuando corresponda, y calcula `backorderQuantity`. Si todas las líneas quedan cubiertas, una transición de sistema lo lleva a `READY`. Si existe faltante permanece `CONFIRMED` y ofrece crear o vincular órdenes de producción por la cantidad faltante; al vincular al menos una pasa a `IN_PRODUCTION`. Una entrada de producción vinculada intenta completar primero esas reservas; cuando todas las líneas están totalmente reservadas, el pedido pasa a `READY` de forma idempotente.

El stock físico se descuenta al despachar, no al crear el pedido. El MVP exige despacho total: `READY → DISPATCHED` consume todas las reservas en una transacción. Los despachos parciales, múltiples guías y devoluciones de venta requieren ampliación de alcance; mientras tanto se dividirá la necesidad en pedidos separados.

Cancelar un pedido libera sus reservas, pero no cancela automáticamente una producción ya iniciada. Una orden de producción aún en borrador o liberada se revisa por separado; si ya está en progreso continúa y su salida entra a stock general sin reservarse para el pedido cancelado.

Si “Pedido” significa una solicitud interna, se reemplazarán cliente, precio, despacho y entrega por solicitante, área, aprobación y entrega interna. Esta alternativa se cerrará en la fase 0; el flujo de venta es el que está incluido en la estimación actual.

### 7.8 Matriz resumida de estados y efectos

| Módulo | Transición | Permiso | Efecto en inventario |
|---|---|---|---|
| Compra | `DRAFT → PENDING` | `purchases.update` | Ninguno |
| Compra | `PENDING → APPROVED` | `purchases.approve` | Entrada por cada línea/lote de esa recepción |
| Compra | `PENDING → REJECTED` | `purchases.reject` | Ninguno |
| Compra | `APPROVED → CANCELLED` | `purchases.reverse` | Salida compensatoria al promedio vigente y variación auditada |
| Receta | `DRAFT → ACTIVE` | `recipes.activate` | Ninguno; congela la versión |
| Producción | `DRAFT → CANCELLED` | `production.cancel` | Ninguno |
| Producción | `DRAFT → RELEASED` | `production.release` | Reserva materiales |
| Producción | `RELEASED → IN_PROGRESS` | `production.start` | Libera reserva y registra salidas planificadas |
| Producción | `IN_PROGRESS → COMPLETED` | `production.complete` | Entrada de producto terminado y cierre de consumos |
| Producción | `RELEASED → CANCELLED` | `production.cancel` | Libera reservas |
| Producción | `IN_PROGRESS → SCRAPPED` | `production.scrap` | Sin entrada terminada; conserva consumos como pérdida operativa |
| Pedido | `DRAFT → CONFIRMED` | `orders.confirm` | Reserva producto terminado disponible |
| Pedido | `CONFIRMED → READY` | Sistema | Todas las líneas quedaron reservadas |
| Pedido | `CONFIRMED → IN_PRODUCTION` | `orders.link_production` | Registra faltante y vínculo con producción |
| Pedido | `IN_PRODUCTION → READY` | Sistema | La producción completó las reservas faltantes |
| Pedido | `READY → DISPATCHED` | `orders.dispatch` | Salida y liberación de la reserva |
| Pedido | `DISPATCHED → DELIVERED` | `orders.deliver` | Ninguno |
| Pedido | Estado previo al despacho `→ CANCELLED` | `orders.cancel` | Libera reservas |

Cada transición se implementa como un caso de uso independiente, valida el estado actual dentro de la transacción, exige el permiso indicado y genera auditoría. Una operación ya despachada se corrige mediante devolución o movimiento compensatorio, no cambiando simplemente su estado.

## 8. Alertas con Pusher

Pusher será un canal de aviso, no la fuente de verdad.

Flujo:

1. La operación se confirma en PostgreSQL.
2. Se guarda una notificación y un evento en `OutboxEvent` dentro de la misma transacción.
3. Después del commit, la API intenta publicar inmediatamente el evento en Pusher.
4. El navegador recibe el evento e invalida la consulta correspondiente en TanStack Query.
5. La interfaz vuelve a consultar la API.

En Vercel, un Cron ejecutado cada minuto llamará a `/api/internal/outbox/publish` con `WORKER_SECRET`. El worker reclamará lotes pequeños mediante bloqueo compatible con `FOR UPDATE SKIP LOCKED`, publicará fuera de la transacción y marcará el resultado de forma idempotente. Cada evento tendrá clave idempotente, número de intentos, próximo intento y estado final; se usarán hasta 10 intentos con backoff exponencial y los fallos agotados quedarán visibles para soporte. Si se cambia de hosting, deberá conservarse este mismo contrato operativo.

Eventos iniciales:

- Stock por debajo del mínimo.
- Compra pendiente de aprobación.
- Compra aprobada o rechazada.
- Orden de producción sin insumos.
- Producción terminada.
- Pedido listo, retrasado o despachado.
- Importación Excel terminada con o sin errores.

### Contrato Pusher

- Canales privados por empresa y dominio: `private-company-{companyId}-inventory`, `-purchases`, `-production`, `-orders` e `-imports`; las alertas personales usan `private-user-{userId}`.
- La autorización exige sesión, pertenencia a la empresa y permiso de lectura del dominio; pertenecer a la empresa no basta.
- Eventos versionados, por ejemplo `inventory.stock-low.v1` y `production.completed.v1`.
- El payload contiene identificadores, tipo y fecha; los datos completos se vuelven a consultar por API.
- Los clientes ignoran eventos de otra empresa y deduplican por `eventId`.
- Outbox con máximo de intentos, backoff y registro del último error.

### Contrato Cloudinary

- Imágenes de productos: carpeta `lk-innovacion/{companyId}/products`, JPEG/PNG/WebP y máximo 5 MB.
- Documentos de compra: carpeta `lk-innovacion/{companyId}/purchases`, PDF/JPEG/PNG, máximo 10 MB y recurso privado.
- Toda carga requiere firma de servidor con carpeta, tipo y expiración restringidos.
- PostgreSQL guarda `publicId`, URL segura, MIME, tamaño, usuario y entidad asociada.
- El reemplazo o borrado se hace mediante un caso de uso auditado; un proceso de mantenimiento identifica archivos huérfanos.

## 9. Carga masiva y reportes Excel

Cada módulo tendrá una plantilla versionada. Importación y reporte usarán el **mismo libro lógico**: mismos nombres y orden de hojas, encabezados, tipos de celda y versión. El reporte completará campos calculados y de estado que en la importación son de solo lectura; no agregará columnas inesperadas.

La hoja `Instrucciones` y una celda nombrada `template_version` identificarán módulo y versión. El diccionario aprobado en fase 0 clasificará cada columna como:

- `E` — entrada editable;
- `C` — calculada por el servidor;
- `X` — solo salida/reporte;
- `F` — valor forzado por el flujo.

Además definirá tipo, longitud o precisión, obligatoriedad, catálogo, valor por defecto, clave de relación y mensaje de error. El importador nunca confiará en una columna `C`, `X` o `F` enviada por el archivo.

### Plantillas

| Módulo | Hojas propuestas |
|---|---|
| Compras | `Instrucciones`, `Compras`, `DetalleCompra`, `Catalogos` |
| Almacén | `Instrucciones`, `Items`, `MovimientosIniciales`, `Catalogos` |
| Recetas | `Instrucciones`, `Recetas`, `Ingredientes`, `Catalogos` |
| Productos | `Instrucciones`, `Productos`, `Variantes`, `Catalogos` |
| Pedidos | `Instrucciones`, `Pedidos`, `DetallePedido`, `Catalogos` |

### Diccionario inicial de columnas

| Hoja | Columnas principales |
|---|---|
| `Compras` | `accion`, `codigo_compra`, `referencia_orden_origen`, `secuencia_recepcion`, `fecha_recepcion`, `proveedor_codigo`, `tipo_documento`, `serie_documento`, `numero_documento`, `moneda`, `tipo_cambio_pen`, `fecha_tipo_cambio`, `fuente_tipo_cambio`, `estado`, `observaciones` |
| `DetalleCompra` | `codigo_compra`, `linea_numero`, `lote_linea_numero`, `material_codigo`, `lote_proveedor`, `fecha_vencimiento`, `cantidad_presentaciones`, `tipo_presentacion`, `contenido_por_presentacion`, `unidad_contenido`, `cantidad_base`, `precio_neto_unidad_base`, `tasa_igv`, `precio_unitario_con_igv`, `subtotal_neto`, `igv`, `total_linea` |
| `Items` | `accion`, `codigo`, `nombre`, `tipo_item`, `unidad_base`, `modo_lote`, `almacen_codigo`, `stock_minimo`, `activo` |
| `MovimientosIniciales` | `item_codigo`, `almacen_codigo`, `lote`, `fecha`, `cantidad`, `costo_unitario_pen`, `observaciones` |
| `Recetas` | `accion`, `receta_codigo`, `producto_codigo`, `variante_sku`, `version`, `rendimiento`, `unidad_salida`, `estado` |
| `Ingredientes` | `receta_codigo`, `version`, `material_codigo`, `cantidad`, `unidad` |
| `Productos` | `accion`, `producto_codigo`, `nombre`, `categoria`, `descripcion`, `activo` |
| `Variantes` | `producto_codigo`, `sku`, `talla`, `color`, `unidad`, `stock_minimo`, `precio_venta`, `activo` |
| `Pedidos` | `accion`, `numero_pedido`, `cliente_codigo`, `fecha`, `fecha_requerida`, `moneda`, `tipo_cambio_pen`, `estado`, `observaciones` |
| `DetallePedido` | `numero_pedido`, `linea_numero`, `sku`, `cantidad`, `precio_neto_unitario`, `tasa_igv`, `subtotal_neto`, `igv`, `total_linea` |

`cantidad_base`, importes calculados y totales existirán desde la primera versión y estarán clasificados como `C`. Podrán venir vacíos; si contienen un valor diferente al recálculo del servidor, la previsualización mostrará un error. `estado` será `F`: Compras y Pedidos se crean en `DRAFT`, y Recetas se crean en `DRAFT` aunque el reporte muestre su estado real. Activar o aprobar siempre requiere el caso de uso y permiso correspondiente.

En `DetalleCompra`, `linea_numero` es un entero positivo único dentro de la compra y `lote_linea_numero` es único dentro de la línea. Cuando no haya división por lotes se usa `lote_linea_numero = 1` y `lote_proveedor` queda vacío si la política del ítem lo permite.

La columna `accion` admite `CREAR` o `ACTUALIZAR` solo para Ítems, Productos y Recetas. Una actualización de receta activa crea una nueva versión. Compras y Pedidos se importan únicamente como registros nuevos. Los libros descargados como reporte llevan la marca interna `REPORT` y al reimportarse usan el modo `ONLY_NEW`: una clave existente se omite sin duplicar ni sobrescribir datos. En plantillas de carga manual se conservan las reglas explícitas de creación/actualización. Una fila idéntica repetida dentro del libro se omite con advertencia; una misma clave con datos diferentes bloquea la carga.

La hoja `MovimientosIniciales` usa costo neto unitario en PEN, sin IGV. Solo está habilitada durante la puesta en marcha, requiere `inventory.opening_import` y queda bloqueada de forma irreversible al registrar `inventoryOpeningClosedAt`; después de ese cierre, cualquier corrección se realiza mediante ajustes ordinarios auditados.

### Proceso de importación

```text
subir archivo → validar estructura → validar filas → previsualizar
              → confirmar → transacción → resultado/errores
```

Reglas:

- Referencias por código o SKU, nunca solo por nombre.
- Versión de plantilla obligatoria.
- Errores con hoja, fila, columna y explicación.
- Previsualización de altas, actualizaciones, omisiones y errores.
- Confirmación explícita antes de escribir.
- Hash e identificador externo para evitar importaciones duplicadas.
- Registro de archivo, usuario, fecha, resultado y errores.
- Las compras, pedidos y recetas importados quedan en borrador; nunca se aprueban, confirman o activan desde Excel.
- Los saldos iniciales ingresan como movimientos de apertura.
- Un archivo inválido no deja escrituras parciales.
- Sanitización de fórmulas al exportar para impedir formula injection.
- Fechas mostradas como `DD/MM/YYYY`, zona horaria `America/Lima` y celdas numéricas reales; el importador aceptará separador decimal `.` o `,` después de normalizarlo de forma explícita.

El alcance base admite hasta 1,000 filas de datos por libro: se valida y previsualiza sin modificar negocio y, al confirmar, se aplica en una sola transacción. El límite evita depender de procesos largos en infraestructura serverless. Volúmenes superiores requerirán cola/worker, staging y procesamiento por lotes con reversa lógica por `ImportJob`; esa modalidad se reestimará si resulta necesaria.

### Reportes y filtros

| Módulo | Filtros mínimos |
|---|---|
| Compras | Rango de recepción, estado, proveedor, documento, moneda y material |
| Almacén/Kardex | Rango de movimiento, ítem, tipo, almacén, lote, origen y bajo stock |
| Recetas | Código, producto, SKU opcional, versión, estado e ingrediente |
| Productos | Código, SKU, nombre, categoría, talla, color y estado |
| Pedidos | Rango de fecha, estado, cliente y SKU |

Cada listado permitirá exportar la página visible o todo el resultado filtrado, dejando clara la opción seleccionada.

## 10. Plan de trabajo

### Fase 0 — Descubrimiento y cierre funcional — 1.5 a 2 semanas

- Validar los procesos reales de compras, almacén, producción y pedidos.
- Confirmar unidades, conversiones, fórmula de IGV, tipos de cambio, cronología del kardex y política de costos/reversas.
- Definir qué evento mueve o reserva stock.
- Confirmar si las recetas cambian por talla/color.
- Ratificar que producción y despacho parciales quedan fuera del MVP, o aprobar y reestimar su diseño antes del ERD.
- Definir roles y matriz de permisos.
- Elaborar y aprobar el diccionario físico de datos: campo, finalidad, tipo Prisma/PostgreSQL, longitud o precisión, obligatoriedad, valor por defecto, enum, clave, índice y regla de unicidad.
- Elaborar y aprobar el diagrama entidad-relación con cardinalidades, alcance de `companyId`, propietarios de relaciones y reglas `onDelete`/`onUpdate`.
- Entregar un esqueleto revisado de `schema.prisma`, todavía sin datos productivos, que represente entidades, relaciones, enums, índices y restricciones del MVP.
- Aprobar contratos API v1, matrices de transición y permisos por operación.
- Aprobar formatos Excel preliminares, reglas de creación/actualización y códigos de error.
- Aprobar prototipo de navegación, plan de ambientes, estrategia de migraciones y pruebas.
- Convertir el alcance en historias y criterios de aceptación.

**Salida:** alcance firmado, flujos, decisiones funcionales cerradas, diccionario físico, ERD, esqueleto de `schema.prisma`, contratos API, matrices de estados, matriz RBAC, especificación Excel, prototipo de navegación, plan de ambientes/pruebas y backlog priorizado.

**Gate obligatorio:** durante la fase 0 se diseña y revisa el esquema físico como documento y esqueleto de `schema.prisma`. Hasta que el dueño del producto, el líder técnico y cada responsable funcional aprueben los entregables de su ámbito, no se aplican migraciones, no se materializa ese esquema en ninguna base de datos y no se implementan el corte vertical de inventario ni los módulos de negocio. Ningún supuesto se convierte automáticamente en decisión por vencimiento. La infraestructura vacía, repositorio y CI sí pueden prepararse en paralelo sin fijar decisiones de dominio.

### Fase 1 — Fundación técnica y seguridad — 3 a 3.5 semanas

- Crear el repositorio de LK INNOVACION desde una base Next.js limpia y aplicar la estructura definida en las secciones 2 y 3.
- Configurar npm, versión de Node y ambientes.
- Crear Neon, Prisma y migraciones iniciales.
- Implementar sesiones opacas en PostgreSQL, Argon2id, usuarios y RBAC.
- Crear auditoría, errores uniformes, paginación e idempotencia.
- Configurar Cloudinary y Pusher reales.
- Preparar pruebas, CI y despliegue de pruebas.
- Implementar un corte vertical de referencia: crear ítem → registrar movimiento → recalcular saldo → auditar → crear evento outbox → actualizar UI.
- Documentar este corte en el `README` como ejemplo obligatorio para los demás módulos.

### Fase 2 — Catálogos, productos e inventario base — 2 semanas

- Empresas, proveedores, clientes, monedas y unidades.
- Almacén principal.
- Ítems inventariables.
- Productos, tallas, colores, variantes y SKU.
- Stock balance, kardex, ajustes y stock mínimo.
- Imágenes de producto.
- Seeds versionados para monedas, unidades, tipos de presentación, almacén principal, estados, roles y permisos.

### Fase 3 — Compras y recepción — 2 a 2.5 semanas

- Cabecera/detalle de compra.
- Presentaciones y conversión a unidad base.
- IGV, moneda y totales.
- Adjuntos de documento.
- Flujo pendiente/aprobado/rechazado.
- Aprobación idempotente que alimenta el kardex.
- Reporte y primera versión de plantilla Excel.

### Fase 4 — Recetas y producción — 2.5 a 3 semanas

- Recetas versionadas y rendimiento.
- Componentes y validaciones de unidad.
- Órdenes de producción.
- Reserva y consumo de materiales.
- Producto terminado, lote y merma.
- Cancelación antes del consumo, devoluciones de material y cierre `SCRAPPED`.
- Alertas de faltantes y finalización.

### Fase 5 — Pedidos — 1.5 a 2 semanas

- Clientes, cabecera y detalle.
- Variantes y precios.
- Flujo de estados.
- Reserva, despacho y cancelación.
- Vínculo opcional con producción.
- Reporte y plantilla Excel.

### Fase 6 — Excel, reportes y tiempo real — 2 a 3 semanas, parcialmente en paralelo

- Completar las cinco plantillas.
- Validación, previsualización, confirmación e historial.
- Exportaciones con formato equivalente.
- Alertas Pusher y refresco de consultas.
- Pruebas de volumen y archivos inválidos.

### Fase 7 — Pruebas integrales, UAT y salida — 2 semanas

- Pruebas end-to-end y de concurrencia.
- Correcciones de aceptación de usuario.
- Dos ensayos de carga operativa inicial con las plantillas aprobadas; una migración histórica, si se contrata, tendrá un plan separado.
- Conciliación de stock, compras y producción.
- Manual breve y capacitación.
- Plan de reversa y salida controlada.
- Soporte de estabilización.

Varias actividades se ejecutarán en paralelo. Por eso el total calendario no es la suma lineal de todas las fases.

## 11. Dependencias y ruta crítica

```text
Definiciones de negocio
        ↓
Seguridad + catálogos + unidades
        ↓
Productos e inventario
        ↓
Compras → Recetas → Producción
        ↓                ↓
        └──────────── Pedidos
                         ↓
               Excel + pruebas + UAT
```

Inventario es la base común. No conviene desarrollar Compras, Producción o Pedidos antes de cerrar unidades, movimientos, lotes y reglas de stock.

## 12. Estrategia de pruebas

### Unitarias

- Cálculo de presentación y cantidad base.
- IGV, subtotal, total y redondeos.
- Promedio ponderado móvil, conversión a PEN y valoración de salidas, reversas y producto terminado.
- Invariantes de cantidad/valor cero, residuos de redondeo y orden `postedAt + postingSequence`.
- Conversiones de unidades.
- Escalamiento de recetas.
- Transiciones de estado.
- Cálculo de requerimientos y disponibilidad.

### Integración

- Compra aprobada → una sola entrada de stock.
- Compra rechazada → ningún movimiento.
- Dos entradas con costos distintos → cantidad, valor y promedio correctos; una salida conserva el costo congelado.
- Cancelación de entrada con movimientos posteriores → salida al promedio vigente, variación auditada y ninguna cantidad/valor residual inválido.
- Producción → reserva, consumo y entrada terminada.
- Producción con cero unidades buenas → estado `SCRAPPED` y ninguna entrada terminada.
- Reversa → cantidad/valor según la política de 5.5, variación registrada y trazabilidad conservada.
- Pedido → reserva y salida al despacho.
- Pedido con faltante → reserva disponible, vínculo a producción, reserva completada y despacho total.
- Roles y permisos por endpoint.
- Importación válida e inválida.

### End-to-end

- Crear material → comprar → aprobar → consultar kardex.
- Crear producto/variantes → crear receta → producir → ver stock terminado.
- Crear pedido → reservar → producir faltante → despachar.
- Importar y exportar en cada módulo.

### Concurrencia y seguridad

- Dos operaciones consumiendo el mismo stock.
- Reintentos de aprobación o consumo.
- Correlativos simultáneos.
- Acceso sin permiso.
- Archivos con MIME, tamaño o contenido inválido.
- Fórmulas peligrosas en Excel.
- Sesiones expiradas y revocadas.

### Pruebas de contrato del dominio

Antes de construir pantallas completas se escribirán pruebas de contrato para compras, kardex, producción y reservas. Estas pruebas fijarán el comportamiento esperado y permitirán que varios desarrolladores implementen módulos sin interpretar de forma diferente las reglas del negocio.

### Pipeline de integración continua

Cada pull request ejecutará en este orden:

```text
npm ci
→ prisma generate
→ lint
→ typecheck
→ pruebas unitarias
→ pruebas de integración contra PostgreSQL aislado
→ build
→ pruebas E2E críticas
→ comprobación de migraciones pendientes
```

No se permitirá merge si una etapa falla. Los despliegues usarán el lockfile y ejecutarán `prisma migrate deploy` de manera controlada antes de activar la nueva versión.

## 13. Operación y continuidad

- Rama `main` protegida, desarrollo en ramas cortas y merge únicamente mediante pull request con al menos una revisión.
- Cada pull request tendrá entorno de preview cuando sea posible; `staging` será el paso obligatorio antes de producción.
- Backups y restauración de Neon verificados antes de salida.
- Migraciones Prisma ensayadas en una copia de pruebas y con plan de rollback.
- Los cambios destructivos de esquema se harán en dos despliegues: primero compatibilidad, luego limpieza.
- Logs estructurados con identificador de solicitud, usuario y operación, sin datos sensibles.
- Monitoreo de errores y alertas por fallos de importación, worker y publicación Pusher.
- Rate limiting persistido en PostgreSQL para login, recuperación de acceso, subida de archivos e importaciones; no se usará memoria local porque el despliegue es serverless. Si el volumen excede esta solución del MVP, se migrará a un servicio compartido compatible sin cambiar el contrato de la API.
- Objetivo inicial de listados paginados en menos de 2 segundos para el volumen acordado.
- Procedimiento documentado para revocar sesiones, reintentar eventos y revertir una importación.
- Prueba periódica de restauración, no solo existencia de backup.

## 14. Criterios de aceptación del MVP

- Ningún módulo escribe stock directamente; todo pasa por kardex.
- El saldo coincide con la suma de movimientos.
- El valor del inventario y el promedio coinciden con los movimientos valorizados en PEN.
- El orden de valorización es reproducible por `postedAt + postingSequence`; ninguna fecha física reescribe costos históricos.
- Nunca existe cantidad cero con valor residual ni reserva mayor al stock físico.
- Una operación reintentada no duplica movimientos.
- No se permite stock negativo.
- Crear o editar una receta no consume materiales.
- Cada producción conserva la versión de receta usada.
- El consumo de producción es atómico.
- Cada variante talla/color tiene SKU único.
- Los permisos se validan en servidor.
- Las acciones sensibles quedan auditadas.
- Una importación se valida y previsualiza antes de aplicarse.
- Una importación no puede aprobar compras, activar recetas, confirmar pedidos ni reabrir saldos iniciales.
- Los errores Excel identifican hoja, fila, columna y causa.
- Pusher solo avisa; la interfaz confirma el estado consultando la API.
- Los importes se calculan con `Decimal`.
- Todas las migraciones, pruebas y controles CI están aprobados antes de producción.

### Definition of Done por historia

Una historia se considera terminada únicamente cuando:

- cumple los criterios funcionales y las reglas del dominio;
- valida entradas en servidor y, cuando corresponda, en cliente;
- aplica sesión, permiso y alcance `companyId`;
- usa una transacción en operaciones de stock o escrituras relacionadas;
- registra auditoría y evento outbox cuando corresponde;
- contempla estados de carga, vacío, éxito y error;
- funciona en escritorio y móvil y es operable por teclado;
- incluye pruebas proporcionales al riesgo;
- supera lint, typecheck, pruebas y build;
- incluye migración y seed cuando modifica datos estructurales;
- actualiza contrato API, plantilla Excel o documentación afectada;
- fue revisada por otro desarrollador y validada en staging;
- no expone secretos ni datos sensibles en logs o respuestas.

## 15. Estimación y equipo

| Frente | Esfuerzo estimado |
|---|---:|
| Descubrimiento y diseño | 3–4 persona-semanas |
| Fundación técnica y DevOps | 4–5 |
| Usuarios, RBAC y auditoría | 2–3 |
| Productos, catálogos e inventario | 5–6 |
| Compras y kardex | 5–7 |
| Recetas y producción | 5–7 |
| Pedidos | 3–4 |
| Excel y reportes | 4–6 |
| Cloudinary, Pusher y alertas | 1–2 |
| QA, UAT, carga inicial y salida | 5–7 |
| **Total base** | **37–51 persona-semanas** |

Distribución orientativa por rol:

| Rol | Esfuerzo estimado |
|---|---:|
| Ingeniería/arquitectura full-stack | 27–36 persona-semanas |
| QA y automatización | 5–7 |
| Producto/análisis y UAT | 3–5 |
| UX/DevOps puntual | 2–3 |
| **Total base** | **37–51 persona-semanas** |

Equipo sugerido:

- 1 responsable de producto con autoridad de alcance, 50% en fase 0 y 25–50% después.
- 1 analista funcional, 100% durante la fase 0; el responsable de producto puede cubrir este rol solo si dispone de esa dedicación.
- 1 líder técnico/full-stack.
- 1 desarrollador full-stack.
- 1 QA, 50% desde la segunda fase.
- UX y DevOps puntuales.

Escenarios de calendario:

- Dos desarrolladores + QA parcial: 17–22 semanas base.
- Aproximadamente tres FTE efectivos y sin migración histórica compleja: 13–18 semanas base.
- Un solo desarrollador: aproximadamente 9–12 meses.
- Alcance ampliado a contabilidad, SUNAT o MRP avanzado: requiere una nueva estimación.

La base **no incluye contingencia**. Mientras sigan abiertas las decisiones de la fase 0, el presupuesto autorizado debe incluir una reserva de **15–20%**, equivalente aproximadamente a **43–61 persona-semanas y 20–27 semanas calendario** en el escenario de dos desarrolladores. La migración histórica no está incluida; solo se contemplan dos ensayos de las cargas operativas iniciales.

La estimación corresponde a una implementación **greenfield**: no contabiliza reutilización de código, componentes o documentación de otro proyecto. Se recalibrará al convertir la fase 0 en backlog técnico detallado.

## 16. Supuestos iniciales recomendados

| Tema | Valor de partida |
|---|---|
| Empresa | Una empresa; los datos llevarán `companyId` para aislamiento futuro, sin pantallas multiempresa en el MVP |
| Almacenes | Uno en el MVP, modelo preparado para varios |
| Moneda base | PEN; compras y pedidos también en USD si se define tipo de cambio |
| IGV | Precio neto + 18% configurable |
| Costeo | Promedio ponderado móvil por ítem y almacén en PEN; Contabilidad lo ratifica en fase 0 |
| Cronología de kardex | El costo sigue `postedAt` + `postingSequence`; `occurredAt` es trazabilidad y no reordena costos |
| Lotes | `NONE/OPTIONAL/REQUIRED`; selección FIFO operativa con cambio autorizado, sin FEFO en el MVP |
| Stock negativo | No permitido |
| Compras | El stock ingresa al aprobar |
| Recetas | Versionadas; producto base con excepción opcional por variante |
| Producción | Reserva al liberar, consume al iniciar e ingresa una única terminación al completar; sin producción parcial |
| Pedidos | La estimación asume orden de venta; la alternativa de solicitud interna se decide en fase 0 |
| Parciales | Recepciones parciales como compras separadas; producción y despacho parciales fuera del MVP |
| Productos terminados | Se controlan en el mismo motor de inventario |
| Correcciones | Reversas y ajustes auditados, nunca borrado de movimientos |

## 17. Decisiones que deben validarse en la fase 0

1. ¿El precio por kilo o unidad se registra sin IGV o ya incluye IGV?
2. ¿Qué fuente, fecha y responsable autorizan el tipo de cambio PEN por unidad de moneda?
3. ¿Qué unidades se usarán y qué conversiones se permiten?
4. ¿Los líquidos se valorizan por litro o por kilo?
5. ¿Qué ítems requieren lote/vencimiento y se ratifica FIFO operativo con excepción autorizada?
6. ¿Habrá un almacén o varios desde el lanzamiento?
7. ¿La receta cambia por talla o color?
8. ¿Cuántos pares o unidades produce una ejecución de receta?
9. ¿Se ratifica consumo al iniciar y devolución/consumo adicional mediante movimientos separados?
10. ¿Se registrarán merma, sustituciones y sobreconsumo en el MVP?
11. ¿Pedido significa venta a cliente o solicitud interna?
12. ¿Se ratifican reserva parcial por faltante, vínculo a producción y despacho únicamente total?
13. ¿Se ratifican recepciones parciales como registros separados y se excluyen producción/despacho parciales?
14. ¿Cuál es el volumen máximo esperado por archivo Excel?
15. ¿Se ratifica la semántica de crear/actualizar definida para cada plantilla?
16. ¿Qué roles iniciales y destinatarios de alertas se requieren?
17. ¿Qué datos históricos deben migrarse?

La migración histórica es opcional y distinta de la carga masiva operativa solicitada. Si se confirma, tendrá diagnóstico, mapeo, ensayos y estimación propios.

### Responsables, fechas límite y criterio de cierre

El día se cuenta desde el inicio formal de la fase 0. Los valores de la sección 16 sirven para preparar ejemplos y estimar, pero no sustituyen la aprobación del responsable. Si una decisión no se firma, el gate permanece abierto y no se inicia desarrollo de dominio.

| Decisión o entregable | Responsable de decidir | Responsable de documentar | Límite | Evidencia de cierre |
|---|---|---|---:|---|
| Precio con/sin IGV, redondeo, IGV recuperable, tipo de cambio y promedio ponderado móvil | Contabilidad + dueño del producto | Analista funcional | Día 3 | Ejemplos de cálculo, fuente y autoridad de tasa aprobados |
| Unidades, conversiones, densidades, lotes y vencimientos | Almacén + Producción | Analista funcional | Día 2 | Catálogo y casos de conversión aprobados |
| Rendimiento, merma, momento de consumo y receta por producto/variante | Producción | Analista funcional + líder técnico | Día 3 | Flujo y matriz de estados aprobados |
| Pedido de venta o solicitud interna, reservas y despachos | Gerencia comercial/Operaciones | Dueño del producto | Día 3 | Tipo de pedido y flujo firmados |
| Recepciones, producción y despachos parciales | Operaciones | Dueño del producto + líder técnico | Día 4 | Reglas y ejemplos límite aprobados |
| Semántica Excel crear/actualizar, identificadores y volumen máximo | Dueño del producto + TI | Líder técnico | Día 5 | Cinco diccionarios de plantilla aprobados |
| Roles, permisos y destinatarios de alertas | Gerencia | Dueño del producto | Día 5 | Matriz RBAC aprobada |
| Datos históricos y estrategia de carga inicial | Dueño del producto + TI | Analista funcional | Día 5 | Alcance de migración o exclusión expresa |
| Diccionario físico, ERD, `schema.prisma` base y contrato API v1 | Líder técnico + dueño del producto | Equipo técnico | Día 7 | Revisión técnica y funcional registrada |
| Prototipo de navegación y plan de ambientes, migraciones y pruebas | Dueño del producto + líder técnico | UX/QA/DevOps | Día 8 | Acta de revisión registrada |

El dueño del producto coordina la firma global del gate; Contabilidad, Operaciones, Almacén, Producción, Gerencia y TI firman las decisiones de su ámbito, y el líder técnico firma su viabilidad. El líder técnico mantiene un registro de decisiones con fecha, responsable, alternativa elegida e historias afectadas. Un cambio posterior pasa por control de alcance y puede modificar costo y calendario.

## 18. Fuera del alcance inicial recomendado

- Facturación electrónica e integración SUNAT.
- Contabilidad completa y cuentas por pagar/cobrar.
- Planificación MRP avanzada o pronóstico de demanda.
- Nómina y costos completos de mano de obra.
- Aplicación móvil nativa u operación offline.
- Integraciones reales con WhatsApp o Telegram.
- Gestión avanzada de ubicaciones, picking y FEFO, salvo necesidad regulatoria.
- Portal de proveedores o clientes.

Estos elementos pueden agregarse después sin cambiar el núcleo si se respetan las fronteras modulares y el kardex inmutable.

## 19. Primeros entregables sugeridos

Antes de iniciar el desarrollo de reglas y módulos de negocio se deben aprobar:

1. Mapa de procesos y estados.
2. Diccionario físico de datos con tipos, nulabilidad, precisión, claves, índices, restricciones y valores por defecto.
3. Diagrama de entidades con cardinalidades y reglas de eliminación, acompañado por el esqueleto de `schema.prisma`.
4. Matriz de roles y permisos.
5. Prototipos de las cinco plantillas Excel.
6. Backlog por sprint con criterios de aceptación.
7. Prototipo de navegación del dashboard.
8. Contrato API v1 y matrices de transición de estados.
9. Plan de ambientes, migración y pruebas.

Con estas definiciones, un equipo que no conoce ningún proyecto anterior puede iniciar LK INNOVACION desde cero con una base común y verificable.
