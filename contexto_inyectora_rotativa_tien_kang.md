# Contexto técnico — Máquina inyectora rotativa Tien Kang

> **Alcance:** documentación descriptiva de la máquina observada en las fotografías. No incluye requerimientos de software ni presupone características no confirmadas.

## 1. Identificación general

| Campo | Información |
|---|---|
| Marca de la máquina | **Tien Kang** (confirmada por el usuario) |
| Tipo | **Máquina inyectora rotativa para calzado** |
| Modelo exacto | No identificado; requiere placa de fabricación |
| Aplicación | Inyección de componentes de calzado, incluidos posibles tipos de suelas según molde y material |
| HMI | Pantalla **WEINVIEW** (identificación visible en el marco) |
| Estaciones | Se visualizan configuraciones de las estaciones **16** y **17**; existe acceso a **ST.1** y **ST.20**, pero no se ha confirmado la cantidad total física |
| Control principal | No identificado: no se ve marca/modelo del PLC |
| Materiales compatibles | Pendientes de verificación según modelo y documentación; no asumir PVC/TR/TPU como compatibles sin confirmación |

**Importante:** esta máquina es **rotativa** y es distinta de la inyectora **estática** Tien Kang con HMI PanelMaster y controladores Delta DTK documentada previamente.

## 2. Interfaz y organización de parámetros

En la HMI se observan las secciones siguientes:

- **Estaciones**: número de estación seleccionado, con ejemplos de 16 y 17.
- **Cantidad establecida**: control numérico con botones `+100`, `+10`, `+1` y `-100`, `-10`, `-1`; la cifra central mostrada es **16** en ambas fotografías (incluso cuando el título cambia a «Estaciones 17»). **No asumir** si representa una cantidad programada, contador o selección sin comprobar el comportamiento.
- **Presión** y **Fluir**: valores diferenciados para tres etapas de inyección, dos filas llamadas «bodega» y un «aumentador de presión».
- **Ra. %**: tres porcentajes, uno por etapa de inyección; significado exacto de «Ra.» pendiente de identificar.
- **Ajuste de la hora**: nueve valores alineados con etiquetas parcialmente recortadas en las imágenes; probablemente relacionados con tiempos y secuencias, pero las unidades y nombres completos no están confirmados.
- Accesos visibles: **supervisión del estado de...**, **Cantidad de estaciones conjunto**, **ST.1**, **ST.20**, **anterior** y **Página siguiente**.

## 3. Parámetros de presión y flujo observados

La siguiente tabla transcribe los valores visibles de dos pantallas. No son valores de referencia universal ni límites nominales.

| Concepto HMI | Presión ST.16 | Fluir ST.16 | Presión ST.17 | Fluir ST.17 |
|---|---:|---:|---:|---:|
| Inyección 1 | 98 | 20 | 75 | 60 |
| Inyección 2 | 98 | 20 | 70 | 60 |
| Inyección 3 | 98 | 20 | 70 | 60 |
| 1 bodega | 60 | 100 | 60 | 100 |
| 2 bodega | 60 | 100 | 60 | 100 |
| Aumentador de presión | 98 | 20 | 75 | 60 |

**Unidades:** las pantallas no muestran de forma inequívoca las unidades de las columnas «Presión» y «Fluir»; no asignar bar, kg/cm² ni porcentaje automáticamente.

### Ra. %

| Etapa | ST.16 | ST.17 |
|---|---:|---:|
| Inyección 1 | 60 | 60 |
| Inyección 2 | 30 | 30 |
| Inyección 3 | 30 | 30 |

## 4. «Ajuste de la hora»: valores visibles

La columna derecha de la HMI contiene nueve valores; se repiten en las fotos de las estaciones 16 y 17:

