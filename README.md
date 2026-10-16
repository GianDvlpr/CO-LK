# LK INNOVACION

Webapp interna para gestionar compras, almacén/kardex, recetas, producción, productos, usuarios, permisos y pedidos para una operación de calzado.

## Estado actual

El repositorio contiene la fundación técnica ejecutable:

- Next.js 16 + React 19 + TypeScript estricto.
- Ant Design, TanStack Query y Zustand.
- Prisma con el modelo inicial de negocio validado y migración SQL reproducible.
- Estructura modular, API v1, health check y shell responsive.
- Vitest, Playwright, ESLint y pipeline CI.
- Registro de decisiones y gate de fase 0.
- Proyecto Neon `weathered-frost-40313859` vinculado al branch `production`.
- Neon y Pusher configurados localmente mediante variables ignoradas por Git.
- Consulta de RUC para proveedores y clientes mediante APIS.NET.PE, con datos del padrón reducido de SUNAT.
- Roles iniciales `SUPERADMIN` y `ADMIN`, acceso exclusivamente por nombre de usuario y cambio obligatorio de contraseña temporal.

El gate funcional fue aprobado el 13/10/2026. La migración inicial de `prisma/migrations/20261013150000_initial_domain` ya fue aplicada en la rama Neon `production`.

El paquete de revisión está en `docs/phase-0` e incluye propuesta de decisiones,
procesos, RBAC, contrato API, modelo preliminar y backlog. Las cinco plantillas Excel
están en `docs/phase-0/excel-templates` y también pueden descargarse desde
`/dashboard/imports` mientras la aplicación está en ejecución.

## Requisitos

- Node.js 24.x.
- npm 11.x.
- PostgreSQL/Neon para las fases con persistencia.

## Puesta en marcha

```bash
npm ci
copy .env.example .env.local
npm run dev
```

Abrir `http://localhost:3000`. Neon, Pusher y Cloudinary están configurados en el ambiente local mediante variables ignoradas por Git.

## Comandos

| Comando | Uso |
|---|---|
| `npm run dev` | Desarrollo local |
| `npm run build` | Build de producción |
| `npm run lint` | Reglas ESLint/Next.js |
| `npm run typecheck` | Validación TypeScript |
| `npm test` | Pruebas unitarias |
| `npm run test:integration:sandbox` | Integración, rollback y concurrencia contra una rama Neon temporal |
| `npm run test:e2e` | Flujos Playwright |
| `npm run db:generate` | Generar Prisma Client |
| `npm run db:migrate` | Crear migración local después del gate |
| `npm run db:deploy` | Aplicar migraciones aprobadas |
| `npm run db:bootstrap-neon` | Aplicar la migración inicial por Neon HTTP en un entorno Windows restringido |
| `npm run db:seed-neon` | Sembrar catálogos, roles y cuentas iniciales usando el adaptador Neon |

## Estructura

```text
src/
  app/                  rutas, layouts y API v1
  components/           interfaz por módulo y componentes comunes
  lib/                  configuración e integraciones compartidas
  modules/              dominio, aplicación e infraestructura
  stores/               estado efímero de interfaz
prisma/                 esquema, migraciones y seed
tests/                  pruebas unitarias, integración y E2E
docs/                   arquitectura y decisiones funcionales
```

El flujo obligatorio de una operación es:

```text
request → sesión → permiso → Zod → servicio de aplicación
        → transacción Prisma → auditoría/outbox → respuesta JSON
        → invalidación de React Query → actualización de interfaz
```

## Documentos de referencia

- `Plan_de_trabajo_LK_INNOVACION.md`: alcance, reglas y cronograma.
- `docs/phase-0/decision-log.md`: gate que habilita el modelo de datos.
- `docs/phase-0/decision-proposal.md`: valores recomendados para revisión funcional.
- `docs/phase-0/excel-templates/`: formatos preliminares de carga masiva y reporte.
- `docs/integrations/neon-and-pusher.md`: vinculación, variables y reglas de seguridad.
- `docs/integrations/sunat-ruc.md`: configuración y límites del autocompletado por RUC.
- `docs/security/authentication-and-rbac.md`: sesiones, permisos y puesta en marcha segura.
- `docs/architecture/0001-modular-monolith.md`: primera decisión de arquitectura.

## Seguridad

No guardar secretos en Git. Las contraseñas usarán Argon2id y las sesiones guardarán únicamente HMAC del token opaco. Todos los permisos se validarán nuevamente en los casos de uso del servidor.
