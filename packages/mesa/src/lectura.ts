/**
 * Leer el estado de una mesa y su sesión, para quien solo necesita mirar
 * (F1-10c). No transiciona nada: la máquina de estados (estados.ts, F1-10b)
 * decide a qué estado se puede pasar; esto lee el que ya quedó escrito en
 * `pagaya.mesa` y `pagaya.sesion_mesa` (migración 0004).
 *
 * Vive en `@pagaya/mesa` y no en `@pagaya/base-datos` ni en `@pagaya/api`
 * (decisión de F1-10c, docs/arquitectura.md §48): así el `estado` que expone
 * el endpoint es siempre `EstadoMesa`/`EstadoSesionMesa` de `estados.ts`, no
 * un tipo recalculado aparte que pueda desviarse de la máquina de estados.
 *
 * La sesión que se devuelve es la última que tuvo esta mesa (por
 * `abierta_en`): `sesion_mesa` no tiene una fila "vigente" marcada aparte, y
 * una mesa que nunca abrió sesión devuelve `null`, no un error.
 */
import type { Acceso } from "@pagaya/base-datos";
import { ErrorPagaya } from "@pagaya/nucleo";

import type { EstadoMesa, EstadoSesionMesa } from "./estados.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SesionMesaLeida = {
  readonly estado: EstadoSesionMesa;
  readonly abiertaEn: Date;
  readonly cerradaEn: Date | null;
};

export type EstadoMesaLeido = {
  readonly estado: EstadoMesa;
  readonly sesion: SesionMesaLeida | null;
};

type FilaMesa = { estado: EstadoMesa };
type FilaSesion = { estado: EstadoSesionMesa; abierta_en: Date; cerrada_en: Date | null };

/** `null` si la mesa no existe en ese local. */
export async function leerEstadoMesa(
  acceso: Acceso,
  local: string,
  mesaId: string,
): Promise<EstadoMesaLeido | null> {
  if (!UUID.test(mesaId)) {
    throw new ErrorPagaya("acceso_invalido", `'${mesaId}' no es un identificador de mesa válido`);
  }

  return acceso.conLocal(local, async (tx) => {
    const mesa = await tx.una<FilaMesa>(`SELECT estado FROM pagaya.mesa WHERE id = $1`, [mesaId]);
    if (mesa === null) return null;

    const sesion = await tx.una<FilaSesion>(
      `SELECT estado, abierta_en, cerrada_en FROM pagaya.sesion_mesa
         WHERE mesa_id = $1 ORDER BY abierta_en DESC LIMIT 1`,
      [mesaId],
    );

    return {
      estado: mesa.estado,
      sesion:
        sesion === null
          ? null
          : { estado: sesion.estado, abiertaEn: sesion.abierta_en, cerradaEn: sesion.cerrada_en },
    };
  });
}
