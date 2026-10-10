/**
 * F1-20c: el OTP no es un grifo de costo abierto (PRD-004 §8, PRD-001 §14).
 *
 * Es un puerto, igual que `Outbox` (AT-14 en arquitectura.md §30, análogo a
 * AT-2): `crearServicioOtp` no sabe si la ventana se cuenta en memoria, en
 * Redis o en una tabla de PostgreSQL. Hoy solo existe el adaptador en memoria,
 * por el mismo motivo que `outboxEnMemoria` (arquitectura.md §14): no hay
 * migración para esta tarea, y una tabla de ventanas deslizantes es trabajo
 * de quien la necesite persistida entre procesos.
 */
import { ErrorPagaya, relojDelSistema, type Reloj } from "@pagaya/nucleo";

import type { DispositivoId } from "./sesion.ts";
import type { LimitesOtp } from "./registro.ts";

/**
 * Registra un intento de envío de OTP y rechaza el N+1 dentro de la ventana
 * (una hora, fija: son los campos `enviosPorNumeroPorHora` y
 * `enviosPorDispositivoPorHora` de `LimitesOtp`). Lanza `ErrorPagaya` con
 * código `limite_excedido` si el número o el dispositivo ya alcanzaron su
 * tope; de lo contrario, cuenta el intento.
 */
export type LimitadorEnvios = {
  registrar(peticion: { readonly telefono: string; readonly dispositivoId: DispositivoId }): Promise<void>;
};

const VENTANA_MS = 60 * 60 * 1000;

export function limitadorEnviosEnMemoria(dependencias: { readonly limites: LimitesOtp; readonly reloj?: Reloj }): LimitadorEnvios {
  const reloj = dependencias.reloj ?? relojDelSistema;
  const marcasPorTelefono = new Map<string, number[]>();
  const marcasPorDispositivo = new Map<string, number[]>();

  function vigentes(marcas: readonly number[], ahora: number): number[] {
    return marcas.filter((marca) => ahora - marca < VENTANA_MS);
  }

  return {
    registrar: async ({ telefono, dispositivoId }) => {
      const ahora = reloj.ahora().getTime();
      const vigentesTelefono = vigentes(marcasPorTelefono.get(telefono) ?? [], ahora);
      const vigentesDispositivo = vigentes(marcasPorDispositivo.get(dispositivoId) ?? [], ahora);

      if (vigentesTelefono.length >= dependencias.limites.enviosPorNumeroPorHora) {
        throw new ErrorPagaya("limite_excedido", `se superó el límite de ${dependencias.limites.enviosPorNumeroPorHora} envíos por hora para el número ${telefono}`);
      }
      if (vigentesDispositivo.length >= dependencias.limites.enviosPorDispositivoPorHora) {
        throw new ErrorPagaya("limite_excedido", `se superó el límite de ${dependencias.limites.enviosPorDispositivoPorHora} envíos por hora para el dispositivo ${dispositivoId}`);
      }

      vigentesTelefono.push(ahora);
      vigentesDispositivo.push(ahora);
      marcasPorTelefono.set(telefono, vigentesTelefono);
      marcasPorDispositivo.set(dispositivoId, vigentesDispositivo);
    },
  };
}
