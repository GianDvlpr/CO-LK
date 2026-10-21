# Reglas vigentes del negocio

Actualizado: 19/10/2026.

Este documento resume el comportamiento que no debe cambiarse accidentalmente. Ante duda, confirmar la implementación en el esquema, los servicios y las pruebas.

## 1. Reglas transversales

- Todos los datos operativos pertenecen a una empresa (`companyId`).
- Los identificadores internos son UUID; los usuarios ven códigos de negocio autogenerados.
- Los registros que ya participan en movimientos no se eliminan físicamente salvo que exista un flujo de limpieza expresamente aislado.
- Los cambios sensibles registran auditoría y, cuando deben notificarse, un evento outbox.
- Pusher comunica cambios; PostgreSQL conserva el estado real.
- Fechas operativas se muestran en español y contexto de Perú. Persistir instantes como `DateTime`; las fechas puras usan columnas `Date` cuando el modelo lo define.

## 2. Usuarios, roles y sesiones

- Se inicia sesión únicamente con usuario y contraseña.
- Contraseña mínima: 6 caracteres. Las cuentas nuevas o restablecidas deben cambiar la contraseña temporal.
- Las contraseñas se almacenan con Argon2 y nunca pueden verse ni recuperarse.
- `SUPERADMIN` tiene todos los permisos. `ADMIN` no administra usuarios, roles ni sesiones.
- Un superadministrador puede restablecer la contraseña de otro usuario, pero no la propia mediante ese flujo.
- Desactivar un usuario revoca sus sesiones activas.
- Todas las sesiones vencen a las 8 horas; el usuario debe autenticarse nuevamente y no existe “mantener sesión”.
- La vista Sesiones muestra inicio, IP disponible, agente, última actividad, duración, cierre y estado; un usuario autorizado puede revocar otra sesión.

### Auditoría

- `audit.read` es un permiso sensible asignado inicialmente solo a SUPERADMIN; un rol personalizado puede recibirlo de forma explícita.
- La auditoría pertenece a una empresa y nunca mezcla eventos entre compañías.
- Registra inicios y cierres de sesión, acceso a módulos, creación, edición, eliminación o inactivación, cambios de estado, cargas y descargas cuando la operación los genera.
- Los eventos operativos se conservan como historial; la vista no permite editarlos ni eliminarlos.
- IP y navegador se muestran cuando la solicitud los proporciona. Un dato ausente se presenta como “No disponible” y no debe inferirse.
- Contraseñas, hashes, tokens, cookies y secretos se ocultan recursivamente antes de responder o exportar.
- Repetir o refrescar el mismo módulo dentro de 60 segundos no crea otro evento de acceso.
- El reporte Excel respeta los filtros activos y admite hasta 10,000 eventos por descarga.

## 3. Catálogos

Incluyen proveedores, clientes, almacenes, unidades y monedas.

- Proveedores y clientes aceptan DNI o RUC.
- DNI exige 8 dígitos; RUC exige 11 y dígito verificador válido.
- La consulta externa autocompleta lo disponible, pero todos los datos pueden corregirse antes de guardar.
- Teléfono y correo se ingresan manualmente.
- Se usan dos tokens RUC en orden aleatorio y con fallback.
- Inactivar evita uso nuevo, pero conserva relaciones históricas.
- Si no existe almacén al importar, la referencia operativa esperada es `PRINCIPAL` una vez creado por el seed.

## 4. Compras

Campos esenciales:

- fecha de recepción;
- proveedor;
- documento o guía;
- lote de proveedor opcional o requerido según el material;
- presentación, por ejemplo 20 sacos de 10 kg;
- cantidad base recibida = cantidad de presentaciones × contenido;
- precio neto por unidad base;
- moneda y tipo de cambio;
- IGV configurable por empresa (18 % por defecto);
- estado pendiente, aprobado o rechazado.

Reglas:

- Crear una compra no cambia stock.
- Aprobar una compra ingresa stock exactamente una vez, valoriza en PEN incluyendo el IGV en el costo unitario, actualiza balances y kardex en una transacción.
- Rechazar no mueve inventario.
- El documento no debe duplicarse para el mismo proveedor y secuencia de recepción.
- La tasa de IGV es configurable por empresa en Catálogos → Configuración general (18 % por defecto). El Excel de Compras no solicita tasa por línea y usa la configurada; los archivos anteriores con `IGV (%)` se aceptan ignorando esa columna.
- Una compra registrada puede compartirse con el proveedor por WhatsApp. El mensaje incluye materiales, código del proveedor, presentaciones y cantidades (sin precios ni totales) y la URL de la imagen del material cuando existe.
- No usar `number` para cálculos de cantidad, precio, IGV o totales.

## 5. Almacén y kardex

Tipos de ítem:

- `RAW_MATERIAL`: insumo comprado o consumido.
- `WASTE`: merma o sobrante físico recuperable, medible, almacenado y potencialmente reutilizable.
- `FINISHED_PRODUCT`: existencia creada desde una variante de Productos.

