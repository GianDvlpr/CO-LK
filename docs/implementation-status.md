# Estado de implementación

Actualizado: 19/10/2026.

## Completado

- Gate de fase 0 aprobado y registrado (10/10 decisiones).
- Base Next.js, React, TypeScript, Ant Design y estructura modular.
- Navegación responsive y pantallas de referencia para todos los módulos del MVP.
- Plantillas Excel de Compras, Almacén, Recetas, Pedidos y Productos.
- Proyecto Neon vinculado a la rama `production`, variables locales descargadas y MCP configurado.
- Clientes Pusher de navegador y servidor; clave pública y cluster configurados.
- Esquema Prisma inicial validado con compras, inventario/kardex, productos, recetas, producción, pedidos, usuarios, RBAC, importaciones, auditoría, notificaciones y outbox.
- Migración SQL inicial generada por el motor de Prisma.
- Migración inicial aplicada en Neon y seed idempotente ejecutado para empresa, unidades, monedas, almacén, permisos, roles `SUPERADMIN`/`ADMIN` y sus cuentas iniciales.
- Primera regla de dominio de Compras: presentación × contenido, subtotal, IGV y total con decimales exactos.
- Caso de uso de creación de compra pendiente con validación de referencias, documentos duplicados, líneas y asignación de lotes.
- Caso de uso de aprobación transaccional: bloqueo concurrente, costo con IGV convertido a PEN, saldo global y por lote, promedio ponderado móvil, kardex valorizado, auditoría y evento outbox.
- Secuencia monotónica de contabilización y saldos con cantidad física, reservada, valor y costo promedio por ítem/almacén.
- Lanzador `npm run test:sandbox` para evitar exclusivamente la consulta `net use` que Vite intenta ejecutar en este entorno restringido.
- Autenticación exclusivamente por nombre de usuario con Argon2, cookie segura, token con HMAC, expiración, revocación, bloqueo de intentos y cambio obligatorio de contraseña temporal.
- Duración máxima uniforme de sesión de 8 horas, sin opción de prolongación; las sesiones anteriores también se recortan al nuevo límite.
- RBAC alineado con la matriz aprobada y aislamiento de empresa obtenido desde la sesión.
- Endpoints de autenticación, Compras y autorización privada de Pusher protegidos en servidor.
- Dashboard protegido por sesión y navegación filtrada por permisos.
- Barra superior con nombre y `@usuario`, tipo de cambio USD vigente e histórico compacto de compra/venta; sincronización oficial desde SUNAT con respaldo e histórico BCRP.
- Acciones de creación ubicadas en el encabezado de sus respectivas tablas para mantener el contexto visual del módulo.
- Pantalla operativa de Compras conectada a API: listado, alta multilínea, presentaciones, lotes, cálculo de IGV/total y aprobación.
- Endpoint protegido de opciones de Compras para proveedores, almacenes, monedas y materias primas.
- Módulo operativo de Almacén: listado valorizado, disponibilidad, stock mínimo, alta de materias primas/mermas, proveedor y moneda de referencia, y configuración de lotes. El modal usa selectores registrados y Excel resuelve el proveedor por nombre y la moneda por código o nombre.
- Códigos de negocio autogenerados, inmutables y seguros ante concurrencia para Compras, Almacén (`MP`/`PT`), Recetas, Producción, Maquinaria, Pedidos, Pick & Pack, Proveedores y Clientes; los correlativos anuales se reinician por empresa y año, y los continuos no reutilizan números.
- Registro transaccional e idempotente de stock inicial con saldo global/por lote, promedio ponderado, auditoría, outbox y secuencia de contabilización.
- Kardex valorizado con filtros por ítem y almacén, lote, cantidades, costos, valor y saldo posterior a cada movimiento.
- Ítems de Almacén con código de producto del proveedor y costo de referencia opcional (precio neto, IGV y costo total calculado), administrables desde el modal y desde Excel sin afectar la valorización.
- La aprobación de compras valoriza el inventario con el IGV incluido en el costo unitario; el saldo inicial se registra con el costo total con IGV.
- Tasa de IGV configurable por empresa desde Catálogos → Configuración general, aplicada a compras (modal y Excel), costo de referencia de ítems e importaciones.
- El Excel de Compras ya no solicita la tasa de IGV por línea; los archivos anteriores con `IGV (%)` siguen siendo válidos y esa columna se ignora.
- La recepción de compras selecciona materias primas desde un modal con código del proveedor y precio de referencia, que precarga precio neto e IGV (editables) en la línea.
- Al aprobar una compra en la misma moneda de referencia del ítem, el ítem actualiza su precio neto y tasa de IGV con auditoría; si la moneda difiere, conserva la referencia anterior.
- Catálogos maestros conectados a Neon para proveedores, clientes, almacenes, unidades y monedas, con alta transaccional, auditoría y outbox.
- Permiso `catalogs.manage` separado de la lectura y asignado a los roles administrativos iniciales.
- Módulo operativo de Productos con modelos de calzado, tallas, colores y variantes SKU.
- Cada variante de producto crea y enlaza transaccionalmente su ítem terminado de Almacén; el catálogo muestra stock consolidado y cantidad de recetas vinculadas.
- Gestión operativa de imágenes de producto integrada con Cloudinary: carga JPEG/PNG/WebP de hasta 5 MB, validación de firma real, límite de 8 imágenes, portada automática y eliminación auditada.
- Las imágenes conservan en PostgreSQL el identificador público, URL segura, archivo, MIME, tamaño, autor, orden y fecha; carga y eliminación requieren `products.image_manage` y aislamiento por empresa.
- Módulo operativo de Recetas como fuente única de formulaciones, con borradores, versiones, rendimiento, ingredientes y destino Producción o Almacén.
- Activación transaccional de la última versión con auditoría y outbox; crear o activar una receta no genera movimientos de inventario.
- Las recetas con destino Producción abren una orden preseleccionada. Las recetas con destino Almacén descuentan ingredientes, registran kardex e ingresan el insumo elaborado con costo promedio y merma real.
- Flujo operativo de Producción: crear orden, reservar materiales, iniciar consumiendo inventario y completar ingresando producto terminado.
- Vista Kanban de Producción con tarjetas arrastrables, filtros por texto y máquina, columnas de estado y transiciones reales que respetan permisos, reservas, consumos y cierre con cantidad producida.
- Consumo de materias primas con costo promedio congelado y asignación FIFO automática de lotes; el costo real consumido se transfiere al producto terminado.
- Cada orden conserva la versión exacta de receta, ejecuciones, cantidades planificadas, consumidas y merma real informada al cierre, auditoría y eventos outbox.
- Documento de orden de producción en Excel y PDF A5, con un formato A5 en blanco descargable para llenar a mano.
- Módulo operativo de Pedidos con cliente, fechas, variantes SKU, cantidades, precios e importes.
- Confirmación transaccional de pedidos con reserva de producto terminado.
- Módulo Pick & Pack con correlativo, prioridad, picking, packing, ubicaciones, lotes, incidencias, paquetes, transportista y documento de salida.
- Flujo obligatorio `CONFIRMED → PICKING → PACKING → READY → DISPATCHED`; el despacho directo queda bloqueado.
- Formato A5 apaisado imprimible o guardable como PDF, sin firmas, con cabecera, detalle de productos, verificación, incidencias, paquetes y observaciones.
- Despacho valorizado de las cantidades realmente empacadas, liberación de diferencias reservadas, actualización del kardex, auditoría y notificaciones Pusher.
- Calendario operativo integrado con pedidos, producción, Pick & Pack, mantenimientos y eventos manuales; incluye agenda móvil, tablero arrastrable de tareas, filtros, vencimientos y recordatorios Pusher.
- Maquinaria rediseñada con indicadores compactos, búsqueda, filtros por tipo/estado, vista de tarjetas o tabla, paginación, edición, historial de mantenimiento y fichas versionadas e imprimibles de parámetros por estación, canal y zona térmica.
- Módulo operativo de Usuarios con alta, asignación de múltiples roles, contraseña temporal mínima de 6 caracteres y cambio obligatorio en el primer ingreso.
- Activación y desactivación segura de usuarios; al desactivar una cuenta se revocan de inmediato todas sus sesiones y se registra la operación en auditoría.
- Módulo operativo de Roles y Permisos con creación de roles personalizados y selección de permisos atómicos agrupados por módulo.
- Módulo de Auditoría reservado inicialmente a SUPERADMIN, con filtros por fechas, usuario, módulo y acción, detalle antes/después, IP y navegador cuando están disponibles, y exportación Excel con ocultamiento de secretos.
- Registro de inicios/cierres de sesión, ingresos a módulos con deduplicación, operaciones de negocio ya auditadas, cargas masivas y descargas de plantillas, reportes y órdenes de producción.
- Las operaciones administrativas de usuarios y roles están aisladas por empresa, protegidas en servidor y reservadas al `SUPERADMIN` según la matriz RBAC.
- Centro operativo de Excel para Compras, Almacén, Recetas, Productos y Pedidos.
- Plantillas y reportes se generan dinámicamente en `.xlsx` desde el servidor y comparten exactamente las mismas hojas y encabezados por módulo.
- Plantillas Excel con campos obligatorios y opcionales diferenciados visualmente y enumerados por hoja en `Instrucciones`.
- La hoja `Instrucciones` incluye un ejemplo de registro por cada campo de cada hoja.
- Validación previa de claves duplicadas dentro del libro: filas idénticas se omiten con advertencia y una misma clave con contenido diferente bloquea la carga.
- Descarga de reportes Excel por rango inclusivo de fechas, con periodo registrado en el nombre del archivo y en la hoja `Instrucciones`.
- Los reportes se reimportan en modo `ONLY_NEW`: agregan únicamente registros nuevos, omiten existentes sin sobrescribirlos e informan ambos conteos.
- Compras, Almacén, Recetas, Productos y Pedidos exponen plantilla, reporte por rango, validación y confirmación directamente en la vista del módulo.
- Validación previa de cargas masivas con control de formato, tamaño máximo de 5 MB, hojas, encabezados, campos obligatorios, muestra de resultados e historial por empresa.
- Cada validación crea un `ImportJob`, conserva hasta 200 errores detallados y registra la operación en auditoría sin modificar datos de negocio.
- Confirmación transaccional e idempotente de Excel para Compras, Almacén, Recetas, Productos y Pedidos; cualquier error revierte el archivo completo.
- La validación previa rechaza valores no numéricos en campos numéricos y trata `-`, `—` y `N/A` como celdas vacías.
- Las rutas de validación y confirmación de importaciones responden siempre JSON; los errores no controlados se registran en el servidor y devuelven un mensaje estable en lugar de un 500 vacío.
- La confirmación exige el mismo archivo validado mediante huella SHA-256, bloquea reintentos concurrentes y limita cada libro a 1,000 filas.
- Compras y Pedidos importados quedan en borrador. En los módulos con código autogenerado, un código vacío crea un registro nuevo y un código informado identifica uno existente según el modo de importación; no existe columna `accion`.
- `Resumen` fue reemplazado por `Analítica`, con KPIs, estados por módulo, inventario valorizado, alertas de stock, pedidos vencidos/próximos y productos más solicitados.
- Analítica incorpora gráficos interactivos con Recharts: actividad diaria, estados por módulo, inventario valorizado por tipo y almacén, productos más pedidos y materiales más consumidos en producción, adaptados a modo claro/oscuro y móvil.
- Etiquetas de formularios acortadas con tooltips explicativos para mantener alineados los controles en los modales.
- Las tablas de los módulos muestran 8 registros por página por defecto, con selector de tamaño; el kardex conserva 30. En escritorio las cabeceras permanecen fijas bajo la barra superior al desplazarse.
- Las tablas principales incluyen búsqueda por texto y los selectores de datos maestros permiten escribir para filtrar. El tipo de presentación de Compras usa una lista estándar (SACO, BOLSA, BOTELLA, CAJA, BIDÓN, CILINDRO, ROLLO, FARDO).
- La carga masiva permite elegir entre “Solo nuevos” y “Crear o actualizar” después de validar; en modo actualización se aplican los campos modificados de Almacén, Productos y Recetas, mientras Compras y Pedidos siguen sin sobrescribir registros existentes.
- Las materias primas admiten una imagen de referencia en Cloudinary, administrable desde el modal de Almacén con el permiso `inventory.image_manage`.
- El ítem registra su sector/almacén de referencia: obligatorio para materia prima, visible en la tabla y en Excel, y preseleccionado al registrar el saldo inicial.
- Las compras registradas permiten enviar la solicitud al proveedor por WhatsApp con materiales, códigos, presentaciones, cantidades y la imagen del material cuando existe.
- Acciones de cabecera reorganizadas y comportamiento móvil mejorado para botones, filtros, tablas y modales Excel.
- Modo oscuro global y persistente disponible desde el login, el cambio de contraseña y el dashboard.
- Procesador de outbox para Pusher con reclamo concurrente, hasta 5 intentos, backoff exponencial, registro del último error y payload deduplicable mediante `eventId`.
- Centro de notificaciones persistente en el encabezado: contador de no leídas, marcado individual/masivo, avisos emergentes y refresco automático de consultas por dominio.
- Publicación en canales privados por empresa y dominio, autorizados según permisos; procesamiento oportunista cada 15 segundos mientras el dashboard está activo y endpoint adicional protegido con `WORKER_SECRET` para ejecución programada.
- Suite de integración ejecutada contra ramas Neon temporales: 5 escenarios para rollback de compra inválida, idempotencia de stock inicial, aprobación concurrente sin doble contabilización, autenticación/bloqueo/cambio de contraseña y flujo completo Producción-Pedidos.
- Producción validada de extremo a extremo con reserva, consumo valorizado, liberación de reserva e ingreso de producto terminado; Pedidos validado con reserva, despacho y protección ante reintentos duplicados.
- Producción admite consolidar varias órdenes de pedido mediante una relación normalizada; el A5 actualizado muestra fecha de emisión en cabecera, mayor espacio en componentes y las columnas `TOTAL` y `TOTAL ESPERADO`.
- El A5 de producción (con datos, en blanco y continuación) usa letra mayor en las celdas de contenido sin agrandar cabeceras, filas más amplias para escribir y observaciones de una sola línea; el Excel A5 aplica el mismo criterio.
- Logos/marcas por cliente registrados en Catálogos (solo nombre) y seleccionables al crear la orden desde el cliente de los pedidos vinculados, con autocompletado editable del campo Logo / marca.
- Lógica comprobable de credenciales y cambio de contraseña separada de la sesión/cookies de Next.js, manteniendo sin cambios el contrato de las rutas web.
- Compatibilidad corregida con el adaptador HTTP de Neon para bloqueos consultivos PostgreSQL y mapeo explícito de saldos sin campos calculados ajenos al modelo.
- Verificación visual local aprobada para el login y la redirección de visitantes anónimos.
- TypeScript, ESLint y build de producción aprobados.

## Pendiente inmediato

1. Cambiar las contraseñas temporales de las dos cuentas iniciales en su primer acceso.
2. Ejecutar `neon skills -y` desde una terminal normal.
3. Configurar `WORKER_SECRET` y un programador externo para procesar alertas aun cuando no haya usuarios conectados.
4. Ejecutar Playwright en un entorno que permita crear procesos; este sandbox bloquea sus workers con `spawn EPERM`.
5. Preparar datos UAT y ejecutar una ronda funcional con usuarios de negocio para Compras, Almacén, Recetas, Producción, Productos, Pedidos y Pick & Pack.
6. Aplicar la migración `20261020235000_customer_brands` en Neon antes de desplegar los logos/marcas por cliente.

Nunca versionar `.env.local`, credenciales de Neon ni secretos de Pusher.
