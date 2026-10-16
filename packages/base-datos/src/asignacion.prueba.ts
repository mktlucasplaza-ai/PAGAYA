/**
 * Las mesas asignadas a un mesero en el turno vigente, contra PostgreSQL de
 * verdad (F1-60a).
 *
 * RF-M-01: "ver solo las mesas asignadas a él en el turno, con estado de cada
 * una". Lo que hay que demostrar, y que ningún doble en memoria puede mostrar
 * de verdad, es la conversión de zona horaria (AT-15, AT-38): la misma hora
 * UTC es "turno vigente" o no según `local.zona_horaria`, y eso solo lo
 * calcula PostgreSQL.
 *
 * El local de esta prueba usa `Etc/GMT+5` (UTC−5, sin horario de verano) en vez
 * de `America/Santiago`: con un desfase fijo, cada instante UTC de la prueba
 * cae en una hora local exacta y predecible todo el año, sin que el resultado
 * dependa de en qué fecha corre la integración continua.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { cargarConfiguracion } from "@pagaya/config";
import { relojFijo } from "@pagaya/nucleo";

import { crearAcceso, type Acceso } from "./acceso.ts";
import { mesasAsignadasAlMesero } from "./asignacion.ts";
import { migrarAmbiente } from "./postgres.ts";

const hayBaseDatos = (process.env["PAGAYA_BD_URL"] ?? "").length > 0;

const LOCAL = "cccccccc-0000-4000-8000-00000000f160";

const TELEFONO_MESERO_A = "+56903160001";
const TELEFONO_MESERO_B = "+56903160002";

// Instantes UTC elegidos para que, en `Etc/GMT+5`, caigan exactamente en:
//   12:00 — adentro del turno diurno (11:00–16:00)
//   17:00 — en ningún turno (entre el diurno y la cena)
//   20:00 — adentro de la cena (19:00–01:00, cruza medianoche)
//   00:30 — adentro de la cena, después de medianoche
const DIURNO = new Date("2026-03-10T17:00:00Z"); // 12:00 local
const ENTRE_TURNOS = new Date("2026-03-10T22:00:00Z"); // 17:00 local
const CENA = new Date("2026-03-11T01:00:00Z"); // 20:00 local (10 de marzo)
const CENA_TRAS_MEDIANOCHE = new Date("2026-03-11T05:30:00Z"); // 00:30 local (11 de marzo)

describe(
  "mesas asignadas al mesero en el turno vigente (F1-60a)",
  { skip: hayBaseDatos ? false : "sin PAGAYA_BD_URL" },
  () => {
    let acceso: Acceso;
    let meseroA: string;
    let meseroB: string;
    let mesa1: string;
    let mesa2: string;
    let mesa3: string;
    let turnoDiurno: string;
    let turnoCena: string;

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

      await acceso.entreLocales("sembrar el local de esta prueba", async (tx) => {
        await tx.consulta(
          `INSERT INTO pagaya.local (id, slug, nombre, zona_horaria)
           VALUES ($1, 'ensayo-f160a', 'Ensayo F1-60a', 'Etc/GMT+5')`,
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
      const zonaId = zona?.["id"] as string;

      const mesas = await acceso.conLocal(LOCAL, (tx) =>
        tx.consulta<{ id: string }>(
          `INSERT INTO pagaya.mesa (local_id, zona_id, numero, capacidad, qr_token)
             VALUES ($1, $2, '1', 4, 'ensayo-f160a-qr-1'),
                    ($1, $2, '2', 4, 'ensayo-f160a-qr-2'),
                    ($1, $2, '3', 4, 'ensayo-f160a-qr-3')
             RETURNING id`,
          [LOCAL, zonaId],
        ),
      );
      const idsMesas = mesas.map((f) => f["id"] as string);
      mesa1 = idsMesas[0] as string;
      mesa2 = idsMesas[1] as string;
      mesa3 = idsMesas[2] as string;

      const turnos = await acceso.conLocal(LOCAL, (tx) =>
        tx.consulta<{ id: string }>(
          `INSERT INTO pagaya.turno (local_id, slug, nombre, inicio, fin)
             VALUES ($1, 'almuerzo', 'Almuerzo', '11:00', '16:00'),
                    ($1, 'cena', 'Cena', '19:00', '01:00')
             RETURNING id`,
          [LOCAL],
        ),
      );
      const idsTurnos = turnos.map((f) => f["id"] as string);
      turnoDiurno = idsTurnos[0] as string;
      turnoCena = idsTurnos[1] as string;

      const meseros = await acceso.entreLocales("sembrar los meseros de esta prueba", (tx) =>
        tx.consulta<{ id: string }>(
          `INSERT INTO pagaya.usuario (local_id, rol, codigo, nombre_pila, telefono)
             VALUES ($1, 'mesero', 'ensayo-f160a-a', 'Ana', $2),
                    ($1, 'mesero', 'ensayo-f160a-b', 'Beto', $3)
             RETURNING id`,
          [LOCAL, TELEFONO_MESERO_A, TELEFONO_MESERO_B],
        ),
      );
      const idsMeseros = meseros.map((f) => f["id"] as string);
      meseroA = idsMeseros[0] as string;
      meseroB = idsMeseros[1] as string;

      // Mesero A: mesa 1 en el almuerzo, mesa 2 en la cena.
      // Mesero B: mesa 3, solo en la cena.
      await acceso.conLocal(LOCAL, (tx) =>
        tx.consulta(
          `INSERT INTO pagaya.asignacion (local_id, turno_id, mesa_id, mesero_id)
             VALUES ($1, $2, $3, $5),
                    ($1, $4, $6, $5),
                    ($1, $4, $7, $8)`,
          [LOCAL, turnoDiurno, mesa1, turnoCena, meseroA, mesa2, mesa3, meseroB],
        ),
      );
    });

    after(async () => {
      if (acceso === undefined) return;
      await limpiar();
      await acceso.cerrar();
    });

    test("al mediodía, el mesero A ve solo su mesa del almuerzo", async () => {
      const mesas = await mesasAsignadasAlMesero(acceso, LOCAL, meseroA, {
        reloj: relojFijo(DIURNO),
      });
      assert.deepEqual(
        mesas.map((m) => m.numero),
        ["1"],
      );
      assert.equal(mesas[0]?.turnoId, turnoDiurno);
    });

    test("entre turnos, nadie ve ninguna mesa", async () => {
      const mesas = await mesasAsignadasAlMesero(acceso, LOCAL, meseroA, {
        reloj: relojFijo(ENTRE_TURNOS),
      });
      assert.deepEqual(mesas, []);
    });

    test("en la cena, cada mesero ve solo la suya, y no la del otro turno", async () => {
      const deA = await mesasAsignadasAlMesero(acceso, LOCAL, meseroA, {
        reloj: relojFijo(CENA),
      });
      assert.deepEqual(deA.map((m) => m.numero), ["2"]);
      assert.equal(deA[0]?.turnoId, turnoCena);

      const deB = await mesasAsignadasAlMesero(acceso, LOCAL, meseroB, {
        reloj: relojFijo(CENA),
      });
      assert.deepEqual(deB.map((m) => m.numero), ["3"]);
    });

    test("la cena sigue vigente después de medianoche, en la hora del local", async () => {
      const mesas = await mesasAsignadasAlMesero(acceso, LOCAL, meseroA, {
        reloj: relojFijo(CENA_TRAS_MEDIANOCHE),
      });
      assert.deepEqual(mesas.map((m) => m.numero), ["2"]);
    });

    test("el estado de la mesa viaja con la asignación", async () => {
      await acceso.conLocal(LOCAL, (tx) =>
        tx.consulta(`UPDATE pagaya.mesa SET estado = 'ocupada' WHERE id = $1`, [mesa1]),
      );
      const mesas = await mesasAsignadasAlMesero(acceso, LOCAL, meseroA, {
        reloj: relojFijo(DIURNO),
      });
      assert.equal(mesas[0]?.estado, "ocupada");
      await acceso.conLocal(LOCAL, (tx) =>
        tx.consulta(`UPDATE pagaya.mesa SET estado = 'libre' WHERE id = $1`, [mesa1]),
      );
    });
  },
);
