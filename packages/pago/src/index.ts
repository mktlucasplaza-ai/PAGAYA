/**
 * Pago: el cobro, y la única función que produce un total.
 *
 * arquitectura.md AT-4 (regla 1) exige que `calcular_cuenta` sea el único lugar
 * que produce un total, usado igual por la vista previa y por el intento de
 * cobro. Y es el único módulo que conoce la interfaz de proveedor de pago
 * (PRD-002 §5.2, PRD-007 §2.1): ninguna regla de negocio sabe el nombre de la
 * pasarela.
 *
 * F1-01 deja el módulo vacío: su frontera está declarada en fronteras.json y
 * verificada por `make verify`, y sus reglas llegan con las tareas del backlog
 * que lo nombran. No hay reglas de negocio acá todavía.
 */
import type { DescriptorModulo } from "@pagaya/nucleo";

export const modulo: DescriptorModulo = {
  nombre: "pago",
  capa: "dominio",
  responsabilidad: "Intentos de cobro, congelamiento, calcular_cuenta, webhooks y propina (Fase 2 de PRD-001 §18; RF-C-09, RF-C-10, RF-C-15 a RF-C-18; PRD-007 §2).",
};
