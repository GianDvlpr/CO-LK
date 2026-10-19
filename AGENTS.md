# Instrucciones para agentes de IA

Este archivo es el punto de entrada obligatorio para cualquier IA que trabaje en LK INNOVACION.

## Lectura inicial obligatoria

Antes de modificar código, leer en este orden:

1. `docs/ai/PROJECT_CONTEXT.md`
2. `docs/ai/DOMAIN_RULES.md`
3. `docs/ai/DEVELOPMENT_WORKFLOW.md`
4. Los archivos del módulo que se va a cambiar.

No se necesita consultar el proyecto hermano Kalendar. Este repositorio debe entenderse y mantenerse de forma autónoma.

## Orden de autoridad

Cuando dos fuentes discrepen, usar este orden:

1. Solicitud actual del usuario.
2. `prisma/schema.prisma`, migraciones, servicios de aplicación y pruebas vigentes.
3. Este archivo y `docs/ai/*`.
4. Documentación funcional de `docs/`.
5. Documentos históricos de `docs/phase-0/` y `Plan_de_trabajo_LK_INNOVACION.md`.

Los documentos de fase 0 explican decisiones originales, pero pueden contener estados o nombres que ya evolucionaron.

## Reglas de trabajo

- Preservar cambios existentes del usuario. Antes de editar, ejecutar `git status --short` y revisar los archivos que se tocarán.
- No guardar, imprimir ni documentar secretos. Nunca versionar `.env.local`, URLs reales de base de datos, contraseñas, tokens o claves privadas.
- Usar Node.js 24 y npm 11. No cambiar de gestor de paquetes.
- Mantener TypeScript estricto, App Router y la arquitectura de monolito modular existente.
- Toda escritura HTTP debe validar sesión, permiso, origen y cuerpo antes de ejecutar el caso de uso.
- Obtener `companyId` y `userId` desde la sesión; jamás confiar en esos valores si vienen del cliente.
- Las operaciones que cambian stock, reservas, costos o estados deben ser transaccionales y registrar auditoría/outbox cuando corresponda.
- Usar `Decimal` para cantidades, dinero, costos, impuestos y rendimientos. No hacer cálculos de negocio con `number` cuando pueda producir errores de precisión.
- No editar migraciones ya aplicadas. Crear una migración nueva y reversible cuando cambie el esquema.
- No ejecutar `migrate reset`, truncados ni limpiezas sobre Neon `production` sin autorización explícita.
- Los códigos de negocio son autogenerados en servidor. No volver a pedirlos al crear registros.
- La interfaz y los mensajes al usuario están en español.
- Mantener accesibilidad, modo oscuro y comportamiento móvil. Las tablas deben permitir desplazamiento horizontal sin fijar columnas que oculten contenido en pantallas pequeñas.
- Plantillas y reportes Excel de un módulo deben compartir formato. Una fila sin código crea; una fila con código identifica un registro existente según el modo de importación.
- No reintroducir merma estimada en Recetas. La receta contiene cantidades estándar; la merma real se registra por material al finalizar Producción.

## Validación mínima

Después de un cambio relevante ejecutar, según alcance:

```powershell
npm run db:validate
npm run db:generate
npm run typecheck
npm run test:sandbox
npm run lint
npm run build
```

En este entorno Windows, `npm test` puede fallar con `spawn EPERM`; usar `npm run test:sandbox`. Las pruebas de integración necesitan una rama Neon temporal y nunca deben apuntar a `production`.

Si una comprobación no puede ejecutarse, comunicar exactamente cuál faltó y por qué.

