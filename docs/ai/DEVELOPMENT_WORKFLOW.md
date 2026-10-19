# Flujo de desarrollo y entrega

Actualizado: 19/10/2026.

## 1. Antes de cambiar código

1. Leer `AGENTS.md`, `PROJECT_CONTEXT.md` y `DOMAIN_RULES.md`.
2. Ejecutar `git status --short`.
3. Revisar el código, pruebas y migraciones del módulo afectado.
4. Identificar si el cambio toca stock, costos, permisos, sesiones, importaciones o esquema; esos cambios requieren validación reforzada.
5. No descartar ni sobrescribir cambios no relacionados que ya estén en el worktree.

## 2. Implementación esperada

### Backend

- Route Handler pequeño: seguridad, Zod, llamada al caso de uso y traducción de errores.
- Regla reusable o transaccional: `src/modules/<modulo>/domain` o `application`.
- Consultas siempre aisladas por empresa.
- Estados y referencias validados dentro de la transacción cuando exista riesgo de concurrencia.
- Para stock o correlativos, conservar los bloqueos PostgreSQL existentes.
- Auditoría y outbox deben confirmar o revertir junto con la operación.
- Errores de dominio con código estable, no mensajes genéricos de Prisma.

### Frontend

- Componentes cliente consumen `/api/v1` y muestran mensajes en español.
- TanStack Query controla lectura, mutaciones e invalidación.
- Los permisos ocultan acciones, pero el servidor siempre vuelve a autorizarlas.
- Botón principal “Nuevo” en el encabezado de la tabla o tarjeta del módulo.
- Descripciones largas dentro del tooltip de `ModuleHeadingIntro`, no ocupando altura permanente.
- Formularios y modales deben funcionar en móvil y modo oscuro.
- Tablas usan el componente responsive compartido. Evitar columnas fijas en móvil, `white-space: nowrap` global y textos sin `overflow-wrap`.
- Acciones táctiles deben tener alternativa a arrastrar.

### Excel y reportes

Si cambia una columna:

1. Actualizar `workbookSpecs`.
2. Actualizar etiquetas, explicaciones, ejemplos y listas desplegables.
3. Actualizar validación y confirmación de importación.
4. Actualizar exportación para mantener exactamente el mismo orden.
5. Actualizar pruebas de workbook.
6. Actualizar la Guía y documentación aplicable.

## 3. Cambios de base de datos

1. Modificar `prisma/schema.prisma`.
2. Crear un nuevo directorio `prisma/migrations/<timestamp>_<descripcion>/migration.sql`.
3. No cambiar migraciones ya aplicadas.
4. Revisar impacto sobre datos existentes y agregar valores por defecto o backfill explícito.
5. Ejecutar:

```powershell
npm run db:validate
npm run db:generate
npm run typecheck
```

6. Probar la migración en una rama o base de prueba.
7. Aplicar a Neon `production` solo cuando el usuario haya autorizado el cambio y exista una copia/estrategia de reversión proporcional al riesgo.

Nunca ejecutar `prisma migrate reset`, `DROP SCHEMA`, truncados o borrado masivo sobre producción por conveniencia de desarrollo.

## 4. Pruebas

### Unitarias

```powershell
npm run test:sandbox
```

Usar `npm test` en entornos donde Vite pueda crear procesos normalmente. En el sandbox Windows actual, el preload evita el `spawn EPERM` causado por detección de rutas de red.

Agregar pruebas cuando cambie:

- cálculo decimal;
- transición de estado;
- código o SKU;
- validación Zod o política de seguridad;
- plantilla/importación Excel;
- generación Excel/PDF;
- mapeo de un proveedor externo.

### Integración

Usar únicamente una rama Neon cuyo nombre empiece por `codex-integration-`:

```powershell
$env:INTEGRATION_DATABASE_URL = "postgresql://...rama-temporal..."
$env:INTEGRATION_BRANCH_NAME = "codex-integration-AAAAMMDD"
npm run test:integration:sandbox
```

La suite debe rechazar la URL productiva. Eliminar la rama temporal al terminar.

### E2E y revisión visual

- Playwright espera `http://127.0.0.1:3000`.
- Verificar al menos escritorio y un viewport móvil.
- Revisar login, ruta protegida, modo oscuro, modal afectado, tabla y estados vacíos/error/carga.
- Si el sandbox bloquea workers, realizar las demás comprobaciones y dejar constancia de la limitación.

## 5. Checklist de cierre

Para un cambio de aplicación completo:

```powershell
npm run db:validate
npm run db:generate
npm run typecheck
npm run test:sandbox
npm run lint
npm run build
```

Después confirmar:

- no se añadieron secretos;
- no se editaron migraciones históricas;
- no se rompió aislamiento por empresa;
- permisos de UI y API coinciden;
- auditoría/outbox acompañan escrituras relevantes;
- formatos Excel y exportación siguen alineados;
- Guía y `docs/implementation-status.md` reflejan el comportamiento nuevo;
- `git diff` contiene únicamente cambios intencionales.

## 6. Git y entrega

- No hacer reset destructivo ni limpiar archivos ajenos.
- No generar commits, push o despliegues salvo que el usuario lo solicite o sea parte explícita del flujo acordado.
- Resumir archivos y comportamiento modificados.
- Informar migraciones aplicadas, datos modificados y comprobaciones ejecutadas.
- Nunca afirmar que una prueba pasó si no se ejecutó.

## 7. Datos demo

- `npm run demo:seed` elimina y recrea solo la empresa demo identificada por nombre y RUC técnico.
- `npm run demo:cleanup` elimina solo esa empresa demo.
- Mantener los datos alineados con el negocio de suelas: PVC, PVC expanso, TR, caucho, EVA, PU, ácido esteárico, óxido de zinc, pigmentos, cargas, componentes, tallas y colores.
- La demo debe mostrar el flujo completo: compra aprobada, existencias, recetas activas, producción en varios estados, merma real en una orden finalizada, pedidos, Pick & Pack, maquinaria, mantenimientos, calendario y alertas.

## 8. Despliegue y operación

- La aplicación usa Neon `production`; el project ID público está documentado en `docs/integrations/neon-and-pusher.md`.
- Configurar secretos en el ambiente de despliegue, nunca en Git.
- Ejecutar migraciones antes de servir código que dependa de columnas nuevas.
- Configurar una llamada periódica autenticada a `POST /api/v1/workers/outbox` para alertas sin usuarios conectados.
- Verificar `/api/v1/health` después del despliegue.

