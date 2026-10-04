/**
 * Identidad: quién es quien pide, y qué puede hacer.
 *
 * Cubre el registro obligatorio para pedir (PRD-004 §2 y §3), el OTP con sus
 * límites (PRD-001 §14) y las dos reglas de seguridad del PAGAYA ID
 * (PRD-003 §3.1): el código corto identifica y no autentica; el QR personal es
 * un token de corta vida que sí autentica.
 *
 * F1-01 deja el módulo vacío: su frontera está declarada en fronteras.json y
 * verificada por `make verify`, y sus reglas llegan con las tareas del backlog
 * que lo nombran. No hay reglas de negocio acá todavía.
 */
import type { DescriptorModulo } from "@pagaya/nucleo";

export const modulo: DescriptorModulo = {
  nombre: "identidad",
  capa: "dominio",
  responsabilidad: "Cuentas, OTP, sesiones, consentimiento y PAGAYA ID (F1-03, F1-20 a F1-22; RF-C-02, RF-C-25, RF-C-26; PRD-003 §3).",
};
