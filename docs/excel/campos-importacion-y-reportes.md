# Campos de importación y reportes Excel

Actualizado: 13/10/2026.

## Regla general

Todas las columnas deben permanecer en la plantilla y conservar exactamente su encabezado. Esto permite que plantilla, importación y reporte usen el mismo formato. Sin embargo, no todas las celdas son obligatorias.

Las plantillas identifican los campos obligatorios en verde oscuro y los opcionales en gris. La hoja `Instrucciones` enumera ambos grupos por hoja.

La misma hoja también incluye un ejemplo concreto por cada campo (códigos, fechas, cantidades, moneda, estados y valores SI/NO). Los ejemplos son orientativos: deben reemplazarse por datos reales antes de cargar el archivo.

## Campos obligatorios

| Módulo | Hoja | Campos obligatorios |
| --- | --- | --- |
| Compras | Compras | `codigo_compra`, `fecha_recepcion`, `proveedor_codigo`, `numero_documento`, `moneda` |
| Compras | DetalleCompra | `codigo_compra`, `linea_numero`, `material_codigo`, `cantidad_presentaciones`, `contenido_por_presentacion`, `precio_neto_unidad_base` |
| Almacén | Items | `accion`, `codigo`, `nombre`, `tipo_item`, `unidad_base` |
| Almacén | MovimientosIniciales | `item_codigo`, `almacen_codigo`, `fecha`, `cantidad`, `costo_unitario_pen` |
| Recetas | Recetas | `accion`, `receta_codigo`, `producto_codigo`, `version`, `rendimiento` |
| Recetas | Ingredientes | `receta_codigo`, `version`, `material_codigo`, `cantidad` |
| Productos | Productos | `accion`, `producto_codigo`, `nombre` |
| Productos | Variantes | `producto_codigo`, `sku`, `talla`, `color`, `unidad` |
| Pedidos | Pedidos | `numero_pedido`, `cliente_codigo`, `fecha` |
| Pedidos | DetallePedido | `numero_pedido`, `linea_numero`, `sku`, `cantidad`, `precio_neto_unitario` |

Los demás campos pueden quedar vacíos. Algunos reciben valores predeterminados: IGV 18%, tipo de cambio 1, stock mínimo 0, merma 0, activo `SI`, modo de lote `NONE` y secuencias automáticas cuando corresponde.

## Columnas informativas o calculadas

Estas columnas se conservan para que el reporte tenga el mismo formato, pero no determinan el registro importado:

- Compras: `tipo_documento`, `fecha_tipo_cambio`, `fuente_tipo_cambio`, `estado`, `observaciones`, `tipo_presentacion`, `unidad_contenido`, `precio_unitario_con_igv`, `subtotal_neto`, `igv` y `total_linea`.
- Almacén: `almacen_codigo` de la hoja `Items`. El almacén efectivo del stock inicial se toma de `MovimientosIniciales`.
- Recetas: `variante_sku`, `unidad_salida` y `estado`. La importación crea la receta o versión como borrador.
- Productos: `categoria` y `precio_venta`.
- Pedidos: `moneda`, `tipo_cambio_pen`, `estado`, `tasa_igv`, `subtotal_neto`, `igv` y `total_linea`. El pedido importado queda en borrador.

## Prevención de duplicados y modo “Solo nuevos”

- Los reportes descargados quedan marcados internamente como `REPORT` y al volver a cargarlos se procesan en modo `ONLY_NEW`.
- En ese modo, una clave que ya existe en la base de datos se omite: no se duplica y tampoco sobrescribe el registro existente.
- El resultado de la confirmación separa cuántos registros nuevos fueron agregados y cuántos existentes fueron omitidos.
- La validación previa detecta claves repetidas dentro del mismo libro, ignorando diferencias entre mayúsculas y minúsculas. Una fila completamente idéntica se omite con advertencia; la misma clave con datos diferentes es un conflicto bloqueante.
- En una plantilla de carga manual se conserva el modo `CREAR/ACTUALIZAR`: Compras y Pedidos rechazan códigos/números existentes; Almacén, Productos y Recetas aplican las reglas de la columna `accion`.
- Almacén y Productos exigen `CREAR` para un código nuevo y `ACTUALIZAR` para uno existente.
- En variantes, si `accion` queda vacía, el sistema infiere `CREAR` o `ACTUALIZAR` usando el SKU.
- En Recetas, `ACTUALIZAR` crea una nueva versión de la receta existente; no duplica la cabecera de receta.
- El stock inicial se rechaza cuando el ítem ya tiene movimientos.
- La confirmación es transaccional: si una fila presenta conflicto, se revierte el archivo completo.
- El mismo archivo validado no puede confirmarse dos veces; se comprueba su huella SHA-256 y el estado del trabajo de importación.

## Filtro de reportes

La vista de Importaciones y cada vista de módulo permiten seleccionar fecha inicial y final. Ambas fechas están incluidas. Desde Compras, Almacén, Recetas, Productos y Pedidos se puede descargar la plantilla, descargar el reporte filtrado, validar y confirmar la carga sin abandonar el módulo.

| Reporte | Fecha utilizada para el filtro |
| --- | --- |
| Compras | Fecha de recepción |
| Pedidos | Fecha del pedido |
| Almacén | Fecha de creación del ítem |
| Recetas | Fecha de creación de la receta |
| Productos | Fecha de creación del producto |

El periodo aparece en la hoja `Instrucciones` y en el nombre del archivo descargado.

## Panel de analítica

La opción anterior `Resumen` se denomina ahora `Analítica`. El panel muestra inventario valorizado, compras pendientes, pedidos con entrega vencida o próxima, alertas de stock mínimo/agotado, distribuciones por estado y los productos más pedidos. El rango de fechas del panel controla Compras, Pedidos y Producción; las alertas de inventario representan el saldo actual.
