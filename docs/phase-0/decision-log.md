# Registro de decisiones — Fase 0

Este documento es el gate funcional de LK INNOVACION. El dueño del producto aprobó globalmente las propuestas documentadas el 13/10/2026; con esta aprobación queda habilitado el inicio del esquema Prisma, las migraciones y la lógica de dominio.

| ID | Decisión / entregable | Valor base | Responsable | Fecha objetivo | Estado | Evidencia |
|---|---|---|---|---:|---|---|
| F0-01 | Precio, IGV, redondeo y promedio ponderado móvil | Precio neto + IGV 18%; costeo móvil en PEN | Dueño del producto | 13/10/2026 | Aprobado | `decision-proposal.md` y aprobación en conversación |
| F0-02 | Unidades, conversiones, densidades y lotes | Unidad base; FIFO operativo; sin conversión L→KG sin densidad | Dueño del producto | 13/10/2026 | Aprobado | `decision-proposal.md` y aprobación en conversación |
| F0-03 | Rendimiento, merma, receta y consumo | Reserva al liberar; consume al iniciar; una terminación | Dueño del producto | 13/10/2026 | Aprobado | `decision-proposal.md` y aprobación en conversación |
| F0-04 | Naturaleza y flujo de pedidos | Orden de venta con reserva y producción por faltante | Dueño del producto | 13/10/2026 | Aprobado | `decision-proposal.md` y aprobación en conversación |
| F0-05 | Operaciones parciales | Recepciones separadas; sin producción/despacho parcial | Dueño del producto | 13/10/2026 | Aprobado | `decision-proposal.md` y aprobación en conversación |
| F0-06 | Excel: columnas, actualización y volumen | Cinco libros; máximo inicial 1,000 filas | Dueño del producto | 13/10/2026 | Aprobado | Cinco plantillas v1 y aprobación en conversación |
| F0-07 | Roles, permisos y alertas | Roles base del plan | Dueño del producto | 13/10/2026 | Aprobado | `rbac-matrix.md` y aprobación en conversación |
| F0-08 | Datos históricos | Fuera del MVP salvo contratación separada | Dueño del producto | 13/10/2026 | Aprobado | `decision-proposal.md` y aprobación en conversación |
| F0-09 | Diccionario, ERD, Prisma y API v1 | Deben representar todas las decisiones aprobadas | Dueño del producto | 13/10/2026 | Aprobado | `data-model-draft.md`, `api-v1-contract.md` |
| F0-10 | Navegación, ambientes, migraciones y pruebas | Prototipo y estrategia revisados | Dueño del producto | 13/10/2026 | Aprobado | Aplicación ejecutable, CI y `backlog-and-environments.md` |

## Criterio de aprobación

Cada fila debe incluir fecha, nombre del responsable, alternativa elegida y vínculo o anexo de evidencia. El dueño del producto firma el cierre global y el líder técnico confirma viabilidad. Antes de ese cierre solo se permite avanzar con repositorio, CI, infraestructura vacía, documentación y experiencia visual sin reglas persistentes de negocio.

## Historial

| Fecha | ID | Cambio | Responsable |
|---|---|---|---|
| 2026-10-13 | — | Creación del registro inicial | Equipo de proyecto |
| 2026-10-13 | F0-01 a F0-10 | Aprobación global de las propuestas y cierre del gate | Dueño del producto |
