import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { VERSION_CONTRATO, type RespuestaSalud } from "@pagaya/contrato";

import { consultarSalud, urlDeSalud } from "./index.ts";

describe("la web app habla el contrato", () => {
  test("arma la URL de salud sobre la base que le dan", () => {
    assert.equal(urlDeSalud("https://staging.pagaya.cl"), "https://staging.pagaya.cl/salud");
  });

  test("consulta la salud con el fetch que le inyectan", async () => {
    const cuerpo: RespuestaSalud = {
      ambiente: "dev",
      contrato: VERSION_CONTRATO,
      ahora: "2026-10-04T21:30:00.000Z",
    };
    const traer = (async () =>
      new Response(JSON.stringify(cuerpo), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;

    assert.deepEqual(await consultarSalud("http://localhost:3000", traer), cuerpo);
  });

  test("un error de la api no se devuelve como respuesta válida", async () => {
    const traer = (async () => new Response("", { status: 503 })) as typeof fetch;
    await assert.rejects(consultarSalud("http://localhost:3000", traer), /503/);
  });
});
