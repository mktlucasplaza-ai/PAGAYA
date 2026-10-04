/**
 * Comanda: la cuenta de la mesa, compartida y en vivo.
 *
 * Acá vive `comanda.version` de arquitectura.md AT-3: el entero que sube en la
 * misma transacción que cualquier cambio del consumo o del beneficiario, y que
 * congela la comanda al cobrar y ordena el tiempo real. AT-3 advierte que si una
 * escritura esquiva ese punto único, el congelamiento se vuelve una mentira
 * silenciosa; que todas las escrituras de comanda estén dentro de este paquete
 * es la frontera que lo hace verificable.
 *
 * No importa pago: la comanda no conoce la pasarela. Pago la importa a ella.
 *
 * F1-01 deja el módulo vacío: su frontera está declarada en fronteras.json y
 * verificada por `make verify`, y sus reglas llegan con las tareas del backlog
 * que lo nombran. No hay reglas de negocio acá todavía.
 */
import type { DescriptorModulo } from "@pagaya/nucleo";

export const modulo: DescriptorModulo = {
  nombre: "comanda",
  capa: "dominio",
  responsabilidad: "Ítems, participantes, estados y comanda.version (F1-40 a F1-45; RF-C-05 a RF-C-07, RF-M-07, RF-M-08; PRD-001 §15).",
};
