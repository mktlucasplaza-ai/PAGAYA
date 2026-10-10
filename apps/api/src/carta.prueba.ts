/**
 * F1-30a: pedir la carta sin sesión devuelve las categorías y productos del
 * local (RF-C-03 mod., RF-C-24). La ruta no pide ni acepta credenciales: es
 * justo lo que PRD-004 §2.2 exige — "explorar nunca exige identidad".
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";

import { crearAcceso, migrarAmbiente, type Acceso } from "@pagaya/base-datos";
import { cargarConfiguracion, type Configuracion } from "@pagaya/config";

import { crearServidor } from "./servidor.ts";

const hayBaseDatos = (process.env["PAGAYA_BD_URL"] ?? "").length > 0;

const LOCAL = "cccccccc-0000-4000-8000-0000000030a1";

function configuracionDePrueba(): Configuracion {
  return cargarConfiguracion({
    ambiente: process.env["PAGAYA_AMBIENTE"] ?? "dev",
    entorno: {
      PAGAYA_BD_URL: process.env["PAGAYA_BD_URL"] ?? "",
      PAGAYA_FIRMA_SESION: "de-mentira",
    },
  });
}

describe("GET /locales/:id/carta, sin sesión", { skip: hayBaseDatos ? false : "sin PAGAYA_BD_URL" }, () => {
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
         VALUES ($1, 'ensayo-f130a', 'Ensayo F1-30a', 'America/Santiago')`,
        [LOCAL],
      );
    });
    await acceso.conLocal(LOCAL, async (tx) => {
      const [entradas] = await tx.consulta<{ id: string }>(
        `INSERT INTO pagaya.categoria (local_id, slug, nombre, orden)
         VALUES ($1, 'entradas', 'Entradas', 1) RETURNING id`,
        [LOCAL],
      );
      await tx.consulta(
        `INSERT INTO pagaya.producto
           (local_id, categoria_id, sku, nombre, descripcion, precio, disponible, orden)
         VALUES
           ($1, $2, 'empanada-pino', 'Empanada de pino', 'Con aceituna y huevo', 2500, true, 1),
           ($1, $2, 'sopaipilla', 'Sopaipilla', 'Con pebre', 900, false, 2)`,
        [LOCAL, entradas?.id],
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

  test("sin ningún encabezado de sesión, devuelve las categorías y productos del local", async () => {
    const respuesta = await fetch(`${base}/locales/${LOCAL}/carta`);
    assert.equal(respuesta.status, 200);
    const cuerpo = (await respuesta.json()) as {
      categorias: readonly {
        slug: string;
        nombre: string;
        productos: readonly { sku: string; disponible: boolean; precio: number }[];
      }[];
    };

    assert.deepEqual(
      cuerpo.categorias.map((c) => ({
        slug: c.slug,
        nombre: c.nombre,
        productos: c.productos.map((p) => ({
          sku: p.sku,
          disponible: p.disponible,
          precio: p.precio,
        })),
      })),
      [
        {
          slug: "entradas",
          nombre: "Entradas",
          productos: [
            { sku: "empanada-pino", disponible: true, precio: 2500 },
            { sku: "sopaipilla", disponible: false, precio: 900 },
          ],
        },
      ],
    );
  });

  test("un id de local que no es un uuid responde 400, no 500", async () => {
    const respuesta = await fetch(`${base}/locales/no-es-un-uuid/carta`);
    assert.equal(respuesta.status, 400);
  });

  test("un local sin filas devuelve la carta vacía, no un error", async () => {
    const respuesta = await fetch(`${base}/locales/00000000-0000-4000-8000-000000000000/carta`);
    assert.equal(respuesta.status, 200);
    assert.deepEqual(await respuesta.json(), { categorias: [] });
  });
});
