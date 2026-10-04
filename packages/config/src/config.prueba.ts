import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import { ErrorPagaya } from "@pagaya/nucleo";

import { ambientesDisponibles, cargarConfiguracion } from "./index.ts";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Valores de mentira: una prueba nunca necesita un secreto de verdad. */
const ENTORNO = {
  PAGAYA_BD_URL: "postgres://pagaya:de-mentira@localhost:5432/pagaya_prueba",
  PAGAYA_FIRMA_SESION: "de-mentira",
};

function fallaCon(codigo: string, fn: () => unknown): ErrorPagaya {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof ErrorPagaya, `se esperaba ErrorPagaya, llegó ${String(error)}`);
    assert.equal(error.codigo, codigo);
    return error;
  }
  throw new Error("se esperaba un error y no hubo ninguno");
}

describe("ambientes", () => {
  test("hay exactamente dos, dev y staging (PRD-001 §18: producción nace con el piloto)", () => {
    assert.deepEqual(ambientesDisponibles(RAIZ), ["dev", "staging"]);
  });

  test("cada ambiente carga completo", () => {
    for (const nombre of ambientesDisponibles(RAIZ)) {
      const config = cargarConfiguracion({ ambiente: nombre, raiz: RAIZ, entorno: ENTORNO });
      assert.equal(config.ambiente, nombre);
      assert.ok(config.api.puerto > 0);
      assert.ok(config.api.origenesPermitidos.length > 0);
      assert.ok(config.baseDatos.maxConexiones >= 1);
      assert.equal(config.baseDatos.url.revelar(), ENTORNO.PAGAYA_BD_URL);
      assert.ok(config.repartidor.intervaloSondeoMs >= 50);
    }
  });

  test("staging usa ssl y dev no", () => {
    const dev = cargarConfiguracion({ ambiente: "dev", raiz: RAIZ, entorno: ENTORNO });
    const staging = cargarConfiguracion({ ambiente: "staging", raiz: RAIZ, entorno: ENTORNO });
    assert.equal(dev.baseDatos.ssl, false);
    assert.equal(staging.baseDatos.ssl, true);
  });
});

describe("secretos", () => {
  test("ningún archivo de ambiente lleva el valor de un secreto, solo su nombre", () => {
    const credencialEnUrl = /:\/\/[^/\s"]*:[^/\s"]*@/;
    for (const nombre of ambientesDisponibles(RAIZ)) {
      const ruta = join(RAIZ, "ambientes", `${nombre}.json`);
      const texto = readFileSync(ruta, "utf8");
      assert.ok(
        !credencialEnUrl.test(texto),
        `${ruta} tiene lo que parece una credencial dentro de una URL`,
      );
      const crudo = JSON.parse(texto) as { secretos: Record<string, unknown> };
      for (const [clave, valor] of Object.entries(crudo.secretos)) {
        assert.match(
          String(valor),
          /^[A-Z][A-Z0-9_]*$/,
          `${ruta} > secretos.${clave} debe ser el NOMBRE de una variable de entorno`,
        );
      }
    }
  });

  test("si falta un secreto declarado, no arranca, y el mensaje lo nombra", () => {
    const error = fallaCon("configuracion_invalida", () =>
      cargarConfiguracion({
        ambiente: "staging",
        raiz: RAIZ,
        entorno: { PAGAYA_FIRMA_SESION: "de-mentira" },
      }),
    );
    assert.match(error.message, /PAGAYA_BD_URL/);
  });

  test("un secreto vacío cuenta como ausente", () => {
    fallaCon("configuracion_invalida", () =>
      cargarConfiguracion({
        ambiente: "dev",
        raiz: RAIZ,
        entorno: { ...ENTORNO, PAGAYA_FIRMA_SESION: "" },
      }),
    );
  });
});

describe("fallos de carga", () => {
  test("sin PAGAYA_AMBIENTE no hay ambiente por defecto", () => {
    const error = fallaCon("configuracion_invalida", () =>
      cargarConfiguracion({ raiz: RAIZ, entorno: ENTORNO }),
    );
    assert.match(error.message, /PAGAYA_AMBIENTE/);
    assert.match(error.message, /dev, staging/);
  });

  test("un ambiente que no existe falla nombrando los que sí", () => {
    const error = fallaCon("configuracion_invalida", () =>
      cargarConfiguracion({ ambiente: "produccion", raiz: RAIZ, entorno: ENTORNO }),
    );
    assert.match(error.message, /dev, staging/);
  });

  test("un nombre de ambiente con travesía de rutas se rechaza", () => {
    fallaCon("configuracion_invalida", () =>
      cargarConfiguracion({ ambiente: "../../etc/passwd", raiz: RAIZ, entorno: ENTORNO }),
    );
  });
});
