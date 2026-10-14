# ADR-0001 — Monolito modular con Next.js

- **Estado:** Aprobado como base técnica
- **Fecha:** 2026-10-13

## Contexto

El MVP comparte reglas transaccionales entre compras, inventario, recetas, producción y pedidos. Separar servicios desde el inicio agregaría coordinación distribuida sin una necesidad demostrada.

## Decisión

Se implementará un único despliegue Next.js con App Router y módulos internos separados en dominio, aplicación e infraestructura. PostgreSQL será la fuente de verdad. Cloudinary almacenará binarios y Pusher notificará cambios sin convertirse en fuente de datos.

Los Route Handlers solo traducen HTTP, autentican, validan e invocan casos de uso. Las modificaciones de inventario pertenecen exclusivamente al módulo de inventario y ocurren dentro de transacciones Prisma.

## Consecuencias

- Despliegue, observabilidad y transacciones más simples para el MVP.
- Límites de código obligatorios para evitar acoplamiento entre módulos.
- Posibilidad de extraer servicios después si el volumen o la organización lo justifican.
- El modelo físico de negocio permanece bloqueado hasta aprobar la fase 0.
