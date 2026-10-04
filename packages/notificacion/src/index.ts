/**
 * Notificación: el canal operativo entre cliente y mesero (PRD-001 §9).
 *
 * Dueña del patrón outbox de arquitectura.md AT-2: los módulos de dominio
 * escriben el evento en su misma transacción y nadie más llama al proveedor de
 * push. No importa ningún módulo de dominio a propósito —el filtro de RF-M-02
 * (mod. por PRD-005) vive en el productor, que es quien sabe el origen del
 * ítem—, y eso es lo que mantiene el grafo sin ciclos.
 *
 * F1-01 deja el módulo vacío: su frontera está declarada en fronteras.json y
 * verificada por `make verify`, y sus reglas llegan con las tareas del backlog
 * que lo nombran. No hay reglas de negocio acá todavía.
 */
import type { DescriptorModulo } from "@pagaya/nucleo";

export const modulo: DescriptorModulo = {
  nombre: "notificacion",
  capa: "transversal",
  responsabilidad: "Outbox, repartidor y los dos canales de entrega: WebSocket en vivo y push (F1-70 a F1-73; PRD-001 §9; RF-M-02, RF-M-03, RF-M-04).",
};
