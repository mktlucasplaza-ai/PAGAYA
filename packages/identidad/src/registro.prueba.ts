/**
 * F1-20a: pedir un código encola un evento en el outbox, con el canal
 * configurado. Sin proveedor real, sin claves, sin red: el repartidor que
 * entrega de verdad es F1-70b (arquitectura.md §14, AT-25).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { aleatorioFijo } from "@pagaya/nucleo";
import { outboxEnMemoria } from "@pagaya/notificacion";

import { TIPO_EVENTO_OTP_SOLICITADO, crearServicioOtp, generarCodigoOtp, type PayloadOtpSolicitado } from "./registro.ts";

function payloadOtp(evento: { readonly payload: unknown }): PayloadOtpSolicitado {
  return evento.payload as PayloadOtpSolicitado;
}

describe("solicitarCodigo", () => {
  test("encola un evento en el outbox con el canal configurado", async () => {
    const outbox = outboxEnMemoria({ aleatorio: aleatorioFijo() });
    const servicio = crearServicioOtp({ outbox });

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
    const servicio = crearServicioOtp({ outbox });

    await servicio.solicitarCodigo({ telefono: "+56987654321", canal: "sms", dispositivoId: "telefono-2" });

    const [evento] = outbox.eventos();
    assert.ok(evento);
    assert.equal(payloadOtp(evento).canal, "sms");
  });

  test("dos peticiones encolan dos eventos, cada uno con su propio código", async () => {
    const outbox = outboxEnMemoria({ aleatorio: aleatorioFijo() });
    const servicio = crearServicioOtp({ outbox });

    await servicio.solicitarCodigo({ telefono: "+56911111111", canal: "sms", dispositivoId: "telefono-a" });
    await servicio.solicitarCodigo({ telefono: "+56922222222", canal: "sms", dispositivoId: "telefono-b" });

    const [primero, segundo] = outbox.eventos();
    assert.ok(primero && segundo);
    assert.notEqual(payloadOtp(primero).codigo, payloadOtp(segundo).codigo);
  });
});

describe("generarCodigoOtp", () => {
  test("siempre devuelve 6 dígitos, con ceros a la izquierda si hace falta", () => {
    const aleatorio = { bytes: () => Uint8Array.from([0, 0, 0, 7]) };
    assert.equal(generarCodigoOtp(aleatorio), "000007");
  });
});
