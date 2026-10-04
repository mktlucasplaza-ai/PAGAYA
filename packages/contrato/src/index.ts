/**
 * Contrato de la API: los tipos que comparten el servidor y los dos clientes.
 *
 * arquitectura.md AT-1 lo nombra como consecuencia asumida ("dos clientes con
 * el contrato de la API compartido como paquete de tipos"). Por eso este
 * paquete no importa nada: lo consume la web app del cliente (apps/web), que
 * corre en el navegador, y nada de servidor puede llegar ahí.
 *
 * En F1-01 el contrato tiene una sola ruta, la de salud. Las rutas de negocio
 * llegan con sus tareas.
 */

/**
 * Versión del contrato. Sube cuando un cambio rompe a un cliente ya desplegado:
 * la web app se sirve desde el QR y se actualiza sola, pero la app del mesero es
 * instalada (AT-1) y puede quedar varias versiones atrás.
 */
export const VERSION_CONTRATO = "1";

export const RUTA_SALUD = "/salud";

/**
 * Respuesta de salud. Es deliberadamente pobre: dice que el proceso está en
 * pie, no que la base de datos responda. Lo segundo es una verificación
 * distinta, y mezclarlas hace que el balanceador saque de rotación un proceso
 * sano porque un tercero está lento.
 */
export type RespuestaSalud = {
  readonly ambiente: string;
  readonly contrato: string;
  readonly ahora: string;
};
