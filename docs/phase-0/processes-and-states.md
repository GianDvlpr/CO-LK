# Procesos y estados — Fase 0

## Compras

```text
DRAFT → PENDING → APPROVED
                ↘ REJECTED
APPROVED → CANCELLED (movimiento compensatorio)
```

- Crear o importar no modifica stock.
- Enviar valida proveedor, documento, líneas, unidades, moneda y tipo de cambio.
- Aprobar genera entrada de kardex, recalcula el saldo y emite auditoría/outbox en una transacción.
- Rechazar no modifica stock.
- Cancelar nunca borra el movimiento original.

## Inventario y kardex

```text
Origen autorizado → validación → movimiento inmutable → saldo → auditoría → outbox
```

- `StockMovement` es la fuente de verdad.
- `StockBalance` es una proyección transaccional.
- No se permite stock negativo.
- La secuencia contable usa `postedAt` y `postingSequence`.
- Reservar reduce disponibilidad, no stock físico.

## Recetas

```text
DRAFT → ACTIVE → ARCHIVED
```

- Editar una receta activa crea una versión nueva.
- Activar congela ingredientes, cantidades, rendimiento y unidad de salida.
- Construir o consultar una receta no descuenta stock.

## Producción

```text
DRAFT → RELEASED → IN_PROGRESS → COMPLETED
   ↘ CANCELLED   ↘ SCRAPPED
```

- Liberar reserva insumos.
- Iniciar libera la reserva y contabiliza las salidas.
- Completar registra una entrada de producto terminado.
- Cancelar después del consumo requiere movimientos de devolución o ajuste.

## Pedidos

```text
DRAFT → CONFIRMED → READY → DISPATCHED → DELIVERED
                    ↘ IN_PRODUCTION ↗
Estado previo a despacho → CANCELLED

Pick & Pack: PENDING → PICKING → PACKING → READY → DISPATCHED
```

- Confirmar reserva stock disponible.
- Un faltante puede vincularse a producción.
- Pick & Pack registra ubicación, lote, cantidades recogidas y empacadas, incidencias y paquetes sin modificar el kardex.
- Una diferencia solo puede cerrarse con tipo y motivo de incidencia.
- Despachar registra la salida de la cantidad realmente empacada y libera la diferencia reservada.
- El formato A4 puede imprimirse o guardarse como PDF y no incluye firmas.

## Reglas transversales

- Toda transición valida estado actual y permiso dentro de la transacción.
- Toda escritura acepta una clave de idempotencia cuando pueda reintentarse.
- Todo cambio sensible registra usuario, empresa, fecha, motivo y valores relevantes.
- Pusher solo avisa; la interfaz vuelve a consultar la API.
