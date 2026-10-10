/**
 * Lo que la migración 0004 promete, verificado contra PostgreSQL (F1-10a).
 *
 * La invariante de PRD-002 §3.4 y PRD-005 §6 —"como máximo una comanda abierta
 * por mesa"— es un índice único parcial, no una regla de aplicación: la única
 * forma honesta de probarla es intentar violarla contra PostgreSQL de verdad,
 * con dos transacciones concurrentes, que es justo lo que una prueba unitaria
 * contra un doble en memoria no puede mostrar (docs/arquitectura.md §13, AT-20).
 *
 * La guardia `pagaya.tablas_sin_aislamiento()` ya cubre que `comanda` y
 * `sesion_mesa` tengan su row level security forzada (acceso.prueba.ts), sin
 * que haya que nombrarlas acá.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { cargarConfiguracion } from "@pagaya/config";

import { crearAcceso, type Acceso } from "./acceso.ts";
import { migrarAmbiente } from "./postgres.ts";

const hayBaseDatos = (process.env["PAGAYA_BD_URL"] ?? "").length > 0;

const LOCAL = "cccccccc-0000-4000-8000-00000000f10a";

describe(
  "mesa y sesión de mesa (F1-10a)",
  { skip: hayBaseDatos ? false : "sin PAGAYA_BD_URL" },
  () => {
    let acceso: Acceso;
    let mesaId: string;

    async function limpiar(): Promise<void> {
      await acceso.entreLocales("limpiar lo que montó esta prueba", async (tx) => {
        await tx.consulta(`DELETE FROM pagaya.local WHERE id = $1`, [LOCAL]);
      });
    }

    before(async () => {
      const config = cargarConfiguracion({ ambiente: process.env["PAGAYA_AMBIENTE"] ?? "dev" });
      await migrarAmbiente(config);
      acceso = crearAcceso(config);
      await limpiar();
      await acceso.entreLocales("sembrar el local y la mesa de esta prueba", async (tx) => {
        await tx.consulta(
          `INSERT INTO pagaya.local (id, slug, nombre, zona_horaria)
           VALUES ($1, 'ensayo-f110a', 'Ensayo F1-10a', 'America/Santiago')`,
          [LOCAL],
        );
      });
      const zona = await acceso.conLocal(LOCAL, (tx) =>
        tx.una<{ id: string }>(
          `INSERT INTO pagaya.zona (local_id, slug, nombre) VALUES ($1, 'salon', 'Salón')
             RETURNING id`,
          [LOCAL],
        ),
      );
      const mesa = await acceso.conLocal(LOCAL, (tx) =>
        tx.una<{ id: string }>(
          `INSERT INTO pagaya.mesa (local_id, zona_id, numero, capacidad, qr_token)
             VALUES ($1, $2, '1', 4, 'ensayo-f110a-qr-mesa-1')
             RETURNING id`,
          [LOCAL, zona?.["id"]],
        ),
      );
      mesaId = mesa?.["id"] as string;
    });

    after(async () => {
      if (acceso === undefined) return;
      await limpiar();
      await acceso.cerrar();
    });

    test("la mesa nace libre", async () => {
      const fila = await acceso.conLocal(LOCAL, (tx) =>
        tx.una<{ estado: string }>(`SELECT estado FROM pagaya.mesa WHERE id = $1`, [mesaId]),
      );
      assert.deepEqual(fila, { estado: "libre" });
    });

    test("abrir dos comandas para la misma mesa hace fallar la segunda por el índice único", async () => {
      await acceso.conLocal(LOCAL, (tx) =>
        tx.consulta(`INSERT INTO pagaya.comanda (local_id, mesa_id) VALUES ($1, $2)`, [
          LOCAL,
          mesaId,
        ]),
      );

      await assert.rejects(
        () =>
          acceso.conLocal(LOCAL, (tx) =>
            tx.consulta(`INSERT INTO pagaya.comanda (local_id, mesa_id) VALUES ($1, $2)`, [
              LOCAL,
              mesaId,
            ]),
          ),
        /comanda_una_abierta_por_mesa/,
      );

      await acceso.conLocal(LOCAL, (tx) =>
        tx.consulta(`DELETE FROM pagaya.comanda WHERE local_id = $1 AND mesa_id = $2`, [
          LOCAL,
          mesaId,
        ]),
      );
    });

    test("dos transacciones concurrentes por la misma mesa: solo una gana", async () => {
      // La prueba de arriba muestra la regla; ésta muestra que es un candado
      // real y no una carrera que gana quien llegó primero a leer. Las dos
      // transacciones abren, insertan y recién después hacen commit: si el
      // índice fuera una ilusión, las dos verían "no hay comanda abierta" y
      // las dos insertarían.
      const resultados = await Promise.allSettled([
        acceso.conLocal(LOCAL, (tx) =>
          tx.consulta(`INSERT INTO pagaya.comanda (local_id, mesa_id) VALUES ($1, $2)`, [
            LOCAL,
            mesaId,
          ]),
        ),
        acceso.conLocal(LOCAL, (tx) =>
          tx.consulta(`INSERT INTO pagaya.comanda (local_id, mesa_id) VALUES ($1, $2)`, [
            LOCAL,
            mesaId,
          ]),
        ),
      ]);

      const cumplidas = resultados.filter((r) => r.status === "fulfilled");
      const rechazadas = resultados.filter((r) => r.status === "rejected");
      assert.equal(cumplidas.length, 1, "exactamente una de las dos aperturas gana");
      assert.equal(rechazadas.length, 1);
      assert.match(
        String((rechazadas[0] as PromiseRejectedResult).reason),
        /comanda_una_abierta_por_mesa/,
      );

      await acceso.conLocal(LOCAL, (tx) =>
        tx.consulta(`DELETE FROM pagaya.comanda WHERE local_id = $1 AND mesa_id = $2`, [
          LOCAL,
          mesaId,
        ]),
      );
    });

    test("la sesión de mesa vincula la mesa con su comanda abierta", async () => {
      const comanda = await acceso.conLocal(LOCAL, (tx) =>
        tx.una<{ id: string }>(
          `INSERT INTO pagaya.comanda (local_id, mesa_id) VALUES ($1, $2) RETURNING id`,
          [LOCAL, mesaId],
        ),
      );
      const sesion = await acceso.conLocal(LOCAL, (tx) =>
        tx.una<{ id: string; estado: string; cerrada_en: string | null }>(
          `INSERT INTO pagaya.sesion_mesa (local_id, mesa_id, comanda_id)
             VALUES ($1, $2, $3)
             RETURNING id, estado, cerrada_en`,
          [LOCAL, mesaId, comanda?.["id"]],
        ),
      );
      assert.equal(sesion?.estado, "abierta");
      assert.equal(sesion?.cerrada_en, null);

      // Una comanda, una sesión: PRD-002 §3.4 las vincula de a una.
      await assert.rejects(
        () =>
          acceso.conLocal(LOCAL, (tx) =>
            tx.consulta(`INSERT INTO pagaya.sesion_mesa (local_id, mesa_id, comanda_id)
                           VALUES ($1, $2, $3)`, [LOCAL, mesaId, comanda?.["id"]]),
          ),
        /sesion_mesa_una_por_comanda/,
      );

      // Cerrar sin su instante de cierre, o viceversa, viola la equivalencia.
      await assert.rejects(
        () =>
          acceso.conLocal(LOCAL, (tx) =>
            tx.consulta(`UPDATE pagaya.sesion_mesa SET estado = 'cerrada' WHERE id = $1`, [
              sesion?.["id"],
            ]),
          ),
        /sesion_mesa_cierre_segun_estado/,
      );

      await acceso.conLocal(LOCAL, (tx) =>
        tx.consulta(`DELETE FROM pagaya.sesion_mesa WHERE local_id = $1`, [LOCAL]),
      );
      await acceso.conLocal(LOCAL, (tx) =>
        tx.consulta(`DELETE FROM pagaya.comanda WHERE local_id = $1`, [LOCAL]),
      );
    });
  },
);
