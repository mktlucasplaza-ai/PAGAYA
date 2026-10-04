/**
 * Prueba de integración contra PostgreSQL de verdad.
 *
 * Se omite si no hay `PAGAYA_BD_URL`, y falla si falta cuando
 * `PAGAYA_EXIGIR_BD=1`. La integración continua pone las dos cosas, así que en
 * CI esto **no se puede** omitir; en una máquina sin PostgreSQL, `make verify`
 * sigue corriendo y dice en voz alta qué se saltó. Ver docs/arquitectura.md §8.4.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { cargarConfiguracion } from "@pagaya/config";
import type { Pool, PoolClient } from "pg";

import { aplicarMigraciones, listarMigraciones } from "./migraciones.ts";
import { crearPool, liberarCerrojoMigraciones, registroPostgres } from "./postgres.ts";

const hayBaseDatos = (process.env["PAGAYA_BD_URL"] ?? "").length > 0;
const exigida = process.env["PAGAYA_EXIGIR_BD"] === "1";

describe("postgres", { skip: hayBaseDatos ? false : "sin PAGAYA_BD_URL" }, () => {
  let pool: Pool;
  let cliente: PoolClient;

  before(async () => {
    const config = cargarConfiguracion({ ambiente: process.env["PAGAYA_AMBIENTE"] ?? "dev" });
    pool = crearPool(config);
    cliente = await pool.connect();
  });

  after(async () => {
    if (cliente !== undefined) {
      await liberarCerrojoMigraciones(cliente).catch(() => undefined);
      cliente.release();
    }
    if (pool !== undefined) await pool.end();
  });

  test("las migraciones se aplican y quedan registradas", async () => {
    const migraciones = listarMigraciones();
    await aplicarMigraciones(registroPostgres(cliente), migraciones);

    const { rows } = await cliente.query<{ nombre: string; huella: string }>(
      `SELECT nombre, huella FROM pagaya.migracion ORDER BY nombre`,
    );
    assert.deepEqual(
      rows.map((f) => f.nombre),
      migraciones.map((m) => m.nombre),
    );
    assert.deepEqual(
      rows.map((f) => f.huella),
      migraciones.map((m) => m.huella),
    );
  });

  test("aplicarlas de nuevo no hace nada", async () => {
    const informe = await aplicarMigraciones(registroPostgres(cliente), listarMigraciones());
    assert.deepEqual(informe.aplicadas, []);
  });

  test("el esquema pagaya existe y la fundación no dejó tablas de negocio", async () => {
    const { rows } = await cliente.query<{ nombre: string }>(
      `SELECT table_name AS nombre FROM information_schema.tables WHERE table_schema = 'pagaya'`,
    );
    assert.deepEqual(
      rows.map((f) => f.nombre).sort(),
      ["migracion"],
      "F1-01 no trae modelo de datos: las tablas de negocio llegan con F1-02",
    );
  });
});

test("la base de datos es obligatoria en integración continua", { skip: exigida ? false : "PAGAYA_EXIGIR_BD distinto de 1" }, () => {
  assert.ok(
    hayBaseDatos,
    "PAGAYA_EXIGIR_BD=1 pide PostgreSQL de verdad y no hay PAGAYA_BD_URL",
  );
});
