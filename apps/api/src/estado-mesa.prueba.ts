/**
 * F1-10c: `GET /locales/:local/mesas/:mesa/estado` devuelve el estado
 * correcto para una mesa abierta y una cerrada (RF, PRD-001 §15).
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";

import { crearAcceso, migrarAmbiente, type Acceso } from "@pagaya/base-datos";
import { cargarConfiguracion, type Configuracion } from "@pagaya/config";
import { rutaEstadoMesa, type RespuestaEstadoMesa } from "@pagaya/contrato";

import { crearServidor } from "./servidor.ts";

const hayBaseDatos = (process.env["PAGAYA_BD_URL"] ?? "").length > 0;

const LOCAL = "eeeeeeee-0000-4000-8000-0000000010c1";
const ZONA = "eeeeeeee-0000-4000-8000-0000000010c2";
const MESA_ABIERTA = "eeeeeeee-0000-4000-8000-0000000010c3";
const MESA_CERRADA = "eeeeeeee-0000-4000-8000-0000000010c4";

function configuracionDePrueba(): Configuracion {
  return cargarConfiguracion({
    ambiente: process.env["PAGAYA_AMBIENTE"] ?? "dev",
    entorno: {
      PAGAYA_BD_URL: process.env["PAGAYA_BD_URL"] ?? "",
      PAGAYA_FIRMA_SESION: "de-mentira",
    },
  });
}

describe(
  "GET /locales/:local/mesas/:mesa/estado",
  { skip: hayBaseDatos ? false : "sin PAGAYA_BD_URL" },
  () => {
    let acceso: Acceso;
    let base: string;
    let servidor: ReturnType<typeof crearServidor>;

    async function limpiar(): Promise<void> {
      await acceso.entreLocales("limpiar lo que montó esta prueba", async (tx) => {
        await tx.consulta(`DELETE FROM pagaya.local WHERE id = $1`, [LOCAL]);
      });
    }

    before(async () => {
      const config = configuracionDePrueba();
      await migrarAmbiente(config);
      acceso = crearAcceso(config);
      await limpiar();

      await acceso.entreLocales("sembrar el local de esta prueba", async (tx) => {
        await tx.consulta(
          `INSERT INTO pagaya.local (id, slug, nombre, zona_horaria)
           VALUES ($1, 'ensayo-f110c-api', 'Ensayo F1-10c API', 'America/Santiago')`,
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
             ($1, $2, $3, '1', 4, 'qr-token-f110c-api-abierta', 'ocupada'),
             ($4, $2, $3, '2', 4, 'qr-token-f110c-api-cerrada', 'libre')`,
          [MESA_ABIERTA, LOCAL, ZONA, MESA_CERRADA],
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

      servidor = crearServidor(config, { acceso });
      await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
      const direccion = servidor.address() as AddressInfo;
      base = `http://127.0.0.1:${direccion.port}`;
    });

    after(async () => {
      await new Promise<void>((listo) => servidor.close(() => listo()));
      await limpiar();
      await acceso.cerrar();
    });

    test("una mesa ocupada con sesión abierta", async () => {
      const respuesta = await fetch(`${base}${rutaEstadoMesa(LOCAL, MESA_ABIERTA)}`);
      assert.equal(respuesta.status, 200);
      const cuerpo = (await respuesta.json()) as RespuestaEstadoMesa;
      assert.equal(cuerpo.estado, "ocupada");
      assert.ok(cuerpo.sesion !== null);
      assert.equal(cuerpo.sesion.estado, "abierta");
      assert.equal(cuerpo.sesion.cerradaEn, null);
    });

    test("una mesa libre con sesión cerrada", async () => {
      const respuesta = await fetch(`${base}${rutaEstadoMesa(LOCAL, MESA_CERRADA)}`);
      assert.equal(respuesta.status, 200);
      const cuerpo = (await respuesta.json()) as RespuestaEstadoMesa;
      assert.equal(cuerpo.estado, "libre");
      assert.ok(cuerpo.sesion !== null);
      assert.equal(cuerpo.sesion.estado, "cerrada");
      assert.equal(typeof cuerpo.sesion.cerradaEn, "string");
    });

    test("una mesa que no existe responde 404", async () => {
      const respuesta = await fetch(
        `${base}${rutaEstadoMesa(LOCAL, "00000000-0000-4000-8000-000000000000")}`,
      );
      assert.equal(respuesta.status, 404);
    });

    test("un id de mesa que no es un uuid responde 400, no 500", async () => {
      const respuesta = await fetch(`${base}${rutaEstadoMesa(LOCAL, "no-es-un-uuid")}`);
      assert.equal(respuesta.status, 400);
    });
  },
);