Referencias de abastecimiento:

- Al crear o editar manualmente una materia prima o merma desde Almacén se exige un proveedor activo y una moneda registrada.
- En Excel, `proveedor_nombre` debe coincidir con el nombre de un proveedor activo; la comparación ignora mayúsculas, tildes y espacios repetidos.
- En Excel, `moneda` acepta el código o el nombre de una moneda registrada, aunque la lista desplegable propone sus códigos (`PEN`, `USD`, etc.).
- Los productos terminados generados internamente desde Productos no requieren proveedor ni moneda de compra.
- Los registros históricos sin estas referencias permanecen como `Sin asignar`; no se deben completar con datos inventados.

Sector e imágenes del ítem:

- Cada ítem puede tener un sector o almacén de referencia (`defaultWarehouseId`). Es obligatorio para materia prima; opcional para insumo elaborado, merma y producto terminado.
- La materia prima admite una única imagen de referencia en Cloudinary (JPEG, PNG o WebP, hasta 5 MB). Se usa al compartir solicitudes de compra con el proveedor.
- En Excel, `almacen_codigo` registra el sector del ítem aunque no haya stock inicial; si una materia prima no lo informa, se usa `PRINCIPAL`. Con stock inicial también determina el almacén del movimiento.

Datos de referencia para compras:

- Un ítem puede registrar el código con el que el proveedor identifica el producto (`supplierProductCode`).
- También puede registrar un costo de referencia opcional: precio neto y tasa de IGV en porcentaje. El costo total de referencia es `precio neto × (1 + IGV/100)`, usando el IGV configurado por empresa cuando no se informa.
- Estos datos son informativos para preparar pedidos al proveedor; no generan movimientos ni modifican la valorización del saldo inicial.
- Al aprobar una compra cuya moneda coincide con la moneda de referencia del ítem, el precio neto y la tasa IGV de la línea reemplazan la referencia del ítem en una operación auditada. Si las monedas difieren, la referencia no cambia.

Distinción crítica:

- El tipo `WASTE` representa una existencia física recuperable.
- La merma real de una orden representa pérdida del proceso y se registra al cerrar Producción.
- No confundir ambas cosas ni volver a poner un porcentaje de merma en Recetas.

Stock inicial:

- Un ítem puede crearse con stock cero.
- Después de contar o pesar físicamente, se registra un saldo inicial una sola vez por existencia/lote.
- No cargar cantidades históricas que ya fueron consumidas.
- Ajustes posteriores deben usar movimientos de ajuste, no repetir saldo inicial.

El kardex es inmutable. Correcciones contables deben realizarse mediante movimientos compensatorios, nunca editando movimientos ya contabilizados.

## 6. Productos y SKU

- Producto representa el modelo de suela.
- `matrixCode` es el código interno de matriz conocido por la fábrica.
- Una variante combina talla, color principal C1 y color secundario C2 opcional.
- Máximo dos colores. C2 indica una suela bicolor, no una cantidad adicional de pares.
- SKU: `MATRIZ-C1[-C2]-TALLA`, por ejemplo `I0034-NEG-39`.
- Cada variante crea y enlaza su ítem `FINISHED_PRODUCT` con stock cero.
- Los productos terminados se crean desde Productos, no manualmente desde Almacén.

## 7. Recetas

- Recetas es el único lugar donde se define la combinación de ingredientes; no se mantiene una fórmula paralela en Almacén.
- Una receta tiene un solo destino: un producto final para Producción o un ítem `INTERMEDIATE` para Almacén.
- Una versión contiene rendimiento manual: cuántos pares, unidades o kilos produce una ejecución completa.
- Sus ingredientes contienen material y cantidad estándar.
- Crear o activar una receta no descuenta stock.
- Activar congela la versión que podrá enviarse a Producción o Almacén.
- Enviar a Producción abre la creación de una orden con la receta preseleccionada; el consumo ocurre al iniciar la orden y el producto final ingresa al terminarla.
- Enviar a Almacén descuenta inmediatamente los ingredientes, registra kardex y aumenta el stock del insumo resultante con costo promedio calculado desde el valor consumido.
- Las recetas de insumos se validan contra dependencias circulares: un resultado no puede depender directa ni indirectamente de sí mismo.
- La receta no contiene merma teórica ni porcentaje de merma.
- La merma real se declara al ejecutar el destino. Una merma física recuperable puede ser ingrediente si existe como ítem `WASTE` en Almacén.

## 8. Producción

Estados vigentes:

```text
DRAFT → RELEASED → IN_PROGRESS → COMPLETED
   └──────────────→ CANCELLED, cuando el flujo autorizado lo permita
```

En la interfaz: Pendiente → En curso → Finalizado. `RELEASED` es un estado técnico de material reservado.

Reglas:

