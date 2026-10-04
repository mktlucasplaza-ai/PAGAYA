/**
 * Migraciones: la decisión y su mecánica.
 *
 * Una migración es un archivo `.sql` que se escribe a mano, se aplica una vez y
 * no se vuelve a tocar nunca —la misma regla que los PRDs (CLAUDE.md), por la
 * misma razón: lo que ya pasó no se edita, se corrige con lo siguiente—. Este
 * módulo no sabe SQL de PostgreSQL: toda la mecánica vive contra el puerto
 * `RegistroMigraciones`, que es lo que permite probar el orden, la idempotencia
 * y el rechazo de una migración alterada sin una base de datos encendida.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ErrorPagaya } from "@pagaya/nucleo";

const PATRON_ARCHIVO = /^(\d{4})_[a-z0-9_]+\.sql$/;

export type Migracion = {
  /** Nombre del archivo, que es su identidad: `0001_fundacion.sql`. */
  readonly nombre: string;
  readonly numero: number;
  readonly sql: string;
  /** sha256 del contenido. Es lo que detecta que un archivo aplicado cambió. */
  readonly huella: string;
};

export type MigracionAplicada = {
  readonly nombre: string;
  readonly huella: string;
};

/**
 * Lo único que la mecánica necesita de la base de datos. `aplicar` tiene que
 * ejecutar el SQL y registrar la migración **en la misma transacción**: si se
 * registra aparte, una caída en el medio deja la base en un estado que el
 * registro niega.
 */
export type RegistroMigraciones = {
  asegurarRegistro(): Promise<void>;
  aplicadas(): Promise<MigracionAplicada[]>;
  aplicar(migracion: Migracion): Promise<void>;
};

export type Informe = {
  readonly aplicadas: readonly string[];
  readonly yaEstaban: readonly string[];
};

export function directorioMigraciones(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "migraciones");
}

function huellaDe(sql: string): string {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

/**
 * Lee las migraciones del directorio, en orden. El nombre manda: un archivo que
 * no calza con `NNNN_nombre_en_minusculas.sql` es un error, no un archivo que se
 * ignora en silencio.
 */
export function listarMigraciones(directorio: string = directorioMigraciones()): Migracion[] {
  const archivos = readdirSync(directorio).filter((n) => n.endsWith(".sql"));
  const migraciones: Migracion[] = [];

  for (const nombre of archivos.sort()) {
    const m = PATRON_ARCHIVO.exec(nombre);
    if (m === null) {
      throw new ErrorPagaya(
        "migracion_invalida",
        `${nombre}: el nombre debe ser NNNN_nombre_en_minusculas.sql`,
      );
    }
    const sql = readFileSync(join(directorio, nombre), "utf8");
    migraciones.push({
      nombre,
      numero: Number.parseInt(m[1] as string, 10),
      sql,
      huella: huellaDe(sql),
    });
  }

  migraciones.forEach((migracion, i) => {
    if (migracion.numero !== i + 1) {
      throw new ErrorPagaya(
        "migracion_invalida",
        `numeración con hueco o repetida: se esperaba ${String(i + 1).padStart(4, "0")} ` +
          `y hay ${migracion.nombre}`,
      );
    }
  });

  return migraciones;
}

/**
 * Aplica lo que falte, en orden, y devuelve qué hizo. Es idempotente: correrla
 * dos veces no aplica nada la segunda vez.
 *
 * Se detiene antes de tocar la base si una migración ya aplicada cambió de
 * contenido. Dejarla pasar sería peor que fallar: la base y el repositorio
 * dirían cosas distintas y nadie se enteraría hasta el día en que alguien
 * recrea el esquema desde cero y no le queda igual.
 */
export async function aplicarMigraciones(
  registro: RegistroMigraciones,
  migraciones: readonly Migracion[] = listarMigraciones(),
): Promise<Informe> {
  await registro.asegurarRegistro();
  const aplicadas = await registro.aplicadas();
  const porNombre = new Map(aplicadas.map((a) => [a.nombre, a.huella]));

  for (const aplicada of aplicadas) {
    const enDisco = migraciones.find((m) => m.nombre === aplicada.nombre);
    if (enDisco === undefined) {
      throw new ErrorPagaya(
        "migracion_invalida",
        `${aplicada.nombre} está aplicada en la base y no existe en el repositorio. ` +
          `Una migración aplicada no se borra: si está mal, se corrige con la siguiente.`,
      );
    }
    if (enDisco.huella !== aplicada.huella) {
      throw new ErrorPagaya(
        "migracion_invalida",
        `${aplicada.nombre} ya estaba aplicada y su contenido cambió ` +
          `(huella ${aplicada.huella.slice(0, 12)} en la base, ` +
          `${enDisco.huella.slice(0, 12)} en el repositorio). ` +
          `Escribe una migración nueva en lugar de editar ésta.`,
      );
    }
  }

  const nuevas: string[] = [];
  for (const migracion of migraciones) {
    if (porNombre.has(migracion.nombre)) continue;
    await registro.aplicar(migracion);
    nuevas.push(migracion.nombre);
  }

  return {
    aplicadas: nuevas,
    yaEstaban: migraciones.filter((m) => porNombre.has(m.nombre)).map((m) => m.nombre),
  };
}
