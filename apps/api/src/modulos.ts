/**
 * Los módulos de arquitectura.md AT-1, montados en el proceso que los hospeda.
 *
 * Esta lista es la frontera hecha carne: apps/api es el único paquete que puede
 * importar los siete módulos (fronteras.json), y el único lugar donde se ve el
 * sistema completo. Si un módulo deja de compilar o su frontera queda mal
 * declarada, se nota acá.
 */
import { modulo as auditoria } from "@pagaya/auditoria";
import { modulo as comanda } from "@pagaya/comanda";
import { modulo as fidelizacion } from "@pagaya/fidelizacion";
import { modulo as identidad } from "@pagaya/identidad";
import { modulo as mesa } from "@pagaya/mesa";
import { modulo as notificacion } from "@pagaya/notificacion";
import type { DescriptorModulo } from "@pagaya/nucleo";
import { modulo as pago } from "@pagaya/pago";

export const MODULOS: readonly DescriptorModulo[] = [
  auditoria,
  notificacion,
  identidad,
  mesa,
  comanda,
  fidelizacion,
  pago,
];
