# Consulta DNI y RUC para proveedores y clientes

## Alcance

En **Catálogos > Proveedores** y **Catálogos > Clientes**, el usuario selecciona el tipo de documento antes de consultar:

- **DNI:** completa el nombre de la persona a partir de un número de 8 dígitos.
- **RUC:** completa los datos fiscales a partir de un número de 11 dígitos.

La consulta RUC completa:

- nombre o razón social;
- estado del RUC;
- condición del domicilio;
- dirección fiscal;
- ubigeo, departamento, provincia y distrito.

Los datos permanecen editables antes de guardar. El correo y el teléfono se registran manualmente porque el padrón público reducido de SUNAT no los entrega.

## Proveedor de consulta

La aplicación usa los endpoints de consulta DNI y RUC documentados por [APIS.NET.PE](https://apis.net.pe/consultar-dni-ruc.html). El servicio ofrece acceso inicial gratuito con un token. La cuota y las condiciones del plan dependen del proveedor y pueden cambiar.

SUNAT publica el [padrón reducido del RUC](https://www.sunat.gob.pe/descargaPRR/mrc137_padron_reducido.html), pero no ofrece allí un endpoint REST oficial listo para una consulta individual desde la webapp. Por eso la integración se mantiene aislada detrás de un adaptador y puede reemplazarse en el futuro sin cambiar los formularios.

## Configuración

1. Crear una cuenta en APIS.NET.PE y generar un token.
2. Agregar estas variables al entorno local y a Vercel:

```env
SUNAT_RUC_API_URL="https://api.apis.net.pe/v2/sunat/ruc"
SUNAT_DNI_API_URL="https://api.decolecta.com/v1/reniec/dni"
SUNAT_RUC_API_TOKEN="token-generado-en-el-panel"
```

3. Reiniciar o volver a desplegar la aplicación.

El token es exclusivamente de servidor: no usa el prefijo `NEXT_PUBLIC_`, no se envía al navegador y no debe subirse a Git.

## Reglas de uso

- El DNI debe contener exactamente 8 dígitos.
- El RUC debe contener 11 dígitos y un dígito verificador válido.
- El tipo de documento seleccionado se guarda junto con el número.
- La consulta requiere el permiso `catalogs.manage`.
- Cada consulta exitosa se registra en auditoría con usuario, fecha, fuente, estado y condición.
- Al guardar el proveedor o cliente se conserva la fuente y la fecha de la última consulta.
- Un estado distinto de `ACTIVO` o una condición distinta de `HABIDO` genera una advertencia, pero no bloquea el registro.
- Si el proveedor externo no está disponible, el usuario puede continuar registrando los datos manualmente.
