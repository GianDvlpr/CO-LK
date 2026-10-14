# Pruebas de integración con Neon

Las pruebas de integración deben ejecutarse únicamente contra una rama Neon temporal cuyo nombre comience con `codex-integration-`. La suite rechaza una URL igual a `DATABASE_URL` y nunca debe apuntar a `production`.

## Cobertura actual

- Rollback completo al crear una compra inválida después de iniciar la transacción.
- Idempotencia del stock inicial ante el mismo número de referencia.
- Concurrencia de dos aprobaciones sobre la misma compra: solo una contabiliza saldo, kardex, aprobación y evento outbox.
- Autenticación con credenciales reales Argon2, bloqueo después de cinco intentos fallidos y cambio de contraseña obligatoria.
- Flujo completo de Producción: creación, reserva de materias primas, consumo valorizado e ingreso del producto terminado.
- Flujo completo de Pedidos: creación, reserva del producto terminado, despacho valorizado e intento repetido sin duplicar el kardex.
- Verificación de los siete eventos outbox de Producción y Pedidos.
- Limpieza de la empresa y datos creados por la prueba.

La suite contiene actualmente 5 escenarios distribuidos en 2 archivos. Los servicios puros de credenciales y cambio de contraseña están separados de las cookies de Next.js para poder probar la lógica contra PostgreSQL real sin iniciar el servidor web.

## Ejecución

Definir solo para el proceso de prueba:

```powershell
$env:INTEGRATION_DATABASE_URL = "postgresql://...rama-temporal..."
$env:INTEGRATION_BRANCH_NAME = "codex-integration-fecha"
npm run test:integration:sandbox
```

No guardar la URL de integración en archivos versionados. La rama debe tener expiración automática o eliminarse al terminar.
