# Contexto técnico — Máquina inyectora estática Tien Kang

> Documento de contexto de la **máquina únicamente**. La información proviene de fotografías del panel de operación y de la identificación de marca proporcionada por el usuario. Los datos no verificados se indican expresamente.

## 1. Identificación general

- **Fabricante:** Tien Kang.
- **Tipo:** Máquina inyectora industrial **estática, no rotativa**, para fabricación de componentes de calzado.
- **Modelo exacto:** No identificado.
- **Aplicación:** Inyección de materiales para producir suelas, plantas u otros componentes del calzado.
- **Materiales:** La máquina trabaja con diversos materiales; la lista exacta de materiales compatibles con este equipo está pendiente de confirmación.
- **Estaciones que aparecen en la HMI:** ST.1 y ST.2.
- **Inyectores físicos identificados:** INJ-1 e INJ-2; la HMI usa las etiquetas 1C y 2C.
- **Interfaz:** Pantalla HMI PanelMaster.
- **Sistema de control:** Control industrial mediante PLC; marca/modelo del PLC pendientes de identificación.
- **Controladores térmicos:** Ocho controladores Delta DTK visibles, distribuidos en dos columnas.

**Precaución:** No debe suponerse que esta unidad pertenece a una serie específica de Tien Kang sin revisar su placa técnica.

## 2. Interfaz de operación

La HMI presenta secciones denominadas:

- **Modo:** Vista de los parámetros operativos del modo de trabajo.
- **Función:** Acceso a funciones de operación (contenido no documentado en las fotografías).
- **Parámetros:** Valores de presión y flujo.
- **Tiempo:** Configuraciones temporales del ciclo.
- **ST.1 / ST.2:** Selección de estación.
- **Entr. Saída:** Pantalla de entradas y salidas.
- **Monitor:** Pantalla de monitoreo.

En una fotografía la cabecera muestra **`ST.1 Modo 2 2C`**. Esto confirma la etiqueta del modo y del canal visualizados, pero no define por sí solo la secuencia mecánica asociada.

## 3. Parámetros de presión

Pantalla: **`ST.1 Parámetros`**, sección **`Presión (kg/cm²)`**.

| Parámetro mostrado | 1C | 2C |
|---|---:|---:|
| Volumen aliment. | 100 | 100 |
| Primera Inyección | 70 | 90 |
| 2da. Inyección | 70 | 90 |
| Soporte de presión | 100 | 100 |

Los números son valores visibles en la captura, no máximos ni recomendaciones de operación.

## 4. Parámetros de flujo

Pantalla: **`ST.1 Parámetros`**, sección **`Fluido (%)`**.

| Parámetro mostrado | 1C | 2C |
|---|---:|---:|
| Volumen aliment. | 100 | 100 |
| Primera Inyección | 50 | 95 |
| 2da. Inyección | 50 | 100 |
| Soporte de presión | 100 | 100 |

## 5. Parámetros de tiempo

Pantalla: **`ST.1 Config. de Tiempo`**.

| Parámetro mostrado | 1C | 2C |
|---|---:|---:|
| Soporte de tiempo de retra. | 0 | 0 |
| Soporte de tiempo | 7 | 7 |
| Tiempo de enfriado | 0 | 1200 |
| Max. Inyección | 60 | 60 |
| Tiempo de retra. de aliment. | 0 | 0 |
| Max. Alimentación | 110 | 110 |
| Gravedad Específica | 1000 | 1000 |

La pantalla no permite confirmar las unidades ni las escalas internas de estos campos. El parámetro «Gravedad Específica» aparece en esta página, pero **no debe suponerse que representa un tiempo**.

## 6. Parámetros de la pantalla de modo

Pantalla: **`ST.1 Modo 2 2C`**.

| Parámetro mostrado | 1C | 2C |
|---|---:|---:|
| Volumen aliment. | 95.0 | 396.0 |
| Primera Inyección | 80.0 | 386.0 |
| 2da. Inyección | 6.0 | 6.0 |
| Soporte de presión | 10.0 | 5.0 |

También aparecen:

- Indicadores o controles **I** y **D** para 1C y 2C (significado operativo por confirmar).
- **Expulsión superior**, con un control visible.
- **Contador:** 1 (valor observado).
- **Tiempo:** 2.0 (valor observado).
- Opción descrita en pantalla como **«Antes de que el ciclo no es la alimentación automática»**, cuyo funcionamiento exacto debe verificarse.

Es importante no mezclar los valores de esta página con los de la pantalla de presión/flujo: aunque algunas etiquetas coinciden, pertenecen a pantallas diferentes y pueden representar variables distintas.

## 7. Temperaturas y controladores Delta DTK

En el panel físico se observan dos columnas de cuatro controladores Delta DTK cada una, bajo selectores **INJ-1** e **INJ-2**.

Los indicadores numéricos parecen mostrar **PV** (temperatura actual) en rojo y **SV** (valor configurado) en verde.

| Posición visible | INJ-1: PV / SV | INJ-2: PV / SV |
|---|---|---|
| Superior | `no Cont` | `no Cont` |
| Numérica 1 | 143 °C / 142 °C | 138 °C / 138 °C |
| Numérica 2 | 146 °C / 146 °C | 138 °C / 135 °C |
| Numérica 3 | 144 °C / 144 °C | 135 °C / 135 °C |

Las zonas físicas de calentamiento correspondientes a cada fila no están identificadas. `no Cont` es el texto observado en los controladores superiores; se debe consultar el manual del controlador y su configuración antes de interpretar la causa concreta en este equipo.

## 8. Componentes y organización identificados

- Dos selectores físicos etiquetados **INJ-1** e **INJ-2**, con posiciones **ON/OFF**.
- Pantalla táctil PanelMaster.
- Ocho controladores digitales Delta DTK visibles.
- Acceso HMI a ST.1 y ST.2.
- Acceso HMI a vistas de modo, funciones, parámetros, tiempos y monitor de E/S.
- PLC de control: presencia esperada por la arquitectura de automatización, pero sus datos técnicos no están documentados en las fotos.

## 9. Información que todavía debe verificarse

- Modelo y serie exactos de la máquina Tien Kang.
- Año de fabricación y número de estaciones físicas.
- Identificación del PLC y del proyecto HMI.
- Materiales compatibles y recetas de proceso permitidas por fabricante.
- Correspondencia exacta entre INJ-1/INJ-2 y 1C/2C.
- Función de las indicaciones I/D.
- Unidades y escalas de cada parámetro en la página de modo y tiempo.
- Rangos y límites válidos de presión, temperatura y tiempo.
- Asignación de zonas térmicas, sensores y significado de `no Cont` para la configuración instalada.
- Manuales, esquemas eléctricos, neumáticos/hidráulicos y lista de alarmas.

## 10. Notas de interpretación

1. **Es una inyectora estática Tien Kang**, no una máquina rotativa.
2. Todos los números anteriores son **lecturas de las fotografías**, no consignas recomendadas ni especificaciones máximas.
3. Se deben distinguir las etiquetas de la HMI de la función real de sensores y actuadores, que requiere documentación específica.
4. No se confirma el modelo, capacidades, fuerza de cierre, materiales autorizados ni protocolo de comunicación.
5. Cualquier ajuste operativo debe realizarse por personal capacitado y conforme a los procedimientos de seguridad del fabricante.
