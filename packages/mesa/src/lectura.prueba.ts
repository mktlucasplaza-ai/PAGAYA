/**
 * F1-10c: `leerEstadoMesa` lee lo que `pagaya.mesa` y `pagaya.sesion_mesa`
 * (migración 0004) ya tienen escrito, para una mesa abierta y una cerrada.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { accesoDelAmbiente, type Acceso } from "@pagaya/base-datos";
import { ErrorPagaya } from "@pagaya/nucleo";

import { leerEstadoMesa } from "./lectura.ts";

const hayBaseDatos = (process.env["PAGAYA_BD_URL"] ?? "").length > 0;

const LOCAL = "dddddddd-0000-4000-8000-0000000010c1";
const ZONA = "dddddddd-0000-4000-8000-0000000010c2";
const MESA_ABIERTA = "dddddddd-0000-4000-8000-0000000010c3";
const MESA_CERRADA = "dddddddd-0000-4000-8000-0000000010c4";
const MESA_SIN_SESION = "dddddddd-0000-4000-8000-0000000010c5";

describe("leerEstadoMesa", { skip: hayBaseDatos ? false : "sin PAGAYA_BD_URL" }, () => {
  let acceso: Acceso;

  async function limpiar(): Promise<void> {
    await acceso.entreLocales("limpiar lo que montó esta prueba", async (tx) => {
      await tx.consulta(`DELETE FROM pagaya.local WHERE id = $1`, [LOCAL]);
    });
  }

  before(async () => {
    acceso = await accesoDelAmbiente();
    await limpiar();

    await acceso.entreLocales("sembrar el local de esta prueba", async (tx) => {
      await tx.consulta(
        `INSERT INTO pagaya.local (id, slug, nombre, zona_horaria)
         VALUES ($1, 'ensayo-f110c', 'Ensayo F1-10c', 'America/Santiago')`,
        [LOCAL],
      );
    });

    await acceso.conLocal(LOCAL, async (tx) => {
      await tx.consulta(
        `INSERT INTO pagaya.zona (id, local_id, slug, nombre) VALUES ($1, $2, 'salon', 'Salón')`,
        [ZONA, LOCAL],
      );
      await tx.consulta(
        `INSERT INTO pagaya.mesa (id, local_id, zona_id, numero, capacidad, qr_token, estado)
         VALUES
           ($1, $2, $3, '1', 4, 'qr-token-f110c-abierta', 'ocupada'),
           ($4, $2, $3, '2', 4, 'qr-token-f110c-cerrada', 'libre'),
           ($5, $2, $3, '3', 4, 'qr-token-f110c-sin-sesion', 'libre')`,
        [MESA_ABIERTA, LOCAL, ZONA, MESA_CERRADA, MESA_SIN_SESION],
      );

      const [comandaAbierta] = await tx.consulta<{ id: string }>(
        `INSERT INTO pagaya.comanda (local_id, mesa_id, estado) VALUES ($1, $2, 'abierta') RETURNING id`,
        [LOCAL, MESA_ABIERTA],
      );
      const [comandaCerrada] = await tx.consulta<{ id: string }>(
        `INSERT INTO pagaya.comanda (local_id, mesa_id, estado) VALUES ($1, $2, 'pagada') RETURNING id`,
        [LOCAL, MESA_CERRADA],
      );

      await tx.consulta(
        `INSERT INTO pagaya.sesion_mesa (local_id, mesa_id, comanda_id, estado)
         VALUES ($1, $2, $3, 'abierta')`,
        [LOCAL, MESA_ABIERTA, comandaAbierta?.id],
      );
      await tx.consulta(
        `INSERT INTO pagaya.sesion_mesa (local_id, mesa_id, comanda_id, estado, cerrada_en)
         VALUES ($1, $2, $3, 'cerrada', now())`,
        [LOCAL, MESA_CERRADA, comandaCerrada?.id],
      );
    });
  });

  after(async () => {
    await limpiar();
    await acceso.cerrar();
  });

  test("una mesa ocupada con sesión abierta", async () => {
    const leido = await leerEstadoMesa(acceso, LOCAL, MESA_ABIERTA);
    assert.ok(leido !== null);
    assert.equal(leido.estado, "ocupada");
    assert.ok(leido.sesion !== null);
    assert.equal(leido.sesion.estado, "abierta");
    assert.equal(leido.sesion.cerradaEn, null);
  });

  test("una mesa libre con sesión cerrada", async () => {
    const leido = await leerEstadoMesa(acceso, LOCAL, MESA_CERRADA);
    assert.ok(leido !== null);
    assert.equal(leido.estado, "libre");
    assert.ok(leido.sesion !== null);
    assert.equal(leido.sesion.estado, "cerrada");
    assert.ok(leido.sesion.cerradaEn instanceof Date);
  });

  test("una mesa que nunca tuvo sesión", async () => {
    const leido = await leerEstadoMesa(acceso, LOCAL, MESA_SIN_SESION);
    assert.ok(leido !== null);
    assert.equal(leido.estado, "libre");
    assert.equal(leido.sesion, null);
  });

  test("una mesa que no existe en el local devuelve null", async () => {
    const leido = await leerEstadoMesa(acceso, LOCAL, "00000000-0000-4000-8000-000000000000");
    assert.equal(leido, null);
  });

  test("un id de mesa que no es un uuid se rechaza, no se manda a PostgreSQL", async () => {
    await assert.rejects(
      () => leerEstadoMesa(acceso, LOCAL, "no-es-un-uuid"),
      (error: unknown) => error instanceof ErrorPagaya && error.codigo === "acceso_invalido",
    );
  });
});