- La orden puede vincularse a un pedido.
- Selecciona formulación C1 obligatoria y C2 solo cuando la variante sea bicolor.
- Todas las tallas de una orden usan la misma combinación C1/C2.
- La programación distribuye pares por variantes registradas de talla y color.
- Las ejecuciones de receta se calculan a partir del total de pares y su rendimiento.
- Componentes opcionales se seleccionan desde Almacén y forman parte del material planificado.
- Liberar reserva materiales sin reducir el stock físico.
- Iniciar consume las cantidades estándar planificadas y desactiva reservas.
- Finalizar registra por talla la cantidad buena y por material la merma real.
- La merma real debe ser mayor o igual a cero y no superar la cantidad consumida del material.
- Registrar merma al final no descuenta otra vez el stock: el material completo ya se consumió al iniciar.
- El costo consumido completo, incluida la porción declarada como merma, se distribuye entre los pares buenos terminados.
- Finalizar ingresa el producto terminado al SKU correspondiente y actualiza pedido/stock.
- El documento se exporta en Excel y PDF con tamaño físico A5, pero no imprime la palabra “A5” en la cabecera.
- Además del PDF con datos, existe un formato A5 en blanco (sin valores) para llenarlo a mano.
- El formato muestra solo la sección de prensa, inyectora, ambas o ninguna según el tipo de proceso seleccionado.
- Una orden de producción puede consolidar varias órdenes de pedido. Las cantidades programadas por talla no pueden superar la suma disponible de las líneas seleccionadas.
- El A5 muestra la fecha de emisión en la cabecera, omite estado, prioridad y serie/modelo, y separa `TOTAL` de `TOTAL ESPERADO` en el control por talla.
- El A5 de producción usa letra mayor en las celdas de contenido (no en cabeceras) y el recuadro de observaciones ocupa una sola línea; el Excel conserva el mismo criterio.
- Cada cliente puede registrar una lista de logos/marcas (solo nombre). Al crear la orden se selecciona uno de los logos del cliente de los pedidos vinculados; el campo Logo / marca se autocompleta y sigue siendo editable.
- Los pedidos vinculados a una orden con logo/marca registrado deben pertenecer al mismo cliente.

## 9. Maquinaria

- Tipos: prensa, inyectora u otra.
- Estados: operativa, en mantenimiento o fuera de servicio.
- Se registran mantenimientos preventivos, correctivos y reparaciones, fechas, próximo vencimiento, costos y observaciones.
- Una máquina fuera de servicio no debe seleccionarse para una orden nueva.

## 10. Pedidos, Pick & Pack y despacho

Pedido:

```text
DRAFT → CONFIRMED → IN_PRODUCTION/READY → DISPATCHED
  └────────────────────────────────────→ CANCELLED
```

- Confirmar reserva producto terminado disponible.
- Un faltante puede atenderse mediante Producción.
- Cada línea de pedido puede vincularse a una sola orden de producción, pero una orden de producción puede atender varios pedidos.

Pick & Pack:

```text
PENDING → PICKING → PACKING → READY → DISPATCHED
```

- Registra cantidades solicitadas, recogidas y empacadas, ubicación, lote, incidencias y paquetes.
- No incluye responsables de pick/pack ni firmas en el formato.
- El formato imprimible es A5 apaisado.
- Despachar descuenta lo realmente empacado y libera reservas no utilizadas.
- Un reintento no debe duplicar la salida del kardex.

## 11. Calendario y tablero

- Consolida fechas de pedidos, producción, Pick & Pack, mantenimientos y eventos manuales.
- Los eventos manuales pueden ser inventario, reunión, tarea u otro.
- El tablero de Producción permite mover tarjetas entre Pendiente, En curso y Finalizado.
- En móvil debe existir una alternativa táctil funcional; no depender solo del drag-and-drop del mouse.

## 12. Excel

Módulos con plantilla, importación y reporte: Compras, Almacén, Recetas, Productos y Pedidos.

- La plantilla usa encabezados amigables y una hoja de instrucciones con explicación y ejemplo por columna.
- El servidor convierte los encabezados amigables a claves internas.
- Código vacío: registro nuevo y código autogenerado.
- Código presente: identifica un registro existente proveniente de un reporte.
- No existe columna `accion`.
- `referencia_carga` solo se conserva donde agrupa varias filas nuevas sin código, como productos con variantes, recetas con ingredientes o pedidos con líneas.
- Filas idénticas repetidas se omiten con advertencia.
- La misma clave con datos distintos bloquea la carga.
- Un reporte reimportado en modo `ONLY_NEW` agrega solo registros nuevos y omite los existentes.
- Después de validar, el usuario puede elegir el modo `CREATE_UPDATE` para aplicar los cambios del archivo sobre los registros existentes (Almacén y Productos actualizan; Recetas crea una nueva versión). Compras y Pedidos no sobrescriben registros existentes.
- Validar archivo y huella antes de confirmar; la confirmación es transaccional.
- Máximo actual: 5 MB y 1,000 filas.
- En la plantilla de Recetas no existe merma; se informa al finalizar Producción.

