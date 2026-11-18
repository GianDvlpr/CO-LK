# Facturación electrónica SUNAT

Esta integración conecta LKINNOVA con la API de facturación mediante el servidor. Las credenciales nunca se envían al navegador. La URL actual puede ser local y luego cambiarse sin modificar código.

## Alcance

- Facturas y boletas desde **Ventas**.
- Notas de crédito y débito.
- Guías de remisión remitente y transportista.
- Retenciones y percepciones.
- Liquidaciones de compra.
- Resúmenes diarios, comunicaciones de baja y reversiones.
- Consulta de estado y descarga de PDF, XML y CDR cuando la API los tenga disponibles.

La factura usa la serie `F004`. El correlativo lo asigna la API de facturación. Las demás series deben existir primero en la plataforma SUNAT y configurarse solo cuando se vayan a utilizar.

## 1. Requisitos

- Node.js 24 y npm 11.
- Base de datos PostgreSQL/Neon configurada para LKINNOVA.
- La API de facturación levantada y accesible desde la máquina de LKINNOVA.
- Credenciales nuevas para el RUC `20613343769`.

Docker no es obligatorio. Puedes ejecutar ambos proyectos directamente en Windows o Linux. Docker solo es conveniente si quieres aislar procesos o automatizar despliegues.

## 2. Variables de entorno

Copia las variables de `.env.example` a `.env.local` y completa:

```dotenv
SUNAT_BILLING_API_BASE_URL="http://127.0.0.1:8000/api/v1"
SUNAT_BILLING_API_KEY="REEMPLAZAR"
SUNAT_BILLING_API_SECRET="REEMPLAZAR"
SUNAT_BILLING_COMPANY_RUC="20613343769"
SUNAT_BILLING_INVOICE_SERIES="F004"

SUNAT_BILLING_RECEIPT_SERIES=""
SUNAT_BILLING_CREDIT_NOTE_SERIES=""
SUNAT_BILLING_DEBIT_NOTE_SERIES=""
SUNAT_BILLING_SENDER_GUIDE_SERIES=""
SUNAT_BILLING_CARRIER_GUIDE_SERIES=""
SUNAT_BILLING_RETENTION_SERIES=""
SUNAT_BILLING_PERCEPTION_SERIES=""
SUNAT_BILLING_PURCHASE_SETTLEMENT_SERIES=""
SUNAT_BILLING_TIMEOUT_MS="45000"
```

Las credenciales que se compartieron en una conversación deben regenerarse antes de operar. No las guardes en Git ni las publiques en capturas o logs.

Cuando la API deje de estar en localhost, cambia únicamente `SUNAT_BILLING_API_BASE_URL`. Fuera de localhost la integración exige HTTPS.

Si LKINNOVA y la API se ejecutan en computadoras distintas, `127.0.0.1` no sirve: usa la IP privada o el dominio de la máquina que ejecuta la API, por ejemplo `https://facturacion.empresa.local/api/v1`.

## 3. Instalar y preparar la base de datos

Desde la carpeta de LKINNOVA:

```powershell
npm install
npm run db:validate
npm run db:generate
npm run db:migrate
```

En producción aplica migraciones con el procedimiento del proyecto:

```powershell
npm run db:deploy
```

No ejecutes `db:migrate` contra producción. La migración nueva crea la tabla `electronic_documents`; no altera ni elimina datos existentes.

## 4. Levantar LKINNOVA

Desarrollo:

```powershell
npm run dev
```

Producción:

```powershell
npm run build
npm run start
```

La API de facturación debe estar levantada antes de emitir. Iniciar LKINNOVA no crea ni envía documentos por sí solo.

## 5. Operación

1. En **Ventas**, crea una venta en borrador y elige `Factura` o `Boleta`.
2. Revisa cliente, RUC/DNI, dirección, productos, moneda, precios y forma de pago.
3. Presiona **Emitir**. La aplicación envía el comprobante directamente y guarda su identificador, numeración y estado.
4. Usa **SUNAT** para actualizar el estado y los botones fiscales para descargar PDF, XML o CDR.
5. Los demás documentos se gestionan en **Comprobantes SUNAT**.

Una factura requiere que el cliente tenga RUC válido de 11 dígitos. La boleta admite DNI u otros documentos soportados. El precio enviado a la API incluye IGV; LKINNOVA lo calcula desde el precio neto y la tasa de la venta.

Una factura/boleta solo puede solicitar anulación después de estar aceptada. Las facturas usan comunicación de baja; las boletas usan resumen diario de anulación.

## 6. Reconciliación automática

Los estados pendientes pueden actualizarse llamando cada pocos minutos:

```text
POST /api/v1/workers/electronic-billing
Authorization: Bearer <WORKER_SECRET>
```

Configura `WORKER_SECRET` en el servidor y programa la llamada con el Programador de tareas de Windows, cron, systemd timer o el servicio de tareas de tu infraestructura. No expongas este endpoint sin el encabezado de autorización.

## 7. Verificación antes de operar

```powershell
npm run db:validate
npm run db:generate
npm run typecheck
npm run test:sandbox
npm run lint
npm run build
```

Primero prueba con un comprobante controlado y confirma en la plataforma SUNAT que el estado, XML, CDR, PDF, serie y correlativo sean correctos. No uses credenciales de producción en pruebas automatizadas.
