# Neon y Pusher

## Política de credenciales

Este repositorio solo documenta identificadores públicos o no secretos:

- Neon project ID: `weathered-frost-40313859`.
- Neon branch: `production`.
- Pusher public key: `c55042af873c4de8a311`.
- Pusher cluster: `sa1`.

No se versionan `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, tokens de Neon, `PUSHER_APP_ID`, `PUSHER_SECRET` ni otras credenciales privadas. Deben mantenerse en `.env.local` y en el gestor de secretos del ambiente de despliegue.

## Configuración de Neon

### Estado de configuración — 19/10/2026

| Elemento | Estado |
|---|---|
| Neon CLI 8.4.3 | Instalado |
| Autenticación OAuth | Completada; credenciales guardadas en `.neon-config/` ignorado por Git |
| Proyecto y branch | Vinculados mediante `.neon` |
| Variables Neon | Descargadas a `.env.local`, ignorado por Git |
| `@neon/config` y `@neon/env` | Instalados |
| `neon.ts` | Creado con la política aprobada |
| Neon MCP | Instalado en `.codex/config.toml`, OAuth y limitado al proyecto |
| `neon deploy` | Ejecutado; branch `production` coincide con la política |
| Esquema Prisma | Validado; historial versionado en `prisma/migrations/` |
| Aplicación de migraciones | Aplicadas en Neon `production` hasta `20261019160000_inventory_supplier_currency` mediante `npm run db:deploy-neon` |
| Neon agent skills | Pendiente: el sandbox impidió el subproceso `npx`; ejecutar `neon skills -y` en una terminal normal |

Ejecutar desde la raíz del proyecto:

```powershell
npm i -g neon@latest
neon login
neon skills -y
neon mcp -y
neon link --project-id weathered-frost-40313859 --branch production -y
neon config init
neon deploy
```

`neon.ts` debe contener:

```ts
import { defineConfig } from "@neon/config/v1";

export default defineConfig({});
```

Después de vincular Neon, copiar las cadenas de conexión en `.env.local`:

```dotenv
DATABASE_URL="postgresql://...pooler.../neondb?sslmode=require"
DATABASE_URL_UNPOOLED="postgresql://.../neondb?sslmode=require"
```

La URL agrupada se usa para la aplicación y `DATABASE_URL_UNPOOLED` para migraciones Prisma. Nunca copiar estos valores a documentación, incidencias, commits o capturas.

## Configuración de Pusher

Variables públicas:

```dotenv
NEXT_PUBLIC_PUSHER_KEY="c55042af873c4de8a311"
NEXT_PUBLIC_PUSHER_CLUSTER="sa1"
```

Variables exclusivas del servidor:

```dotenv
PUSHER_APP_ID=""
PUSHER_KEY="c55042af873c4de8a311"
PUSHER_SECRET=""
PUSHER_CLUSTER="sa1"
```

La clave pública identifica la aplicación pero no permite publicar eventos. El secreto de Pusher nunca debe aparecer en código del navegador.

### Prueba aislada recibida

Este ejemplo sirve únicamente para verificar recepción manual. No forma parte de la interfaz productiva, usa un canal público y habilita logs del navegador.

```html
<!DOCTYPE html>
<head>
  <title>Pusher Test</title>
  <script src="https://js.pusher.com/8.4.0/pusher.min.js"></script>
  <script>
    // Solo desarrollo. No habilitar logging en producción.
    Pusher.logToConsole = true;

    const pusher = new Pusher("c55042af873c4de8a311", {
      cluster: "sa1",
    });

    const channel = pusher.subscribe("my-channel");
    channel.bind("my-event", function (data) {
      alert(JSON.stringify(data));
    });
  </script>
</head>
<body>
  <h1>Pusher Test</h1>
  <p>Publicar un evento en <code>my-channel</code> con nombre <code>my-event</code>.</p>
</body>
```

La aplicación real utiliza `pusher-js`, canales privados `private-company-{companyId}-{dominio}` y eventos versionados. El backend autoriza cada suscripción según empresa y permiso de lectura del dominio, y publica mediante outbox después de confirmar la transacción PostgreSQL. Las credenciales están configuradas únicamente en `.env.local`; nunca deben copiarse al repositorio.

El dashboard procesa eventos pendientes cada 15 segundos mientras existe una sesión activa. Para garantizar despacho continuo en producción, configurar un secreto aleatorio de al menos 32 bytes en `WORKER_SECRET` y programar un `POST /api/v1/workers/outbox` con `Authorization: Bearer <WORKER_SECRET>`. El procesador realiza hasta cinco intentos con backoff exponencial y conserva el último error.
