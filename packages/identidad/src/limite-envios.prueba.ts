/**
 * F1-20c: el límite de envíos por número y por dispositivo (PRD-004 §8,
 * PRD-001 §14), probado directo contra el puerto, sin pasar por el outbox.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { ErrorPagaya } from "@pagaya/nucleo";

import { limitadorEnviosEnMemoria } from "./limite-envios.ts";
import type { LimitesOtp } from "./registro.ts";

function reloj(instante: { valor: number }) {
  return { ahora: () => new Date(instante.valor) };
}

const LIMITES: LimitesOtp = {
  vigenciaCodigoMs: 5 * 60 * 1000,
  intentosPorCodigo: 5,
  enviosPorNumeroPorHora: 2,
  enviosPorDispositivoPorHora: 2,
};

describe("limitadorEnviosEnMemoria", () => {
  test("permite hasta el tope y rechaza el envío N+1 dentro de la ventana", async () => {
    const limitador = limitadorEnviosEnMemoria({ limites: LIMITES });

    await limitador.registrar({ telefono: "+56912345678", dispositivoId: "d-1" });
    await limitador.registrar({ telefono: "+56912345678", dispositivoId: "d-2" });

    await assert.rejects(
      limitador.registrar({ telefono: "+56912345678", dispositivoId: "d-3" }),
      (error: unknown) => error instanceof ErrorPagaya && error.codigo === "limite_excedido",
    );
  });

  test("el límite es independiente por número: otro número no se ve afectado", async () => {
    const limitador = limitadorEnviosEnMemoria({ limites: LIMITES });

    await limitador.registrar({ telefono: "+56911111111", dispositivoId: "d-a" });
    await limitador.registrar({ telefono: "+56911111111", dispositivoId: "d-b" });

    await assert.doesNotReject(limitador.registrar({ telefono: "+56922222222", dispositivoId: "d-c" }));
  });

  test("el límite por dispositivo rechaza aunque el número cambie", async () => {
    const limitador = limitadorEnviosEnMemoria({ limites: { ...LIMITES, enviosPorNumeroPorHora: 10 } });

    await limitador.registrar({ telefono: "+56933333333", dispositivoId: "mismo-dispositivo" });
    await limitador.registrar({ telefono: "+56944444444", dispositivoId: "mismo-dispositivo" });

    await assert.rejects(
      limitador.registrar({ telefono: "+56955555555", dispositivoId: "mismo-dispositivo" }),
      (error: unknown) => error instanceof ErrorPagaya && error.codigo === "limite_excedido",
    );
  });

  test("pasada la ventana de una hora, el envío vuelve a permitirse", async () => {
    const instante = { valor: Date.UTC(2026, 0, 1, 12, 0, 0) };
    const limitador = limitadorEnviosEnMemoria({ limites: LIMITES, reloj: reloj(instante) });

    await limitador.registrar({ telefono: "+56966666666", dispositivoId: "d-x" });
    await limitador.registrar({ telefono: "+56966666666", dispositivoId: "d-y" });
    await assert.rejects(limitador.registrar({ telefono: "+56966666666", dispositivoId: "d-z" }));

    instante.valor += 60 * 60 * 1000;

    await assert.doesNotReject(limitador.registrar({ telefono: "+56966666666", dispositivoId: "d-z" }));
  });
});
