import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { ErrorPagaya } from "@pagaya/nucleo";

import {
  aplicarMigraciones,
  listarMigraciones,
  type Migracion,
  type MigracionAplicada,
  type RegistroMigraciones,
} from "./migraciones.ts";

/**
 * Registro en memoria. Existe para poder probar el orden, la idempotencia y el
 * rechazo de una migración alterada sin PostgreSQL encendido: la mecánica no
 * sabe SQL justamente para que esta prueba sea posible.
 */
function registroEnMemoria(iniciales: MigracionAplicada[] = []): RegistroMigraciones & {
  readonly ejecutadas: string[];
} {
  const filas = [...iniciales];
  const ejecutadas: string[] = [];
  return {
    ejecutadas,
    asegurarRegistro: async () => undefined,
    aplicadas: async () => [...filas],
    aplicar: async (m: Migracion) => {
      ejecutadas.push(m.nombre);
      filas.push({ nombre: m.nombre, huella: m.huella });
    },
  };
}

function migracion(nombre: string, sql: string): Migracion {
  const numero = Number.parseInt(nombre.slice(0, 4), 10);
  // La huella la calcula listarMigraciones() en el camino real; acá basta con
  // que sea estable y distinta por contenido.
  return { nombre, numero, sql, huella: `huella-de-${sql}` };
}

describe("migraciones del repositorio", () => {
  test("se leen en orden y la numeración no tiene huecos", () => {
    const migraciones = listarMigraciones();
    assert.ok(migraciones.length >= 1, "debe haber al menos la migración de fundación");
    assert.deepEqual(
      migraciones.map((m) => m.numero),
      migraciones.map((_, i) => i + 1),
    );
    assert.equal(migraciones[0]?.nombre, "0001_fundacion.sql");
  });

  test("la huella es sha256 del contenido y no cambia entre lecturas", () => {
    const primera = listarMigraciones();
    const segunda = listarMigraciones();
    assert.deepEqual(
      primera.map((m) => m.huella),
      segunda.map((m) => m.huella),
    );
    for (const m of primera) assert.match(m.huella, /^[0-9a-f]{64}$/);
  });

  test("la fundación no crea ninguna tabla: F1-01 no trae modelo de datos", () => {
    const fundacion = listarMigraciones()[0];
    assert.ok(fundacion !== undefined);
    // Sin los comentarios: lo que importa son las sentencias, no la prosa que
    // las explica (que sí nombra CREATE TABLE para decir que no va acá).
    const sentencias = fundacion.sql.replaceAll(/--[^\n]*/g, "");
    assert.doesNotMatch(sentencias, /CREATE\s+TABLE/i);
  });
});

describe("aplicar", () => {
  const a = migracion("0001_fundacion.sql", "CREATE SCHEMA pagaya");
  const b = migracion("0002_mesas.sql", "-- F1-02");

  test("aplica lo pendiente en orden", async () => {
    const registro = registroEnMemoria();
    const informe = await aplicarMigraciones(registro, [a, b]);
    assert.deepEqual(registro.ejecutadas, [a.nombre, b.nombre]);
    assert.deepEqual(informe.aplicadas, [a.nombre, b.nombre]);
    assert.deepEqual(informe.yaEstaban, []);
  });

  test("correrla de nuevo no aplica nada", async () => {
    const registro = registroEnMemoria([{ nombre: a.nombre, huella: a.huella }]);
    const informe = await aplicarMigraciones(registro, [a, b]);
    assert.deepEqual(registro.ejecutadas, [b.nombre]);
    assert.deepEqual(informe.yaEstaban, [a.nombre]);

    const otra = await aplicarMigraciones(registro, [a, b]);
    assert.deepEqual(otra.aplicadas, []);
  });

  test("una migración ya aplicada que cambió de contenido detiene todo", async () => {
    const registro = registroEnMemoria([{ nombre: a.nombre, huella: "otra-huella" }]);
    await assert.rejects(
      aplicarMigraciones(registro, [a, b]),
      (error: unknown) =>
        error instanceof ErrorPagaya &&
        error.codigo === "migracion_invalida" &&
        /contenido cambió/.test(error.message),
    );
    assert.deepEqual(registro.ejecutadas, [], "no debe aplicar nada si el repositorio y la base difieren");
  });

  test("una migración aplicada que ya no existe en el repositorio detiene todo", async () => {
    const registro = registroEnMemoria([{ nombre: "0003_borrada.sql", huella: "x" }]);
    await assert.rejects(aplicarMigraciones(registro, [a, b]), (error: unknown) =>
      error instanceof ErrorPagaya && error.codigo === "migracion_invalida",
    );
    assert.deepEqual(registro.ejecutadas, []);
  });
});
