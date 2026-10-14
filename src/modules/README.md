# Módulos de negocio

Cada módulo se incorporará con esta estructura después del gate funcional:

```text
<module>/
  domain/          entidades, reglas, estados y errores puros
  application/     casos de uso, permisos y límites transaccionales
  infrastructure/  repositorios Prisma y adaptadores externos
```

`domain` no importa React, Next.js ni Prisma. Un módulo no consulta directamente las tablas de otro: usa un caso de uso o servicio de aplicación público. La UI vive en `src/components/<module>`.

Módulos previstos: `purchases`, `inventory`, `recipes`, `production`, `products`, `orders`, `users` y `access-control`.
