/**
 * Fidelización: visitas, niveles y el beneficio que da el nivel.
 *
 * `beneficio_activo` es **derivado, no asignado** (arquitectura.md AT-4, regla
 * 3): se calcula desde la sesión activa, el nivel vigente y la vía de ingreso
 * según la tabla de PRD-003 §3.2. Por eso este módulo no importa comanda ni
 * pago: nadie puede concederle un beneficio a nadie, ni siquiera el mesero
 * (PRD-003 §3.5).
 *
 * F1-01 deja el módulo vacío: su frontera está declarada en fronteras.json y
 * verificada por `make verify`, y sus reglas llegan con las tareas del backlog
 * que lo nombran. No hay reglas de negocio acá todavía.
 */
import type { DescriptorModulo } from "@pagaya/nucleo";

export const modulo: DescriptorModulo = {
  nombre: "fidelizacion",
  capa: "dominio",
  responsabilidad: "Visitas, niveles y beneficio_activo derivado (Fase 3 de PRD-001 §18; RF-C-12, RF-A-07; PRD-003 §3.2, PRD-006 §2).",
};
