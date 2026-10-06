/**
 * La capa única de acceso: una transacción, un local.
 *
 * Qué lo exige: docs/arquitectura.md AT-1 —`local_id` obligatorio en toda tabla
 * de negocio, "filtrada en una única capa de acceso y respaldada por row level
 * security de PostgreSQL. El aislamiento no puede depender de que nadie olvide
 * un `WHERE`"— sobre PRD-001 §13 (multi-tenant desde el día uno) y PRD-001 §14
 * (acceso limitado a la mesa y al personal del local). La decisión y sus
 * alternativas están en docs/arquitectura.md §10 (AT-13).
 *
 * La forma: no hay consulta fuera de una transacción, y no hay transacción sin
 * decir desde dónde se mira. Son tres entradas y ninguna más:
 *
 *   conLocal(local, …)        el camino normal. Fija `pagaya.local_id` y cambia
 *                             a `pagaya_app`: la base solo deja ver y escribir
 *                             las filas de ese local.
 *   sinLocal(…)               no fija ningún local. Sirve para lo que no toca
 *                             datos de negocio; si los toca, ve cero filas, y
 *                             eso es lo correcto, no un error que haya que
 *                             rodear.
 *   entreLocales(motivo, …)   el cruce explícito, con motivo escrito: dar de
 *                             alta un local y la carga inicial (F1-05).
 *
 * Por qué el local se fija en la sesión y no se agrega a cada `WHERE`: un
 * `WHERE` se olvida y nadie se entera hasta que haya dos locales. La migración
 * 0002 pone el filtro en la base; esto solo le dice desde dónde mira.
 *
 * Este módulo no exporta el pool ni el cliente de `pg`, y `index.ts` tampoco:
 * la única forma de llegar a la base desde fuera de este paquete es por acá.
 */
import type { Configuracion } from "@pagaya/config";
import { ErrorPagaya } from "@pagaya/nucleo";

import { crearPool } from "./postgres.ts";

/** El rol al que se cambia en cada transacción. Lo crea la migración 0002. */
const ROL = "pagaya_app";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Fila = Record<string, unknown>;

/** Desde dónde mira una transacción. Es lo que decide qué filas existen. */
export type Mirada =
  | { readonly tipo: "local"; readonly local: string }
  | { readonly tipo: "sin_local" }
  | { readonly tipo: "entre_locales"; readonly motivo: string };

export type Transaccion = {
  /** La mirada con la que se abrió. Útil para mensajes de error y pruebas. */
  readonly mirada: Mirada;
  /** Filas de una consulta. Los parámetros van posicionales: `$1`, `$2`. */
  consulta<F extends Fila = Fila>(sql: string, parametros?: readonly unknown[]): Promise<F[]>;
  /** La única fila, o `null`. Falla si vuelve más de una: ahí hay un error de consulta. */
  una<F extends Fila = Fila>(sql: string, parametros?: readonly unknown[]): Promise<F | null>;
};

export type Acceso = {
  conLocal<T>(local: string, trabajo: (tx: Transaccion) => Promise<T>): Promise<T>;
  sinLocal<T>(trabajo: (tx: Transaccion) => Promise<T>): Promise<T>;
  entreLocales<T>(motivo: string, trabajo: (tx: Transaccion) => Promise<T>): Promise<T>;
  /** Cierra el pool. Lo llama el proceso al apagarse, nadie más. */
  cerrar(): Promise<void>;
};

export type OpcionesAcceso = {
  /**
   * Dónde queda constancia de cada cruce entre locales. Por defecto, en ningún
   * lado: el registro de auditoría append-only es F1-04 (PRD-001 §14), y
   * engancharlo acá antes de que exista sería inventar su forma.
   */
  readonly anotarCruce?: (motivo: string) => void;
};

function invalido(detalle: string): ErrorPagaya {
  return new ErrorPagaya("acceso_invalido", detalle);
}

/**
 * Crea el acceso y, con él, el pool. El pool no sale de acá: quien quiera
 * hablar con PostgreSQL pide una transacción y dice desde dónde mira.
 */
export function crearAcceso(config: Configuracion, opciones: OpcionesAcceso = {}): Acceso {
  const pool = crearPool(config);

  async function enTransaccion<T>(
    mirada: Mirada,
    trabajo: (tx: Transaccion) => Promise<T>,
  ): Promise<T> {
    const cliente = await pool.connect();
    let viva = true;

    const tx: Transaccion = {
      mirada,
      async consulta<F extends Fila = Fila>(sql: string, parametros: readonly unknown[] = []) {
        if (!viva) {
          throw invalido(
            "esta transacción ya terminó: guardar la transacción y usarla después " +
              "corre la consulta sin local fijado",
          );
        }
        const { rows } = await cliente.query<F>(sql, parametros as unknown[]);
        return rows;
      },
      async una<F extends Fila = Fila>(sql: string, parametros: readonly unknown[] = []) {
        const filas = await tx.consulta<F>(sql, parametros);
        if (filas.length > 1) {
          throw invalido(`se esperaba a lo más una fila y volvieron ${filas.length}`);
        }
        return filas[0] ?? null;
      },
    };

    try {
      await cliente.query("BEGIN");
      // El orden importa: las variables se fijan con el rol que conecta, y
      // recién después se baja a pagaya_app, que es el que la base filtra.
      if (mirada.tipo === "local") {
        await cliente.query("SELECT set_config('pagaya.local_id', $1, true)", [mirada.local]);
      }
      if (mirada.tipo === "entre_locales") {
        await cliente.query("SELECT set_config('pagaya.entre_locales', 'si', true)");
      }
      await cliente.query(`SET LOCAL ROLE ${ROL}`);

      const resultado = await trabajo(tx);
      await cliente.query("COMMIT");
      return resultado;
    } catch (causa) {
      await cliente.query("ROLLBACK").catch(() => undefined);
      throw causa;
    } finally {
      viva = false;
      cliente.release();
    }
  }

  return {
    async conLocal(local, trabajo) {
      if (!UUID.test(local)) {
        throw invalido(`'${local}' no es un identificador de local válido`);
      }
      return enTransaccion({ tipo: "local", local }, trabajo);
    },

    sinLocal(trabajo) {
      return enTransaccion({ tipo: "sin_local" }, trabajo);
    },

    async entreLocales(motivo, trabajo) {
      if (motivo.trim().length === 0) {
        throw invalido(
          "cruzar de local exige un motivo escrito: es la única traza de por qué " +
            "una transacción vio más de un local",
        );
      }
      opciones.anotarCruce?.(motivo);
      return enTransaccion({ tipo: "entre_locales", motivo }, trabajo);
    },

    async cerrar() {
      await pool.end();
    },
  };
}
