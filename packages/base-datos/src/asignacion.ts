/**
 * Las mesas asignadas a un mesero, en el turno vigente ahora (F1-60a).
 *
 * RF-M-01: "ver solo las mesas asignadas a él en el turno, con estado de cada
 * una". La migración 0003 (docs/arquitectura.md §12) ya deja las tres tablas
 * —`turno`, `asignacion`, `mesa`— y el índice `asignacion_por_mesero (local_id,
 * mesero_id, turno_id)` que esta lectura usa; esto solo las lee, con `conLocal`
 * como cualquier otra consulta de negocio (AT-13).
 *
 * "El turno vigente" se calcula con la hora del **local**, no la del proceso
 * que corre esta consulta (PRD-001 §13; docs/arquitectura.md §10, AT-15): la
 * misma razón que hizo que `pagaya.fecha_local` calculara el día en la base y
 * no en TypeScript aplica a la hora. La decisión completa, con la ambigüedad
 * de turnos superpuestos que el esquema no impide, está en
 * docs/arquitectura.md §17 (AT-38).
 */
import { type Reloj, relojDelSistema } from "@pagaya/nucleo";

import type { Acceso } from "./acceso.ts";

export type MesaAsignadaAlMesero = {
  readonly mesaId: string;
  readonly numero: string;
  readonly estado: string;
  readonly zonaId: string;
  readonly turnoId: string;
};

type FilaHora = { hora: string };

type FilaMesa = {
  mesa_id: string;
  numero: string;
  estado: string;
  zona_id: string;
  turno_id: string;
};

/**
 * Las mesas del `mesero` cuyo turno está vigente para el `local`, en el
 * instante que marca `dependencias.reloj` (por defecto, el reloj del
 * sistema). Vacío si no hay ningún turno vigente o el mesero no tiene
 * asignaciones.
 */
export async function mesasAsignadasAlMesero(
  acceso: Acceso,
  local: string,
  mesero: string,
  dependencias: { readonly reloj?: Reloj } = {},
): Promise<readonly MesaAsignadaAlMesero[]> {
  const ahora = (dependencias.reloj ?? relojDelSistema).ahora();

  return acceso.conLocal(local, async (tx) => {
    // La hora del local para `ahora`, calculada por PostgreSQL (AT-15, AT-38):
    // es la misma conversión de zona horaria que ya usa `pagaya.fecha_local`,
    // solo que a `time` en vez de a `date`.
    const filaHora = await tx.una<FilaHora>(
      `SELECT ($1::timestamptz AT TIME ZONE zona_horaria)::time AS hora
         FROM pagaya.local WHERE id = $2`,
      [ahora, local],
    );
    if (filaHora === null) return [];

    // `t.inicio < t.fin` es un turno que no cruza medianoche: la hora cae
    // adentro si está en `[inicio, fin)`. Si cruza (`inicio >= fin`, migración
    // 0003), la pertenencia se invierte: después de `inicio` **o** antes de
    // `fin`. AT-38 deja la frontera `fin` exclusiva y, si dos turnos del local
    // se superponen, deja que las mesas de los dos cuenten.
    const filas = await tx.consulta<FilaMesa>(
      `SELECT m.id AS mesa_id, m.numero, m.estado, m.zona_id, t.id AS turno_id
         FROM pagaya.asignacion a
         JOIN pagaya.mesa m ON m.id = a.mesa_id
         JOIN pagaya.turno t ON t.id = a.turno_id
        WHERE a.mesero_id = $1
          AND CASE
                WHEN t.inicio < t.fin THEN $2::time >= t.inicio AND $2::time < t.fin
                ELSE $2::time >= t.inicio OR $2::time < t.fin
              END
        ORDER BY m.numero`,
      [mesero, filaHora.hora],
    );

    return filas.map((f) => ({
      mesaId: f.mesa_id,
      numero: f.numero,
      estado: f.estado,
      zonaId: f.zona_id,
      turnoId: f.turno_id,
    }));
  });
}
