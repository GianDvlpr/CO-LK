# Persistencia

El gate de fase 0 fue aprobado el 13/10/2026. El esquema de dominio y la migración inicial ya están definidos; toda modificación posterior debe entregarse mediante una nueva migración revisada.

Convenciones posteriores al gate:

- UUID en entidades de negocio.
- Propiedades TypeScript `camelCase`; tablas y columnas PostgreSQL `snake_case` mediante `@map`/`@@map`.
- `companyId`, auditoría e índices únicos explícitos.
- `Decimal`, nunca `Float`, para cantidades y dinero.
- `prisma migrate deploy` en staging/producción; nunca `db push`.
- `.env.local` se carga desde `prisma.config.ts`; sus secretos no se versionan.
- La primera migración es `20261013150000_initial_domain`.
- El índice compuesto de `StockBalance` usa `NULLS NOT DISTINCT` (PostgreSQL 15+) para garantizar un único saldo global cuando `lotId` es nulo.
- Los movimientos se ordenan por `postedAt` y `postingSequence`; `occurredAt` conserva la fecha física sin reescribir el costo histórico.
