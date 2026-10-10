/**
 * Auditoría: quién anuló, corrigió o intentó algo que el sistema rechazó.
 *
 * PRD-001 §14 pide que toda anulación, corrección y pago quede registrada con
 * actor y marca de tiempo, y arquitectura.md AT-4 (regla 5) agrega el intento
 * rechazado: "un rechazo que nadie ve es un fraude que nadie investiga". Por
 * eso es transversal y no conoce a ningún módulo de dominio: todos le escriben.
 *
 * F1-04 le da su única función, `registrar`, y la migración 0005 su tabla
 * append-only (docs/arquitectura.md §15, AT-30 y AT-31). Leer la auditoría
 * —el historial de RF-A-10 en el panel— es F1-62, no este paquete todavía.
 */
import type { DescriptorModulo } from "@pagaya/nucleo";

export {
  SISTEMA,
  registrar,
  type Actor,
  type NuevoRegistro,
  type RegistroAuditado,
  type ResultadoAuditado,
} from "./registro.ts";

export const modulo: DescriptorModulo = {
  nombre: "auditoria",
  capa: "transversal",
  responsabilidad: "Registro append-only escrito en la misma transacción que el cambio (F1-04; PRD-001 §14; datos para RF-A-10 y RF-A-15).",
};
