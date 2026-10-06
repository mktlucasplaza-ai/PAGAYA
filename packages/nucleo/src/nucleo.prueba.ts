import assert from "node:assert/strict";
import { inspect } from "node:util";
import { describe, test } from "node:test";

import { ErrorPagaya, Secreto, aleatorioDelSistema, aleatorioFijo, relojFijo } from "./index.ts";

describe("secreto", () => {
  const secreto = new Secreto("PAGAYA_BD_URL", "postgres://usuario:clave@maquina/base");

  test("el valor solo sale por revelar()", () => {
    assert.equal(secreto.revelar(), "postgres://usuario:clave@maquina/base");
  });

  test("no se filtra por texto, por JSON ni por inspección", () => {
    const caminos = [
      String(secreto),
      `${secreto}`,
      JSON.stringify(secreto),
      JSON.stringify({ config: { url: secreto } }),
      inspect(secreto),
      inspect({ config: { url: secreto } }, { depth: 5 }),
    ];
    for (const texto of caminos) {
      assert.ok(!texto.includes("clave"), `se filtró la credencial en: ${texto}`);
      assert.ok(texto.includes("PAGAYA_BD_URL"), `no se ve el nombre en: ${texto}`);
    }
  });
});

describe("error", () => {
  test("lleva código y conserva la causa", () => {
    const causa = new Error("se cayó el disco");
    const error = new ErrorPagaya("migracion_invalida", "no se pudo leer", { causa });
    assert.equal(error.codigo, "migracion_invalida");
    assert.equal(error.cause, causa);
    assert.ok(error instanceof Error);
  });
});

describe("reloj", () => {
  test("el reloj fijo no se mueve y no se puede mutar desde afuera", () => {
    const reloj = relojFijo(new Date("2026-10-04T21:30:00.000Z"));
    const primera = reloj.ahora();
    primera.setFullYear(1999);
    assert.equal(reloj.ahora().toISOString(), "2026-10-04T21:30:00.000Z");
  });
});

describe("fuente aleatoria", () => {
  test("entrega la cantidad de bytes pedida", () => {
    for (const fuente of [aleatorioDelSistema, aleatorioFijo()]) {
      assert.equal(fuente.bytes(32).length, 32);
      assert.equal(fuente.bytes(0).length, 0);
    }
  });

  test("la fuente fija es determinista y no repite el bloque anterior", () => {
    const primera = aleatorioFijo(4);
    const segunda = aleatorioFijo(4);
    const unoA = primera.bytes(8);
    const dosA = primera.bytes(8);
    assert.deepEqual([...unoA], [...segunda.bytes(8)]);
    assert.notDeepEqual([...unoA], [...dosA]);
  });
});
