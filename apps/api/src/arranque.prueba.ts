/**
 * La prueba que F1-01 debe pasar: **la fundación arranca**.
 *
 * No prueba ninguna regla de negocio, porque todavía no hay ninguna. Prueba lo
 * que la tarea entrega: que el ambiente se carga, que los siete módulos de
 * arquitectura.md AT-1 se resuelven a través de su frontera, que el proceso
 * escucha en un puerto y que responde el contrato que comparte con los
 * clientes.
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cargarConfiguracion, type Configuracion } from "@pagaya/config";
import { RUTA_SALUD, VERSION_CONTRATO, type RespuestaSalud } from "@pagaya/contrato";
import { relojFijo } from "@pagaya/nucleo";

import { MODULOS, crearServidor } from "./servidor.ts";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const INSTANTE = new Date("2026-10-04T21:30:00.000Z");

function configuracionDePrueba(): Configuracion {
  return cargarConfiguracion({
    ambiente: "dev",
    raiz: RAIZ,
    entorno: {
      PAGAYA_BD_URL: "postgres://pagaya:de-mentira@localhost:5432/pagaya_prueba",
      PAGAYA_FIRMA_SESION: "de-mentira",
    },
  });
}

describe("la fundación arranca", () => {
  let base: string;
  const servidor = crearServidor(configuracionDePrueba(), { reloj: relojFijo(INSTANTE) });

  before(async () => {
    await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", listo));
    const direccion = servidor.address() as AddressInfo;
    base = `http://127.0.0.1:${direccion.port}`;
  });

  after(async () => {
    await new Promise<void>((listo) => servidor.close(() => listo()));
  });

  test("los siete módulos de AT-1 están montados", () => {
    assert.deepEqual(
      [...MODULOS].map((m) => m.nombre).sort(),
      ["auditoria", "comanda", "fidelizacion", "identidad", "mesa", "notificacion", "pago"],
    );
  });

  test("responde /salud con el ambiente, la versión del contrato y la hora", async () => {
    const respuesta = await fetch(`${base}${RUTA_SALUD}`);
    assert.equal(respuesta.status, 200);
    const cuerpo = (await respuesta.json()) as RespuestaSalud;
    assert.deepEqual(cuerpo, {
      ambiente: "dev",
      contrato: VERSION_CONTRATO,
      ahora: INSTANTE.toISOString(),
    });
  });

  test("una ruta que no existe responde 404, no 500", async () => {
    const respuesta = await fetch(`${base}/no-existe`);
    assert.equal(respuesta.status, 404);
  });

  test("solo los orígenes del ambiente reciben el encabezado de CORS", async () => {
    const permitido = await fetch(`${base}${RUTA_SALUD}`, {
      headers: { origin: "http://localhost:5173" },
    });
    assert.equal(permitido.headers.get("access-control-allow-origin"), "http://localhost:5173");

    const ajeno = await fetch(`${base}${RUTA_SALUD}`, {
      headers: { origin: "https://sitio-ajeno.cl" },
    });
    assert.equal(ajeno.headers.get("access-control-allow-origin"), null);
  });

  test("el proceso no arranca con un ambiente sin secretos", () => {
    assert.throws(() => cargarConfiguracion({ ambiente: "dev", raiz: RAIZ, entorno: {} }));
  });
});
