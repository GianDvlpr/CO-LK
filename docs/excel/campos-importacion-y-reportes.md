# Campos de importación y reportes Excel

Actualizado: 19/10/2026.

## Regla general

Todas las columnas deben permanecer en la plantilla y conservar exactamente su encabezado. Esto permite que plantilla, importación y reporte usen el mismo formato. Sin embargo, no todas las celdas son obligatorias.

Las plantillas identifican los campos obligatorios en verde oscuro y los opcionales en gris. La hoja `Instrucciones` enumera ambos grupos por hoja.

La misma hoja también incluye un ejemplo concreto por cada campo (códigos, fechas, cantidades, moneda, estados y valores SI/NO). Los ejemplos son orientativos: deben reemplazarse por datos reales antes de cargar el archivo.

## Campos obligatorios

| Módulo | Hoja | Campos obligatorios |
| --- | --- | --- |
| Compras | Compras | `fecha_recepcion`, `proveedor_codigo`, `numero_documento`, `moneda`, `estado`, `linea_numero`, `material_codigo`, `cantidad_presentaciones`, `tipo_presentacion`, `contenido_por_presentacion`, `unidad_contenido`, `precio_neto_unidad_base` |
| Almacén | Almacén | `nombre`, `tipo_item`, `proveedor_nombre`, `moneda`, `unidad_base` |
| Recetas | Recetas | `referencia_carga`, `producto_codigo`, `version`, `rendimiento`, `material_codigo`, `cantidad` |
| Productos | Productos | `referencia_carga`, `nombre` |
| Pedidos | Pedidos | `referencia_carga`, `cliente_codigo`, `fecha`, `linea_numero`, `sku`, `cantidad`, `precio_neto_unitario` |

Los demás campos pueden quedar vacíos. Algunos reciben valores predeterminados: IGV configurable por empresa (18 % por defecto), tipo de cambio 1, stock mínimo 0, activo `SI`, modo de lote `NONE` y secuencias automáticas cuando corresponde. La merma real no se importa en Recetas: se registra al finalizar cada orden de Producción.

En Compras ya no se solicita la tasa de IGV por línea: la importación usa el IGV configurado en Catálogos → Configuración general. Los archivos anteriores que todavía traen la columna `IGV (%)` siguen siendo válidos; esa columna se ignora.

En Almacén, `proveedor_nombre` hace match contra el nombre de un proveedor activo ignorando mayúsculas, tildes y espacios repetidos. Debe existir una única coincidencia. `moneda` acepta el código o el nombre de cualquier moneda registrada; la plantilla propone los códigos disponibles en una lista desplegable.

El encabezado visible es `Costo unitario`; la moneda se registra por separado en la columna `Moneda`. El identificador técnico interno `costo_unitario_pen` se conserva únicamente para mantener compatibilidad con archivos generados anteriormente.

El ítem también puede registrar datos de referencia para sus pedidos al proveedor: `codigo_producto_proveedor` (código con el que el proveedor identifica el producto), `precio_neto` y `tasa_igv` (porcentaje). El `costo_total` se recalcula como `precio_neto × (1 + IGV/100)` y usa el IGV configurado por empresa (18 % por defecto). Estos valores no modifican la valorización del saldo inicial ni generan movimientos. Las cuatro columnas son opcionales: los archivos generados con versiones anteriores siguen siendo válidos y una celda vacía conserva el valor ya registrado en el ítem.

## Códigos automáticos

Los códigos oficiales no se escriben al crear registros desde la aplicación. Se generan dentro de la misma transacción de guardado, por empresa, sin reutilizar números y con bloqueo para evitar duplicados concurrentes.

| Registro | Formato | Ejemplo |
| --- | --- | --- |
| Compra | `CMP-AÑO-######` | `CMP-2026-000001` |
| Materia prima | `MP-######` | `MP-000001` |
| Producto terminado de almacén | `PT-######` | `PT-000001` |
| Receta | `REC-######` | `REC-000001` |
| Orden de producción | `OP-AÑO-######` | `OP-2026-000001` |
| Maquinaria | `MAQ-######` | `MAQ-000001` |
| Pedido | `PED-AÑO-######` | `PED-2026-000001` |
| Pick & Pack | `PP-AÑO-######` | `PP-2026-000001` |
| Proveedor | `PROV-######` | `PROV-000001` |
| Cliente | `CLI-######` | `CLI-000001` |

En una plantilla Excel, un código vacío significa “crear” y el sistema asigna el siguiente correlativo. Un código informado significa “registro existente” y permite reconocer una fila proveniente de un reporte. Los reportes siempre incluyen el código oficial.

## Columnas informativas o calculadas

Estas columnas se conservan para que el reporte tenga el mismo formato, pero no determinan el registro importado:

- Compras: `tipo_documento`, `fecha_tipo_cambio`, `fuente_tipo_cambio`, `estado`, `observaciones`, `tipo_presentacion`, `unidad_contenido`, `precio_unitario_con_igv`, `subtotal_neto`, `igv` y `total_linea`.
- Almacén: `almacen_codigo`, `stock_inicial`, `costo_unitario_pen`, `lote` y `fecha_inicial` están en la misma hoja. Si no hay stock inicial, esos campos pueden quedar vacíos. `codigo_producto_proveedor`, `precio_neto` y `tasa_igv` son datos de referencia del ítem; `costo_total` se recalcula y no determina la importación.
- Recetas: `variante_sku`, `unidad_salida` y `estado`. La importación crea la receta o versión como borrador.
- Productos: `categoria` y `precio_venta`.
- Pedidos: `moneda`, `tipo_cambio_pen`, `estado`, `tasa_igv`, `subtotal_neto`, `igv` y `total_linea`. El pedido importado queda en borrador.

## Prevención de duplicados y modo “Solo nuevos”

- Los reportes descargados quedan marcados internamente como `REPORT` y al volver a cargarlos se procesan en modo `ONLY_NEW`.
- En ese modo, una clave que ya existe en la base de datos se omite: no se duplica y tampoco sobrescribe el registro existente.
- El resultado de la confirmación separa cuántos registros nuevos fueron agregados y cuántos existentes fueron omitidos.
- La validación previa detecta claves repetidas dentro del mismo libro, ignorando diferencias entre mayúsculas y minúsculas. Una fila completamente idéntica se omite con advertencia; la misma clave con datos diferentes es un conflicto bloqueante.
- En una plantilla de carga manual, el sistema infiere la operación: sin código crea; con código busca el registro existente.
- Compras y Pedidos no sobrescriben un código o número ya registrado.
- Almacén y Productos actualizan el registro cuando reciben un código existente.
- En variantes, el sistema reconoce registros existentes usando el SKU.
- En Recetas, un código existente crea una nueva versión; no duplica la cabecera de receta.
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
