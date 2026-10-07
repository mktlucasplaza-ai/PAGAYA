/**
 * El lado PostgreSQL: el pool y la implementación del puerto de migraciones.
 * Es el único archivo del repositorio que importa el controlador `pg`, para que
 * cambiarlo sea un archivo y no una búsqueda.
 */
import { Pool, type PoolClient } from "pg";

import type { Configuracion } from "@pagaya/config";

import {
  aplicarMigraciones,
  listarMigraciones,
  type Informe,
  type Migracion,
  type MigracionAplicada,
  type RegistroMigraciones,
} from "./migraciones.ts";

export function crearPool(config: Configuracion): Pool {
  return new Pool({
    connectionString: config.baseDatos.url.revelar(),
    max: config.baseDatos.maxConexiones,
    ssl: config.baseDatos.ssl ? { rejectUnauthorized: true } : false,
    application_name: `pagaya-${config.ambiente}`,
  });
}

/** Clave arbitraria pero fija del cerrojo de asesoría que serializa las migraciones. */
const CERROJO_MIGRACIONES = 8_312_001;

/**
 * Registro de migraciones sobre PostgreSQL.
 *
 * Dos cosas que no son obvias:
 *
 * - El cerrojo de asesoría (`pg_advisory_lock`) impide que dos procesos que
 *   arrancan juntos apliquen la misma migración dos veces. En un despliegue con
 *   dos procesos (AT-1: API y repartidor) eso no es hipotético.
 * - Cada migración corre con su registro en **una** transacción. Si el SQL
 *   falla, no queda registrada; si el registro falla, el SQL se revierte.
 */
export function registroPostgres(cliente: PoolClient): RegistroMigraciones {
  return {
    async asegurarRegistro(): Promise<void> {
      await cliente.query(`SELECT pg_advisory_lock($1)`, [CERROJO_MIGRACIONES]);
      await cliente.query(`CREATE SCHEMA IF NOT EXISTS pagaya`);
      await cliente.query(`
        CREATE TABLE IF NOT EXISTS pagaya.migracion (
          nombre      text        PRIMARY KEY,
          huella      text        NOT NULL,
          aplicada_en timestamptz NOT NULL DEFAULT now()
        )
      `);
      await cliente.query(`
        COMMENT ON TABLE pagaya.migracion IS
          'Qué migración se aplicó y con qué contenido. La huella es sha256 del archivo.'
      `);
    },

    async aplicadas(): Promise<MigracionAplicada[]> {
      const { rows } = await cliente.query<{ nombre: string; huella: string }>(
        `SELECT nombre, huella FROM pagaya.migracion ORDER BY nombre`,
      );
      return rows.map((f) => ({ nombre: f.nombre, huella: f.huella }));
    },

    async aplicar(migracion: Migracion): Promise<void> {
      try {
        await cliente.query("BEGIN");
        await cliente.query(migracion.sql);
        await cliente.query(
          `INSERT INTO pagaya.migracion (nombre, huella) VALUES ($1, $2)`,
          [migracion.nombre, migracion.huella],
        );
        await cliente.query("COMMIT");
      } catch (causa) {
        await cliente.query("ROLLBACK");
        throw causa;
      }
    },
  };
}

/** Suelta el cerrojo que tomó `asegurarRegistro`. */
export async function liberarCerrojoMigraciones(cliente: PoolClient): Promise<void> {
  await cliente.query(`SELECT pg_advisory_unlock($1)`, [CERROJO_MIGRACIONES]);
}

/**
 * Aplica lo que falte al ambiente de `config`, con su pool y su cerrojo.
 *
 * Es el camino de `make migrar` y el que usa cualquier prueba de integración
 * que necesite el esquema puesto, en este paquete o en otro: las pruebas corren
 * en procesos separados y en paralelo, así que ninguna puede suponer que otra
 * migró primero. El cerrojo de asesoría es lo que hace que dos que arranquen
 * juntas no apliquen la misma migración dos veces.
 *
 * Vive acá y no en `migraciones.ts` por la misma razón que todo lo demás de
 * este archivo: el pool no sale del paquete (AT-13).
 */
export async function migrarAmbiente(config: Configuracion): Promise<Informe> {
  const pool = crearPool(config);
  const cliente = await pool.connect();
  try {
    return await aplicarMigraciones(registroPostgres(cliente), listarMigraciones());
  } finally {
    await liberarCerrojoMigraciones(cliente).catch(() => undefined);
    cliente.release();
    await pool.end();
  }
}
