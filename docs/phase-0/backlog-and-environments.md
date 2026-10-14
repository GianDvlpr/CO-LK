# Backlog inicial, ambientes y estrategia de entrega

## Prioridades

### Sprint 0 — cierre funcional

1. Aprobar F0-01 a F0-10.
2. Revisar procesos, RBAC, API, ERD y diccionario.
3. Probar las cinco plantillas con datos reales representativos.
4. Firmar alcance y criterios de aceptación.

### Sprint 1 — seguridad y corte vertical

1. ✓ Crear empresa, usuario, sesión, roles y permisos.
2. ✓ Implementar auditoría y respuesta uniforme de API.
3. ✓ Crear ítem y almacén.
4. ✓ Registrar un movimiento de apertura.
5. ✓ Recalcular saldo y consultar kardex.
6. ✓ Generar evento outbox y refrescar la interfaz.

### Sprint 2 — catálogo e inventario

1. Unidades y monedas operativas; conversiones y tipo de cambio pendientes.
2. ✓ Proveedores, clientes y almacenes.
3. ✓ Productos, tallas, colores, variantes y SKU.
4. Ajustes, lotes y stock mínimo.

### Sprint 3 — compras

1. Compra y detalle por presentación.
2. Cálculo neto, IGV y total.
3. Envío, aprobación, rechazo y reversa.
4. Entrada idempotente al kardex.
5. Importación y exportación Excel.

### Sprint 4 — recetas y producción

1. ✓ Crear recetas versionadas con rendimiento, ingredientes y merma.
2. ✓ Activar y congelar una versión sin descontar stock.
3. ✓ Crear, liberar, iniciar y completar órdenes de producción.
4. ✓ Reservar al liberar, consumir al iniciar e ingresar producto terminado al completar.

### Sprint 5 — pedidos

1. ✓ Registrar pedidos por cliente y variante de producto.
2. ✓ Confirmar pedidos reservando stock terminado.
3. ✓ Despachar el pedido y contabilizar la salida valorizada.
4. Vinculación automática de faltantes con producción pendiente.

## Criterio de aceptación del primer corte

- Un usuario autorizado crea un ítem en unidad base.
- Registra un movimiento de apertura mediante caso de uso.
- El sistema persiste movimiento, saldo, auditoría y outbox en una transacción.
- El kardex y el saldo coinciden después de recargar.
- Un reintento con la misma clave no duplica el movimiento.
- Dos escrituras concurrentes no generan stock negativo ni pérdida de actualización.

## Ambientes

| Ambiente | Base de datos | Servicios | Propósito |
|---|---|---|---|
| Local | PostgreSQL local o rama Neon personal | Cloudinary/Pusher simulados | Desarrollo y pruebas rápidas |
| Preview | Rama Neon por despliegue | Cuentas sandbox | QA y revisión funcional |
| Producción | Neon productivo con backups | Cloudinary/Pusher productivos | Operación real |

Los secretos solo viven en variables de entorno. Cada ambiente usa credenciales y bases separadas.

## Migraciones

- Crear migraciones únicamente después del gate de fase 0.
- Revisar SQL generado y restricciones antes de integrar.
- CI ejecuta `prisma validate` y una base temporal desde cero.
- Preview aplica `prisma migrate deploy`.
- Producción requiere backup verificado, ventana de cambio y plan de reversa compatible.
- No usar `prisma db push` en preview ni producción.

## Pruebas

- Unitarias para cálculos, transiciones y permisos.
- Integración con PostgreSQL real para transacciones, concurrencia e idempotencia.
- E2E para los flujos principales por rol.
- Contratos para Excel, Pusher, Cloudinary y respuestas API.
- UAT con Contabilidad, Almacén, Producción, Ventas y Operaciones.
