/**
 * F1-21a: el adaptador del puerto `RepositorioCuentas` contra PostgreSQL.
 *
 * Es el primer adaptador de persistencia de `@pagaya/identidad`, y entra por
 * donde tiene que entrar: `@pagaya/base-datos` y sus tres miradas (AT-13). El
 * pool no sale de ese paquete, así que acá no hay forma de consultar sin decir
 * desde dónde se mira.
 *
 * La decisión —una sola sentencia, por qué `sinLocal`, por qué `xmax` y por qué
 * el conflicto con un teléfono de personal es cero filas— está en
 * arquitectura.md §32 (AT-65). Lo que sigue es cómo se escribe.
 */
import type { Acceso } from "@pagaya/base-datos";

import type { AltaPersistida, RepositorioCuentas } from "./cuenta.ts";

/**
 * Una cuenta por teléfono, en **una** sentencia.
 *
 * - `ON CONFLICT (telefono) DO UPDATE` y no `DO NOTHING`: `DO NOTHING` no
 *   devuelve la fila en conflicto, y recuperarla con un `SELECT` después
 *   reabre la ventana que esta sentencia vino a cerrar —en `READ COMMITTED`
 *   ese `SELECT` corre con su propia instantánea y puede no ver todavía la
 *   fila que el otro registro acaba de confirmar—.
 * - `SET actualizado_en = now()` es lo **único** que toca: el `nombre_pila` de
 *   la cuenta existente no se pisa (ver `altaDeCuenta`). La actualización
 *   igual tiene que existir, porque es lo que hace que la fila vuelva por
 *   `RETURNING`.
 * - `WHERE pagaya.usuario.rol = 'cliente'` deja fuera el conflicto contra un
 *   teléfono del personal: el `UPDATE` no se aplica, la sentencia devuelve
 *   cero filas y eso es la única forma de que devuelva cero filas. No hay un
 *   `SELECT` de confirmación detrás, porque no hace falta.
 * - `(xmax = 0)` distingue el alta del reingreso: en la fila que esta
 *   transacción insertó, `xmax` es cero; en la que actualizó, lleva su propio
 *   identificador de transacción. Es la única forma de saberlo **dentro de la
 *   misma sentencia**, que es el punto.
 */
export function repositorioCuentasEnPostgres(acceso: Acceso): RepositorioCuentas {
  return {
    altaDeCliente: ({ nombrePila, telefono }) =>
      // `sinLocal`: la cuenta del cliente no tiene local (§9.3) y la unicidad
      // del teléfono es global. Fijar un local acá sería afirmar que la persona
      // pertenece a él.
      acceso.sinLocal<AltaPersistida>(async (tx) => {
        const fila = await tx.una<{
          id: string;
          nombre_pila: string;
          telefono: string;
          insertada: boolean;
        }>(
          `INSERT INTO pagaya.usuario (rol, nombre_pila, telefono)
                VALUES ('cliente', $1, $2)
           ON CONFLICT (telefono) DO UPDATE SET actualizado_en = now()
                  WHERE pagaya.usuario.rol = 'cliente'
             RETURNING id, nombre_pila, telefono, (xmax = 0) AS insertada`,
          [nombrePila, telefono],
        );

        if (fila === null) return { ok: false, motivo: "telefono_de_personal" };
        return {
          ok: true,
          cuenta: { id: fila.id, nombrePila: fila.nombre_pila, telefono: fila.telefono },
          reusada: !fila.insertada,
        };
      }),
  };
}
