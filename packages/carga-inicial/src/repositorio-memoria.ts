/**
 * Repositorio en memoria.
 *
 * No es solo un doble de prueba: es lo que hace correr el comando `plan` hoy,
 * con las tablas de la carta y de la mesa todavía sin existir. El mismo objeto que usa la
 * prueba de idempotencia es el que usa el comando, así que lo que la prueba
 * verifica no es una maqueta aparte.
 *
 * Guarda las filas por clave natural, igual que la base: escribir dos veces la
 * misma clave actualiza, no agrega. Si esta estructura permitiera duplicar una
 * clave, la prueba de idempotencia pasaría sin probar nada.
 */
import { ErrorPagaya } from "@pagaya/nucleo";

import type { Cambio, FilaIdentificada, RepositorioCarga } from "./plan.ts";

export type RepositorioMemoria = RepositorioCarga & {
  /** Las filas guardadas, en orden de inserción. */
  estado(): readonly FilaIdentificada[];
  /** Cuántas veces se abrió una escritura. Una segunda corrida no debería sumar. */
  readonly escrituras: Cambio[][];
  /** Simula lo que hace la operación durante el servicio (por ejemplo RF-M-12). */
  tocar(entidad: FilaIdentificada["entidad"], clave: string, campos: FilaIdentificada["campos"]): void;
};

export function repositorioMemoria(
  iniciales: readonly FilaIdentificada[] = [],
): RepositorioMemoria {
  const filas = new Map<string, FilaIdentificada>();
  for (const fila of iniciales) filas.set(`${fila.entidad}|${fila.clave}`, fila);
  const escrituras: Cambio[][] = [];

  const tocar: RepositorioMemoria["tocar"] = (entidad, clave, campos) => {
    const k = `${entidad}|${clave}`;
    const actual = filas.get(k);
    filas.set(k, {
      entidad,
      clave,
      campos: { ...(actual?.campos ?? {}), ...campos },
    });
  };

  return {
    escrituras,
    estado: () => [...filas.values()],
    tocar,
    leerEstado: async () => [...filas.values()],
    escribir: async (_localSlug, cambios) => {
      if (cambios.length === 0) {
        throw new ErrorPagaya(
          "carga_invalida",
          "se pidió escribir un plan vacío: la carga no debe abrir una transacción para nada",
        );
      }
      escrituras.push([...cambios]);
      for (const cambio of cambios) {
        const k = `${cambio.entidad}|${cambio.clave}`;
        if (cambio.accion === "baja") {
          filas.delete(k);
          continue;
        }
        const actual = filas.get(k);
        filas.set(k, {
          entidad: cambio.entidad,
          clave: cambio.clave,
          campos: { ...(actual?.campos ?? {}), ...cambio.campos },
        });
      }
    },
  };
}
