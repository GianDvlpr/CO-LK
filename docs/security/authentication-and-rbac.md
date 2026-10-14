# Autenticación y RBAC

## Sesiones

- Contraseñas almacenadas con Argon2; nunca se guardan ni registran en texto plano.
- El navegador recibe un token aleatorio en una cookie `HttpOnly`, `SameSite=Lax`, `Path=/` y `Secure` en producción.
- PostgreSQL conserva únicamente un HMAC SHA-256 del token usando `SESSION_SECRET`.
- La sesión normal vence en 12 horas; “mantener sesión” vence en 30 días.
- Usuarios inactivos, bloqueados o sesiones vencidas no pueden autenticarse.
- Los endpoints de escritura validan el encabezado `Origin` para reducir riesgo CSRF.
- El inicio de sesión acepta únicamente el nombre de usuario. El correo no se solicita al crear cuentas operativas ni funciona como credencial.
- Cinco credenciales fallidas dentro de 15 minutos bloquean temporalmente la combinación identificador/IP.
- Las cuentas de arranque exigen cambiar la contraseña temporal antes de acceder al dashboard.
- Toda cuenta creada desde Administración recibe una contraseña temporal de al menos 6 caracteres y queda marcada para cambio obligatorio.
- Desactivar una cuenta revoca todas sus sesiones activas dentro de la misma transacción.

## Autorización

- `companyId` y `userId` provienen exclusivamente de la sesión, nunca del cuerpo de una solicitud.
- Cada endpoint comprueba un permiso atómico de `docs/phase-0/rbac-matrix.md`.
- Ocultar un módulo del menú mejora la experiencia, pero la autorización efectiva siempre ocurre en el servidor.
- Pusher solo autoriza el canal `private-company-{companyId}` correspondiente a la sesión.
- `users.read`, `users.create` y `users.deactivate` protegen la administración de cuentas; `roles.read` y `roles.manage` protegen la matriz de acceso.
- Los roles personalizados solo pueden recibir permisos pertenecientes a la misma empresa del administrador autenticado.
- Un usuario no puede desactivar su propia cuenta desde la administración.

## Puesta en marcha

1. Generar un secreto de al menos 32 caracteres y guardarlo únicamente en `.env.local` como `SESSION_SECRET`.
2. Aplicar migraciones ordinarias con `npm run db:deploy`; para el arranque inicial en un sandbox Windows puede usarse `npm run db:bootstrap-neon`.
3. Definir temporalmente `SEED_SUPERADMIN_USERNAME`, `SEED_SUPERADMIN_PASSWORD` y las variables equivalentes `SEED_ADMIN_*`.
4. Ejecutar `npm run db:seed-neon` y retirar las variables de bootstrap del ambiente cuando termine.
5. Probar inicio/cierre de sesión y permisos con una rama Neon de pruebas antes de producción.

`SUPERADMIN` recibe todos los permisos. `ADMIN` administra la operación, pero no usuarios, roles ni auditoría completa. Las contraseñas de bootstrap pueden ser temporales porque el sistema fuerza su reemplazo inmediato por una de al menos 6 caracteres; nunca deben versionarse ni documentarse.

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

No colocar el resultado en documentación, Git, tickets ni capturas.
