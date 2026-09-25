# PAGAYA

App de pago rápido y autogestión de mesa para restaurantes: el cliente pide,
agrega productos, llama al mesero y paga desde su propio teléfono; el mesero
atiende en lugar de tramitar; el administrador ve el salón y la caja en vivo. El
cliente sube de nivel según cuántas veces visitó el local.

## Cómo trabajamos

Este producto se define y evoluciona **por PRDs**. Toda la definición vive en
[`prds/`](prds/):

- El producto base está en [`prds/PRD-001-pagaya-mvp.md`](prds/PRD-001-pagaya-mvp.md).
- Los PRDs no se editan: cada cambio de alcance se escribe en un **PRD nuevo**
  que abre con la sección *"Cambios en esta versión"*.
- Las reglas de versionado y el índice están en [`prds/README.md`](prds/README.md).

## Roles

| Rol | Qué hace |
|---|---|
| **Cliente** | Se une a la mesa por QR, pide, llama al mesero, paga y deja feedback. |
| **Mesero** | Ve sus mesas, recibe notificaciones, entrega y atiende. |
| **Administrador** | Configura carta, mesas, meseros y niveles; ve ventas y feedback. |