| Orden vertical | Valor visible | Texto legible/parcial |
|---|---:|---|
| 1 | 8.0 | «retardo de la alimentación» (parcial) |
| 2 | 0.0 | «1 bodega» |
| 3 | 0.0 | «2 bodega» |
| 4 | 2.00 | «de sujeción» (parcial) |
| 5 | 1.0 | «aumentador de presión» |
| 6 | 5.0 | «molde de retardo» (parcial) |
| 7 | 0.0 | «retraso que sopla» (parcial) |
| 8 | 2.0 | «tiempo de soplado-retardo» (parcial) |
| 9 | 2.0 | «desanimado / tiempo desanimado» (traducción extraña, pendiente de verificar) |

**Precaución de interpretación:** varias etiquetas son traducciones imperfectas y están cortadas en las fotos. Se recomienda registrar también el texto original mostrado en la HMI y no redefinir su función sin manual o evidencia operativa.

## 5. Control de temperatura y tablero eléctrico

El tablero mostrado presenta **cuatro controles térmicos** etiquetados «Temperature 1» a «Temperature 4»:

| Zona | PV (medido) | SV (consigna) | Observación |
|---|---:|---:|---|
| Temperatura 1 | 154.1 °C | 154.0 °C | Controlador Autonics visible |
| Temperatura 2 | 168 °C | 168 °C | Controlador digital de otra serie/marca por verificar |
| Temperatura 3 | 188 °C | 188 °C | Autonics TCN4S visible |
| Temperatura 4 | 188 °C | 188 °C | Autonics TCN4S visible |

Hay **cuatro interruptores luminosos** ON/OFF debajo de las zonas térmicas, además de:

- **Medidor analógico «Total electricity / Corriente total»**: lectura visual aproximada; no registrar un valor exacto con esta foto.
- **Indicador digital de voltaje**: muestra aproximadamente **222 V**.
- **Controlador digital inferior**: PV **58**, SV **60**; función física y unidad no confirmadas.

Las temperaturas y lecturas son una **instantánea**, no condiciones nominales recomendadas por el fabricante.

## 6. Consideraciones de funcionamiento observables

- La HMI permite consultar parámetros asociados a estaciones diferentes.
- En las fotografías, **ST.16 y ST.17 muestran diferentes presiones y flujos**, mientras que los valores de «Ra. %» son iguales.
- La pantalla presenta **tres fases de inyección** y parámetros adicionales llamados «1 bodega», «2 bodega» y «aumentador de presión».
- La máquina cuenta con control de temperatura en cuatro zonas visibles, separado de la página principal de parámetros de estación.
- No están confirmados: el número total de estaciones, mecanismos de cierre y expulsión, presión máxima, capacidad de inyección, alcance de la configuración por estación, ni posibles funciones de guardado interno.

## 7. Datos pendientes para identificación precisa

1. **Placa de identificación**: modelo, año, número de serie y características eléctricas.
2. **Fotografía completa** de la estructura rotativa y del sistema de inyección.
3. **Marca/modelo del PLC** y modelo completo de la HMI WEINVIEW.
4. **Manual técnico y eléctrico** para descifrar etiquetas mal traducidas, unidades y límites de parámetros.
5. **Cantidad total de estaciones físicas** y disposición de moldes.
6. **Materiales utilizados en esta unidad** y correspondencia de temperaturas con componentes físicos.
7. **Función real de «Ra. %»**, «bodega» y de cada fila de «Ajuste de la hora».

## 8. Reglas de interpretación de este contexto

- No confundir esta **Tien Kang rotativa / WEINVIEW** con la **Tien Kang estática / PanelMaster**.
- Distinguir valores observados de especificaciones del fabricante.
- No transformar traducciones dudosas de la HMI en afirmaciones definitivas.
- No atribuir un modelo específico sin corroboración por placa o documentación.
- No suponer que los valores de presión, flujo y tiempo usan las mismas unidades que los de otra máquina.
- No modificar ajustes de operación industrial basándose únicamente en estas fotografías.

---

**Origen de la información:** identificación de marca y tipo facilitada por el usuario; cuatro fotografías del panel HMI WEINVIEW y del tablero de temperatura. Documento centrado exclusivamente en esta máquina.
