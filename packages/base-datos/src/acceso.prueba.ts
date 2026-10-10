/**
 * El aislamiento por local, probado contra PostgreSQL de verdad (F1-02).
 *
 * Lo que estas pruebas tienen que demostrar, porque es lo que PRD-001 §13 pide
 * y lo que arquitectura.md AT-1 promete:
 *
 *   1. una consulta sin local fijado no ve ninguna fila;
 *   2. un local no ve, ni puede escribir, las filas de otro;
 *   3. esquivar la capa de acceso tampoco sirve: el rol que conecta ve cero
 *      filas, no las de todos.
 *
 * Las tres son afirmaciones sobre PostgreSQL, no sobre TypeScript: ninguna se
 * puede probar con un simulacro, porque lo que se está probando es justamente
 * que la base rechaza lo que el código podría dejar pasar. Por eso se omiten
 * sin `PAGAYA_BD_URL` —diciéndolo en voz alta— y la integración continua pone
 * `PAGAYA_EXIGIR_BD=1` (arquitectura.md §8.5).
 *
 * La tabla `pagaya.ensayo_aislamiento` la crea y la borra esta prueba: F1-02 no
 * trae tablas de negocio —mesa, comanda y pago son F1-10, F1-40 y la Fase 2—,
 * así que lo que se verifica es el mecanismo que todas ellas van a usar.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { cargarConfiguracion } from "@pagaya/config";
import { ErrorPagaya } from "@pagaya/nucleo";
import type { Pool } from "pg";

import { crearAcceso, type Acceso } from "./acceso.ts";
import { aplicarMigraciones, listarMigraciones } from "./migraciones.ts";
import * as paquete from "./index.ts";
import { crearPool, liberarCerrojoMigraciones, registroPostgres } from "./postgres.ts";

const hayBaseDatos = (process.env["PAGAYA_BD_URL"] ?? "").length > 0;

const NORTE = "aaaaaaaa-0000-4000-8000-00000000f102";
const SUR = "bbbbbbbb-0000-4000-8000-00000000f102";

function configuracion() {
  return cargarConfiguracion({ ambiente: process.env["PAGAYA_AMBIENTE"] ?? "dev" });
}

// ---------------------------------------------------------------------------
// Lo que se puede afirmar sin base de datos: la forma de la capa.
// ---------------------------------------------------------------------------

describe("la capa de acceso", () => {
  const config = cargarConfiguracion({
    ambiente: "dev",
    entorno: {
      PAGAYA_BD_URL: "postgres://pagaya:de-mentira@localhost:5432/pagaya_prueba",
      PAGAYA_FIRMA_SESION: "de-mentira",
    },
  });

  test("el paquete no deja salir el pool ni el cliente de pg", () => {
    // Si alguien exportara `crearPool` acá, la capa dejaría de ser única: se
    // podría consultar la base sin decir desde qué local se mira.
    assert.deepEqual(
      Object.keys(paquete).sort(),
      [
        "aplicarMigraciones",
        "crearAcceso",
        "directorioMigraciones",
        "leerCarta",
        "listarMigraciones",
        "migrarAmbiente",
      ],
      "packages/base-datos/src/index.ts solo expone la capa de acceso y las migraciones",
    );
  });

  test("un identificador de local que no es un UUID no abre transacción", async () => {
    const acceso = crearAcceso(config);
    try {
      await assert.rejects(
        () => acceso.conLocal("12; DROP TABLE pagaya.local", async () => undefined),
        (error: unknown) =>
          error instanceof ErrorPagaya && error.codigo === "acceso_invalido",
      );
    } finally {
      await acceso.cerrar();
    }
  });

  test("cruzar de local sin motivo escrito no se puede", async () => {
    const acceso = crearAcceso(config);
    try {
      await assert.rejects(
        () => acceso.entreLocales("   ", async () => undefined),
        (error: unknown) =>
          error instanceof ErrorPagaya && error.codigo === "acceso_invalido",
      );
    } finally {
      await acceso.cerrar();
    }
  });

  test("el motivo del cruce se le entrega a quien lleve la constancia", async () => {
    const anotados: string[] = [];
    const acceso = crearAcceso(config, { anotarCruce: (m) => anotados.push(m) });
    try {
      await acceso.entreLocales("carga inicial del local piloto (F1-05)", async () => undefined);
    } catch {
      // No hay base de datos en esta prueba: lo que importa es que el motivo
      // se haya anotado antes de intentar conectarse.
    } finally {
      await acceso.cerrar();
    }
    assert.deepEqual(anotados, ["carga inicial del local piloto (F1-05)"]);
  });
});

// ---------------------------------------------------------------------------
// Lo que solo puede afirmar PostgreSQL.
// ---------------------------------------------------------------------------

describe("aislamiento por local", { skip: hayBaseDatos ? false : "sin PAGAYA_BD_URL" }, () => {
  let acceso: Acceso;
  let pool: Pool;

  /**
   * Crear y borrar tablas no es trabajo de la aplicación: `pagaya_app` tiene
   * USAGE sobre el esquema y permisos sobre las tablas, no CREATE. El andamio
   * de esta prueba corre como el rol que conecta, igual que una migración.
   */
  async function comoDueno(sql: string, parametros: readonly unknown[] = []): Promise<void> {
    await pool.query(sql, parametros as unknown[]);
  }

  before(async () => {
    const config = configuracion();
    pool = crearPool(config);

    // Las migraciones primero, y se suelta el cerrojo enseguida: otro archivo
    // de pruebas corre en paralelo y también las aplica.
    const cliente = await pool.connect();
    try {
      await aplicarMigraciones(registroPostgres(cliente), listarMigraciones());
    } finally {
      await liberarCerrojoMigraciones(cliente).catch(() => undefined);
      cliente.release();
    }

    acceso = crearAcceso(config);

    await comoDueno(`DROP TABLE IF EXISTS pagaya.ensayo_aislamiento`);
    await comoDueno(`
      CREATE TABLE pagaya.ensayo_aislamiento (
        id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        local_id uuid NOT NULL REFERENCES pagaya.local(id) ON DELETE CASCADE,
        nota     text NOT NULL
      )
    `);
    await comoDueno(`SELECT pagaya.activar_aislamiento('pagaya.ensayo_aislamiento')`);

    await acceso.entreLocales("sembrar los dos locales de esta prueba", async (tx) => {
      await tx.consulta(`DELETE FROM pagaya.local WHERE id IN ($1, $2)`, [NORTE, SUR]);
      await tx.consulta(
        `INSERT INTO pagaya.local (id, nombre, zona_horaria) VALUES ($1, $2, $3), ($4, $5, $6)`,
        [NORTE, "Ensayo Norte", "America/Santiago", SUR, "Ensayo Sur", "Pacific/Easter"],
      );
      await tx.consulta(
        `INSERT INTO pagaya.ensayo_aislamiento (local_id, nota) VALUES ($1, $2), ($3, $4)`,
        [NORTE, "mesa 12 del norte", SUR, "mesa 3 del sur"],
      );
    });
  });

  after(async () => {
    if (acceso !== undefined) {
      await acceso.entreLocales("limpiar lo que montó esta prueba", (tx) =>
        tx.consulta(`DELETE FROM pagaya.local WHERE id IN ($1, $2)`, [NORTE, SUR]),
      );
      await acceso.cerrar();
    }
    if (pool !== undefined) {
      await comoDueno(`DROP TABLE IF EXISTS pagaya.ensayo_aislamiento`);
      await comoDueno(`DROP TABLE IF EXISTS pagaya.ensayo_olvidada`);
      await pool.end();
    }
  });

  test("el rol que conecta no es superusuario, o nada de esto es cierto", async () => {
    const fila = await acceso.sinLocal((tx) =>
      tx.una<{ superusuario: string }>(
        `SELECT current_setting('is_superuser') AS superusuario`,
      ),
    );
    assert.equal(
      fila?.superusuario,
      "off",
      "un superusuario esquiva la row level security entera: el alta de la base " +
        "tiene que crear un rol de servicio sin superusuario (ver .env.ejemplo)",
    );
  });

  test("una consulta sin local no ve ninguna fila", async () => {
    const filas = await acceso.sinLocal((tx) =>
      tx.consulta(`SELECT nota FROM pagaya.ensayo_aislamiento`),
    );
    assert.deepEqual(filas, []);

    const locales = await acceso.sinLocal((tx) => tx.consulta(`SELECT nombre FROM pagaya.local`));
    assert.deepEqual(locales, []);
  });

  test("un local no ve las filas de otro", async () => {
    const norte = await acceso.conLocal(NORTE, (tx) =>
      tx.consulta<{ nota: string }>(`SELECT nota FROM pagaya.ensayo_aislamiento`),
    );
    assert.deepEqual(norte.map((f) => f.nota), ["mesa 12 del norte"]);

    const sur = await acceso.conLocal(SUR, (tx) =>
      tx.consulta<{ nota: string }>(`SELECT nota FROM pagaya.ensayo_aislamiento`),
    );
    assert.deepEqual(sur.map((f) => f.nota), ["mesa 3 del sur"]);
  });

  test("un local tampoco se ve a sí mismo en la tabla de locales ajenos", async () => {
    const filas = await acceso.conLocal(NORTE, (tx) =>
      tx.consulta<{ nombre: string }>(`SELECT nombre FROM pagaya.local`),
    );
    assert.deepEqual(filas.map((f) => f.nombre), ["Ensayo Norte"]);
  });

  test("un local no puede escribir una fila de otro", async () => {
    await assert.rejects(
      () =>
        acceso.conLocal(NORTE, (tx) =>
          tx.consulta(`INSERT INTO pagaya.ensayo_aislamiento (local_id, nota) VALUES ($1, $2)`, [
            SUR,
            "infiltrada",
          ]),
        ),
      /row-level security|seguridad a nivel de registro/i,
    );

    // Y la transacción no dejó nada a medias.
    const sur = await acceso.conLocal(SUR, (tx) =>
      tx.consulta(`SELECT nota FROM pagaya.ensayo_aislamiento`),
    );
    assert.equal(sur.length, 1);
  });

  test("un local no puede mudar una fila suya al local de al lado", async () => {
    await assert.rejects(
      () =>
        acceso.conLocal(NORTE, (tx) =>
          tx.consulta(`UPDATE pagaya.ensayo_aislamiento SET local_id = $1`, [SUR]),
        ),
      /row-level security|seguridad a nivel de registro/i,
    );
  });

  test("un local no puede darse de alta a sí mismo ni dar de alta a otro", async () => {
    await assert.rejects(
      () =>
        acceso.conLocal(NORTE, (tx) =>
          tx.consulta(`INSERT INTO pagaya.local (nombre, zona_horaria) VALUES ($1, $2)`, [
            "Local inventado",
            "America/Santiago",
          ]),
        ),
      /row-level security|seguridad a nivel de registro/i,
    );
  });

  test("un local se configura a sí mismo y solo a sí mismo", async () => {
    // RF-A-07, RF-A-09 y RF-A-12 son del administrador de ese local. Quién,
    // dentro del local, tiene derecho a hacerlo es F1-03, no esta capa.
    const propias = await acceso.conLocal(NORTE, (tx) =>
      tx.consulta<{ nombre: string }>(
        `UPDATE pagaya.local SET configuracion = configuracion || '{"ensayo": true}'::jsonb
         RETURNING nombre`,
      ),
    );
    assert.deepEqual(propias.map((f) => f.nombre), ["Ensayo Norte"]);

    // El UPDATE no ve la fila del otro local, así que no toca nada.
    const ajenas = await acceso.conLocal(NORTE, (tx) =>
      tx.consulta(`UPDATE pagaya.local SET activo = false WHERE id = $1 RETURNING id`, [SUR]),
    );
    assert.deepEqual(ajenas, []);

    const sur = await acceso.conLocal(SUR, (tx) =>
      tx.una<{ activo: boolean }>(`SELECT activo FROM pagaya.local`),
    );
    assert.equal(sur?.activo, true);
  });

  test("un local no puede mudarse la identidad al id de otro", async () => {
    await assert.rejects(
      () =>
        acceso.conLocal(NORTE, (tx) =>
          tx.consulta(`UPDATE pagaya.local SET id = $1`, [
            "cccccccc-0000-4000-8000-00000000f102",
          ]),
        ),
      /row-level security|seguridad a nivel de registro/i,
    );
  });

  test("esquivar la capa de acceso devuelve cero filas, no las de todos", async () => {
    // Esto es lo que hace FORCE ROW LEVEL SECURITY: el rol que conecta, que es
    // además el dueño del esquema, queda sujeto a la misma política. Si alguna
    // vez alguien consulta sin pasar por `conLocal`, el síntoma es una lista
    // vacía —que se nota— y no una fuga entre locales —que no se nota.
    const { rows } = await pool.query(`SELECT nota FROM pagaya.ensayo_aislamiento`);
    assert.deepEqual(rows, []);
  });

  test("toda tabla de negocio del esquema está aislada", async () => {
    // La guardia es una herramienta del esquema, no de la aplicación: la corre
    // el rol que migra. `pagaya_app` ni siquiera puede leer la lista de
    // excepciones, que es lo correcto.
    const { rows } = await pool.query(`SELECT * FROM pagaya.tablas_sin_aislamiento()`);
    assert.deepEqual(
      rows,
      [],
      "una tabla sin local_id o sin row level security es una fuga esperando a que haya dos locales; " +
        "si la excepción es deliberada, va con su motivo en pagaya.tabla_sin_local",
    );
  });

  test("la guardia encuentra una tabla que se olvidó de aislarse", async () => {
    // Si la guardia solo supiera decir que está todo bien, no serviría de nada.
    await comoDueno(`
      CREATE TABLE pagaya.ensayo_olvidada (
        id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        local_id uuid NOT NULL REFERENCES pagaya.local(id)
      )
    `);
    try {
      const { rows } = await pool.query(`SELECT * FROM pagaya.tablas_sin_aislamiento()`);
      assert.deepEqual(rows, [
        { tabla: "ensayo_olvidada", motivo: "row level security apagada" },
      ]);

      await comoDueno(`SELECT pagaya.activar_aislamiento('pagaya.ensayo_olvidada')`);
      const despues = await pool.query(`SELECT * FROM pagaya.tablas_sin_aislamiento()`);
      assert.deepEqual(despues.rows, []);
    } finally {
      await comoDueno(`DROP TABLE IF EXISTS pagaya.ensayo_olvidada`);
    }
  });

  test("activar_aislamiento rechaza una tabla sin local_id", async () => {
    const cliente = await pool.connect();
    try {
      await cliente.query("BEGIN");
      await cliente.query(`CREATE TABLE pagaya.ensayo_sin_local (id uuid PRIMARY KEY)`);
      await assert.rejects(
        () => cliente.query(`SELECT pagaya.activar_aislamiento('pagaya.ensayo_sin_local')`),
        /local_id uuid NOT NULL/,
      );
    } finally {
      await cliente.query("ROLLBACK");
      cliente.release();
    }
    const { rows } = await pool.query(`SELECT to_regclass('pagaya.ensayo_sin_local') AS clase`);
    assert.deepEqual(rows, [{ clase: null }]);
  });

  test("la zona horaria del local se valida al escribirla", async () => {
    await assert.rejects(
      () =>
        acceso.entreLocales("comprobar el CHECK de zona horaria", (tx) =>
          tx.consulta(`INSERT INTO pagaya.local (nombre, zona_horaria) VALUES ($1, $2)`, [
            "Local con zona inventada",
            "America/Valparaíso",
          ]),
        ),
      /zona_horaria/,
    );
  });

  test("el día del local lo decide su zona horaria, no la del servidor", async () => {
    // Las 02:30 UTC del 1 de enero son todavía el 31 de diciembre en Santiago.
    // De esto dependen "máximo una visita por día por local" (PRD-001 §8) y
    // "ventas del día" (RF-A-06).
    const fila = await acceso.conLocal(NORTE, (tx) =>
      tx.una<{ dia: string }>(`SELECT pagaya.fecha_local($1, $2::timestamptz)::text AS dia`, [
        NORTE,
        "2026-01-01T02:30:00Z",
      ]),
    );
    assert.equal(fila?.dia, "2025-12-31");
  });

  test("una transacción guardada y usada después no sirve de puerta trasera", async () => {
    const fugada = await acceso.conLocal(NORTE, async (tx) => tx);
    await assert.rejects(
      () => fugada.consulta(`SELECT 1`),
      (error: unknown) => error instanceof ErrorPagaya && error.codigo === "acceso_invalido",
    );
  });
});
