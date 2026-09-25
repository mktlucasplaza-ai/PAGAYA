# PRDs de PAGAYA

Esta carpeta contiene **todos** los PRDs del producto. El PRD es la única fuente
de verdad del alcance: si algo no está en un PRD, no está definido.

## Regla de versionado

1. El producto se define en un PRD base: `PRD-001`.
2. **Ningún PRD se edita después de publicado.** Cualquier cambio de alcance,
   flujo, regla de negocio o modelo de datos se escribe en un **PRD nuevo** con
   el número siguiente.
3. Todo PRD a partir del `PRD-002` abre con la sección
   **"Cambios en esta versión"**, que indica:
   - qué PRD reemplaza o modifica,
   - qué se agregó, qué se modificó y qué se eliminó,
   - por qué se hizo el cambio.
4. El PRD vigente es el de número más alto; los anteriores quedan como historia
   y se leen en orden para entender la evolución del producto.

## Nomenclatura

`PRD-<número de 3 dígitos>-<slug-corto>.md` — por ejemplo
`PRD-002-propinas-y-division-de-cuenta.md`.

Para redactar un PRD nuevo, copiar `_plantilla-prd.md`.

## Índice

| PRD | Título | Estado | Fecha |
|-----|--------|--------|-------|
| [PRD-001](PRD-001-pagaya-mvp.md) | PAGAYA — Pago rápido y autogestión de mesa en restaurantes (MVP) | Vigente | 2026-09-25 |
