# Propuesta de decisiones funcionales — Fase 0

Estado: **aprobado el 13/10/2026** por el dueño del producto. Los cambios posteriores deben registrarse en `decision-log.md`.

| ID | Propuesta recomendada | Validación requerida |
|---|---|---|
| F0-01 | El precio ingresado es neto por unidad base; IGV configurable con 18% inicial; redondeo tributario por línea; inventario sin IGV recuperable; promedio ponderado móvil en PEN. | Contabilidad y dueño del producto |
| F0-02 | Unidad base por ítem (`KG`, `L`, `M`, `UND`, `PAR`); conversiones explícitas; sin conversión L↔KG sin densidad; lotes `NONE/OPTIONAL/REQUIRED`; FIFO operativo. | Almacén y Producción |
| F0-03 | Recetas versionadas; rendimiento expresado en pares o unidades; reserva al liberar; consumo al iniciar; merma y consumos adicionales como movimientos separados; una terminación por orden. | Producción |
| F0-04 | Pedido significa orden de venta a cliente; reserva producto disponible y genera faltante para producción; despacho total en el MVP. | Comercial y Operaciones |
| F0-05 | Recepciones parciales como registros de compra separados; sin producción ni despacho parcial en el MVP. | Operaciones |
| F0-06 | Cinco plantillas versionadas; hasta 1,000 filas; previsualización obligatoria; Compras y Pedidos solo crean borradores; Ítems, Productos y Recetas admiten crear/actualizar. | Producto y TI |
| F0-07 | Roles base: Administrador, Compras, Almacén, Producción, Ventas, Aprobador y Consulta; segregación entre solicitar y aprobar ajustes de valor. | Gerencia |
| F0-08 | Sin migración histórica en el MVP; solo saldos iniciales auditados mediante plantilla de Almacén. | Producto y TI |
| F0-09 | Monolito modular, API `/api/v1`, UUID, `companyId`, nombres físicos `snake_case`, kardex inmutable y borrado lógico donde corresponda. | Líder técnico y producto |
| F0-10 | Desarrollo local, preview y CI por cada cambio; migraciones revisadas; ambientes local, preview y producción; pruebas unitarias, integración, E2E y concurrencia. | Producto y líder técnico |

## Casos de ejemplo para validación

### Compra

- 25 sacos × 20 kg = 500 kg.
- Precio neto: PEN 4.00/kg.
- Subtotal: PEN 2,000.00.
- IGV 18%: PEN 360.00.
- Total: PEN 2,360.00.
- Costo que ingresa a inventario: PEN 4.00/kg, sin IGV recuperable.

### Producción

- Una receta rinde 10 pares.
- Una orden por 50 pares requiere 5 ejecuciones de receta.
- Al liberar se reserva el material calculado.
- Al iniciar se consume el material reservado.
- Al completar se registra una sola entrada de 50 pares, o las unidades buenas reales.

### Pedido

- Pedido por 40 pares; stock disponible 25.
- Se reservan 25 y se registra faltante de 15.
- El pedido pasa a producción hasta completar el faltante.
- Solo se despacha cuando las 40 unidades están disponibles.

## Cierre

Para aprobar una fila se debe registrar en `decision-log.md`: alternativa elegida, responsable, fecha y evidencia. Un cambio posterior debe identificar las historias, tablas, endpoints y pruebas afectadas.
