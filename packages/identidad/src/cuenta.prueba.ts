/**
 * F1-21a, la parte que no necesita PostgreSQL: la normalización, los dos
 * rechazos de formato y que el nombre de la cuenta existente no se pise.
 *
 * Lo que la fila del backlog exige —"un segundo registro con el mismo teléfono
 * reutiliza la cuenta, no crea otra"— se prueba contra PostgreSQL, en
 * `cuenta-postgres.prueba.ts`: es una propiedad de la base, no de este doble.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { aleatorioFijo } from "@pagaya/nucleo";

import { altaDeCuenta, repositorioCuentasEnMemoria } from "./cuenta.ts";

const TELEFONO = "+56912345678";
const TELEFONO_MESERO = "+56904100001";

function repositorio() {
  return repositorioCuentasEnMemoria({
    telefonosDePersonal: [TELEFONO_MESERO],
    aleatorio: aleatorioFijo(),
  });
}

describe("alta de cuenta (F1-21a)", () => {
  test("el primer registro crea la cuenta y el segundo entra a la misma", async () => {
    const repo = repositorio();

    const primera = await altaDeCuenta({
      repositorio: repo,
      datos: { nombrePila: "Lucas", telefono: TELEFONO },
    });
    const segunda = await altaDeCuenta({
      repositorio: repo,
      datos: { nombrePila: "Lucas", telefono: TELEFONO },
    });

    assert.ok(primera.ok && segunda.ok);
    assert.equal(primera.reusada, false);
    assert.equal(segunda.reusada, true);
    assert.equal(segunda.cuenta.id, primera.cuenta.id);
  });

  test("el nombre del segundo registro no renombra la cuenta existente", async () => {
    const repo = repositorio();
    await altaDeCuenta({ repositorio: repo, datos: { nombrePila: "Lucas", telefono: TELEFONO } });

    const reingreso = await altaDeCuenta({
      repositorio: repo,
      datos: { nombrePila: "Otro", telefono: TELEFONO },
    });

    assert.ok(reingreso.ok);
    assert.equal(reingreso.cuenta.nombrePila, "Lucas");
  });

  test("un espacio de más no crea una cuenta nueva", async () => {
    const repo = repositorio();
    const primera = await altaDeCuenta({
      repositorio: repo,
      datos: { nombrePila: "Lucas", telefono: TELEFONO },
    });
    const segunda = await altaDeCuenta({
      repositorio: repo,
      datos: { nombrePila: "  Lucas  ", telefono: ` ${TELEFONO} ` },
    });

    assert.ok(primera.ok && segunda.ok);
    assert.equal(segunda.cuenta.id, primera.cuenta.id);
    assert.equal(segunda.reusada, true);
  });

  test("el nombre vacío y el teléfono que no es E.164 se rechazan con su motivo", async () => {
    const repo = repositorio();

    assert.deepEqual(
      await altaDeCuenta({ repositorio: repo, datos: { nombrePila: "   ", telefono: TELEFONO } }),
      { ok: false, motivo: "nombre_invalido" },
    );
    assert.deepEqual(
      await altaDeCuenta({
        repositorio: repo,
        datos: { nombrePila: "x".repeat(61), telefono: TELEFONO },
      }),
      { ok: false, motivo: "nombre_invalido" },
    );
    assert.deepEqual(
      await altaDeCuenta({
        repositorio: repo,
        datos: { nombrePila: "Lucas", telefono: "912345678" },
      }),
      { ok: false, motivo: "telefono_invalido" },
    );
  });

  test("el teléfono de un mesero no se convierte en cuenta de cliente", async () => {
    assert.deepEqual(
      await altaDeCuenta({
        repositorio: repositorio(),
        datos: { nombrePila: "Ana", telefono: TELEFONO_MESERO },
      }),
      { ok: false, motivo: "telefono_de_personal" },
    );
  });
});
