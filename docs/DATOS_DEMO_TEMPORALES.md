# Datos temporales para presentaciones

La demostración se carga en una empresa aislada llamada **LK INNOVACION · DEMO**. No se mezcla con la empresa real ni con los usuarios `gmedina` y `lccama`.

## Cargar o reiniciar la demostración

```bash
npm run demo:seed
```

El comando elimina una demostración anterior y vuelve a crear un escenario coherente. Puede ejecutarse varias veces sin duplicar datos y nunca elimina información de la empresa operativa.

El escenario incluye:

- 17 materias primas, 5 mermas recuperables y 8 variantes de producto terminado.
- Códigos con el formato autogenerado del sistema (`MP-`, `MER-`, `PROD-`, `CMP-AAAA-`, `OP-AAAA-`, `PED-AAAA-` y `PP-AAAA-`).
- SKU reales por matriz, color y talla, incluidos los bicolor, por ejemplo `I0034-NEG-ROJ-39`.
- Compras aprobada, pendiente y rechazada. Solo la aprobada alimenta existencias y kardex.
- Ajuste aprobado de pesaje para mostrar existencias de merma.
- Formulaciones C1 negra, C2 roja e industrial, cada una con rendimiento manual en pares.
- Órdenes de producción en pendiente, material liberado, en curso y finalizada.
- Una orden finalizada de tres tallas con salidas separadas por SKU.
- Una orden bicolor C1/C2 vinculada a un pedido, con tres tallas, turnos y componentes integrados.
- Prensa, inyectora y mezclador, con mantenimientos vigente, vencido y reparación.
- Pedidos en borrador, confirmado, en producción, listo y despachado.
- Pick & Pack en picking, packing, listo y despachado, sin campos de firmas.
- Una importación Excel satisfactoria y otra con una fila repetida omitida.
- Calendario, alertas de stock, vencimiento de mantenimiento y fechas de entrega.
- Usuarios y sesiones de ejemplo, incluida una sesión activa que puede revocarse y otra cerrada.

Credenciales predeterminadas:

- Usuario: `demo`
- Contraseña: `Demo123!`

Se pueden reemplazar solo para la ejecución actual mediante `DEMO_USERNAME` y `DEMO_PASSWORD`.

## Eliminar la demostración

```bash
npm run demo:cleanup
```

La limpieza busca simultáneamente el nombre y el identificador fiscal reservados para la empresa demo. Después elimina únicamente esa empresa y sus relaciones en cascada.

## Recomendaciones

- Usar el usuario `demo` durante la presentación para mantener separados los datos reales.
- Ejecutar `npm run demo:cleanup` antes de iniciar la carga operativa de la empresa.
- Volver a ejecutar `npm run demo:seed` antes de cada presentación para recuperar el escenario inicial.

## Recorrido sugerido para la presentación

1. Abrir **Panel de control** para enseñar alertas, compras, pedidos y producción.
2. En **Compras**, comparar la compra aprobada con las pendientes y rechazadas.
3. En **Almacén / Kardex**, revisar el ingreso de compra, el pesaje de merma, los consumos de producción, las salidas terminadas y el despacho.
4. En **Productos**, mostrar el código de matriz `I0034` y los SKU mono y bicolor por talla.
5. En **Recetas**, comparar C1 y C2 y explicar el rendimiento manual por pares.
6. En **Producción**, abrir `OP-AAAA-000001` para ver la curva terminada y `OP-AAAA-000002` para ver el pedido vinculado, C1/C2, componentes y turnos parciales.
7. En **Pedidos**, seguir los distintos estados y luego abrir **Pick & Pack** para enseñar picking, packing, listo e histórico despachado.
8. Cerrar con **Maquinaria**, **Calendario**, **Importaciones** y **Sesiones**.
