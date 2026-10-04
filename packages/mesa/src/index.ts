/**
 * Mesa: el lugar físico y la sesión que lo ocupa.
 *
 * El PIN de mesa es el control de "estoy sentado acá" (PRD-002 §3.1,
 * PRD-004 §2). No importa comanda ni pago: una mesa no sabe de dinero, y es esa
 * frontera la que deja que la comanda dependa de la mesa y no al revés.
 *
 * F1-01 deja el módulo vacío: su frontera está declarada en fronteras.json y
 * verificada por `make verify`, y sus reglas llegan con las tareas del backlog
 * que lo nombran. No hay reglas de negocio acá todavía.
 */
import type { DescriptorModulo } from "@pagaya/nucleo";

export const modulo: DescriptorModulo = {
  nombre: "mesa",
  capa: "dominio",
  responsabilidad: "Mesa, sesión de mesa, QR y PIN rotativo (F1-10 a F1-15; RF-C-01, RF-M-09, RF-M-17; PRD-002 §3).",
};
