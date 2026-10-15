# Datos temporales para presentaciones

La demostración se carga en una empresa aislada llamada **LK INNOVACION · DEMO**. No se mezcla con la empresa real ni con los usuarios `gmedina` y `lccama`.

## Cargar o reiniciar la demostración

```bash
npm run demo:seed
```

El comando elimina una demostración anterior y vuelve a crear un escenario coherente con proveedores, compras, stock, kardex, productos, recetas, órdenes de producción, máquinas, mantenimientos, clientes, pedidos, Pick & Pack, calendario y notificaciones. Puede ejecutarse varias veces sin duplicar datos.

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
- No convertir registros `DEMO-` en operaciones reales.
- Ejecutar `npm run demo:cleanup` antes de iniciar la carga operativa de la empresa.
- Volver a ejecutar `npm run demo:seed` antes de cada presentación para recuperar el escenario inicial.
