# Contrato API v1 — borrador

Base: `/api/v1`. JSON en `camelCase`; fechas ISO 8601 UTC; cantidades e importes decimales enviados como cadenas para evitar pérdida de precisión.

## Respuesta exitosa

```json
{
  "data": {},
  "meta": { "requestId": "uuid" }
}
```

## Error

```json
{
  "error": {
    "code": "PURCHASE_INVALID_STATE",
    "message": "La compra debe estar pendiente.",
    "details": [],
    "requestId": "uuid"
  }
}
```

## Convenciones

- Paginación: `page`, `pageSize` (máximo 100), respuesta con `total`.
- Orden: `sort=createdAt:desc` con lista blanca por endpoint.
- Escrituras reintentables: encabezado `Idempotency-Key` UUID.
- Concurrencia: `version` o `updatedAt` obligatorio al editar.
- `companyId` proviene de la sesión, nunca del cuerpo.
- Importes y cantidades: cadenas decimales, por ejemplo `"500.000000"`.

## Recursos iniciales

| Método | Ruta | Permiso | Propósito |
|---|---|---|---|
| GET | `/health` | Público técnico | Estado del servicio |
| GET/POST | `/inventory/items` | `inventory.read` / `inventory.create_item` | Listar y crear ítems |
| GET | `/inventory/kardex` | `inventory.read` | Consultar movimientos |
| POST | `/inventory/adjustments` | `inventory.adjust_request` | Solicitar ajuste |
| GET/POST | `/purchases` | `purchases.read` / `purchases.create` | Listar y crear compras |
| POST | `/purchases/:id/submit` | `purchases.submit` | Enviar a aprobación |
| POST | `/purchases/:id/approve` | `purchases.approve` | Aprobar y alimentar kardex |
| POST | `/purchases/:id/reject` | `purchases.reject` | Rechazar |
| GET/POST | `/recipes` | `recipes.read` / `recipes.create` | Listar y crear recetas |
| POST | `/recipes/:id/activate` | `recipes.activate` | Congelar versión |
| GET/POST | `/production-orders` | `production.read` / `production.create` | Órdenes de producción |
| POST | `/production-orders/:id/release` | `production.release` | Reservar materiales |
| POST | `/production-orders/:id/start` | `production.start` | Consumir materiales |
| POST | `/production-orders/:id/complete` | `production.complete` | Ingresar producto terminado |
| GET/POST | `/products` | `products.read` / `products.create` | Productos y variantes |
| POST | `/products/{id}/images` | `products.image_manage` | Carga una imagen JPEG/PNG/WebP de hasta 5 MB en Cloudinary |
| DELETE | `/products/{id}/images/{imageId}` | `products.image_manage` | Elimina una imagen del producto y de Cloudinary |
| GET/POST | `/orders` | `orders.read` / `orders.create` | Pedidos |
| POST | `/orders/:id/confirm` | `orders.confirm` | Reservar stock |
| POST | `/orders/:id/dispatch` | `orders.dispatch` | Registrar salida |
| POST | `/imports/:module/preview` | `imports.preview` | Validar sin escribir |
| POST | `/imports/:module/confirm` | `imports.confirm` | Aplicar importación validada |
| GET | `/imports` | `imports.read` | Historial de validaciones e importaciones |
| GET | `/exports/:module?mode=template` | `imports.read` | Descargar plantilla Excel vigente |
| GET | `/dashboard/analytics?from=AAAA-MM-DD&to=AAAA-MM-DD` | sesión + permisos por módulo | KPIs, distribuciones y alertas operativas |
| GET | `/exchange-rates?days=30` | sesión | TC USD vigente e histórico por empresa |
| POST | `/exchange-rates` | `catalogs.manage` | Sincronizar TC de hoy o histórico oficial |
| GET | `/exports/:module?mode=report` | Permiso de lectura del módulo | Exportar datos usando el mismo formato de la plantilla |
| GET | `/notifications` | `dashboard.read` | Últimos avisos y contador sin leer |
| PATCH | `/notifications/{id}/read` | `dashboard.read` | Marcar un aviso como leído |
| PATCH | `/notifications/read-all` | `dashboard.read` | Marcar todos los avisos accesibles como leídos |
| POST | `/notifications/process` | `dashboard.read` | Despachar el outbox pendiente de la empresa durante el uso del dashboard |
| POST | `/workers/outbox` | Bearer `WORKER_SECRET` | Despachar el outbox de todas las empresas desde un proceso programado |

Los módulos Excel válidos son `purchases`, `inventory`, `recipes`, `products` y `orders`. La previsualización acepta únicamente `.xlsx` de hasta 5 MB y 1,000 filas, valida nombres de hojas, posición exacta de encabezados y campos obligatorios, y no escribe registros operativos. Un archivo válido queda en estado `PENDING`.

La confirmación recibe nuevamente el archivo y el `jobId`, comprueba la huella SHA-256 generada durante la previsualización y reclama el trabajo mediante transición condicional `PENDING → PROCESSING`. Todos los registros se aplican dentro de una única transacción serializable. El resultado es `COMPLETED` o `FAILED`; un reintento nunca duplica datos. Compras y Pedidos siempre se crean en borrador. Las acciones `CREAR` y `ACTUALIZAR` solo aplican a Ítems, Productos y Recetas.

## Códigos de error mínimos

`VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `IDEMPOTENCY_CONFLICT`, `INVALID_STATE`, `INSUFFICIENT_STOCK`, `EXCHANGE_RATE_REQUIRED`, `UNIT_CONVERSION_REQUIRED`, `DUPLICATE_DOCUMENT`, `TEMPLATE_VERSION_UNSUPPORTED`, `IMPORT_HAS_ERRORS`.
