/**
 * Auditoría: quién anuló, corrigió o intentó algo que el sistema rechazó.
 *
 * PRD-001 §14 pide que toda anulación, corrección y pago quede registrada con
 * actor y marca de tiempo, y arquitectura.md AT-4 (regla 5) agrega el intento
 * rechazado: "un rechazo que nadie ve es un fraude que nadie investiga". Por
 * eso es transversal y no conoce a ningún módulo de dominio: todos le escriben.
 *
 * F1-01 deja el módulo vacío: su frontera está declarada en fronteras.json y
 * verificada por `make verify`, y sus reglas llegan con las tareas del backlog
 * que lo nombran. No hay reglas de negocio acá todavía.
 */
import type { DescriptorModulo } from "@pagaya/nucleo";

export const modulo: DescriptorModulo = {
  nombre: "auditoria",
  capa: "transversal",
  responsabilidad: "Registro append-only escrito en la misma transacción que el cambio (F1-04; PRD-001 §14; datos para RF-A-10 y RF-A-15).",
};
