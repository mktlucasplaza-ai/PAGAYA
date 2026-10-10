/**
 * F1-20a: pedir un código encola un evento en el outbox, con el canal
 * configurado. Sin proveedor real, sin claves, sin red: el repartidor que
 * entrega de verdad es F1-70b (arquitectura.md §14, AT-25).
 *
 * F1-20c: ese encolado pasa primero por el límite de envíos por número y por
 * dispositivo (PRD-004 §8, PRD-001 §14).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { aleatorioFijo, ErrorPagaya } from "@pagaya/nucleo";
import { outboxEnMemoria } from "@pagaya/notificacion";

import { TIPO_EVENTO_OTP_SOLICITADO, crearServicioOtp, generarCodigoOtp, type LimitesOtp, type PayloadOtpSolicitado } from "./registro.ts";

function payloadOtp(evento: { readonly payload: unknown }): PayloadOtpSolicitado {
  return evento.payload as PayloadOtpSolicitado;
}

const LIMITES_DE_PRUEBA: LimitesOtp = {
  vigenciaCodigoMs: 5 * 60 * 1000,
  intentosPorCodigo: 5,
  enviosPorNumeroPorHora: 3,
  enviosPorDispositivoPorHora: 3,
};

describe("solicitarCodigo", () => {
  test("encola un evento en el outbox con el canal configurado", async () => {
    const outbox = outboxEnMemoria({ aleatorio: aleatorioFijo() });
    const servicio = crearServicioOtp({ outbox, limites: LIMITES_DE_PRUEBA });

    await servicio.solicitarCodigo({
      telefono: "+56912345678",
      canal: "email",
      dispositivoId: "telefono-1",
    });

    const [evento] = outbox.eventos();
    assert.ok(evento);
    assert.equal(evento.tipo, TIPO_EVENTO_OTP_SOLICITADO);
    const payload = payloadOtp(evento);
    assert.deepEqual(payload, {
      telefono: "+56912345678",
      canal: "email",
      dispositivoId: "telefono-1",
      codigo: payload.codigo,
    });
    assert.match(payload.codigo, /^\d{6}$/);
  });

  test("respeta SMS como canal por defecto si así se pide, y no llama a ningún proveedor", async () => {
    const outbox = outboxEnMemoria({ aleatorio: aleatorioFijo() });
    const servicio = crearServicioOtp({ outbox, limites: LIMITES_DE_PRUEBA });

    await servicio.solicitarCodigo({ telefono: "+56987654321", canal: "sms", dispositivoId: "telefono-2" });

    const [evento] = outbox.eventos();
    assert.ok(evento);
    assert.equal(payloadOtp(evento).canal, "sms");
  });

  test("dos peticiones encolan dos eventos, cada uno con su propio código", async () => {
    const outbox = outboxEnMemoria({ aleatorio: aleatorioFijo() });
    const servicio = crearServicioOtp({ outbox, limites: LIMITES_DE_PRUEBA });

    await servicio.solicitarCodigo({ telefono: "+56911111111", canal: "sms", dispositivoId: "telefono-a" });
    await servicio.solicitarCodigo({ telefono: "+56922222222", canal: "sms", dispositivoId: "telefono-b" });

    const [primero, segundo] = outbox.eventos();
    assert.ok(primero && segundo);
    assert.notEqual(payloadOtp(primero).codigo, payloadOtp(segundo).codigo);
  });

  test("F1-20c: el envío N+1 dentro de la ventana configurada se rechaza, y no encola nada", async () => {
    const outbox = outboxEnMemoria({ aleatorio: aleatorioFijo() });
    const limites: LimitesOtp = { ...LIMITES_DE_PRUEBA, enviosPorNumeroPorHora: 2, enviosPorDispositivoPorHora: 10 };
    const servicio = crearServicioOtp({ outbox, limites });

    await servicio.solicitarCodigo({ telefono: "+56933333333", canal: "sms", dispositivoId: "telefono-c" });
    await servicio.solicitarCodigo({ telefono: "+56933333333", canal: "sms", dispositivoId: "telefono-d" });

    await assert.rejects(
      servicio.solicitarCodigo({ telefono: "+56933333333", canal: "sms", dispositivoId: "telefono-e" }),
      (error: unknown) => error instanceof ErrorPagaya && error.codigo === "limite_excedido",
    );
    assert.equal(outbox.eventos().length, 2);
  });

  test("F1-20c: el límite por dispositivo rechaza aunque cambie el número", async () => {
    const outbox = outboxEnMemoria({ aleatorio: aleatorioFijo() });
    const limites: LimitesOtp = { ...LIMITES_DE_PRUEBA, enviosPorNumeroPorHora: 10, enviosPorDispositivoPorHora: 1 };
    const servicio = crearServicioOtp({ outbox, limites });

    await servicio.solicitarCodigo({ telefono: "+56944444444", canal: "sms", dispositivoId: "telefono-f" });

    await assert.rejects(
      servicio.solicitarCodigo({ telefono: "+56955555555", canal: "sms", dispositivoId: "telefono-f" }),
      (error: unknown) => error instanceof ErrorPagaya && error.codigo === "limite_excedido",
    );
    assert.equal(outbox.eventos().length, 1);
  });
});

describe("generarCodigoOtp", () => {
  test("siempre devuelve 6 dígitos, con ceros a la izquierda si hace falta", () => {
    const aleatorio = { bytes: () => Uint8Array.from([0, 0, 0, 7]) };
    assert.equal(generarCodigoOtp(aleatorio), "000007");
  });
});
