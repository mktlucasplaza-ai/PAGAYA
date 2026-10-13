/**
 * F1-20b: expiración y límite de intentos de verificación (PRD-001 §14,
 * PRD-004 §8). Lo que la fila del backlog exige: **un OTP vencido o que superó
 * sus intentos se rechaza aunque el código sea correcto**.
 *
 * El código correcto se obtiene del evento que `solicitarCodigo` encola, que es
 * de donde lo va a sacar el repartidor de F1-70b: la prueba no lo inventa.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { aleatorioFijo } from "@pagaya/nucleo";
import { outboxEnMemoria } from "@pagaya/notificacion";

import { crearServicioOtp, type LimitesOtp, type PayloadOtpSolicitado } from "./registro.ts";
import {
  estadoDeOtp,
  huellaDeCodigo,
  repositorioOtpEnMemoria,
  verificarCodigo,
  type OtpPendiente,
} from "./verificacion-otp.ts";

const LIMITES: LimitesOtp = {
  vigenciaCodigoMs: 5 * 60 * 1000,
  intentosPorCodigo: 3,
  enviosPorNumeroPorHora: 10,
  enviosPorDispositivoPorHora: 10,
};

const TELEFONO = "+56912345678";
const DISPOSITIVO = "telefono-1";

/** Un código de 6 dígitos que no es el que se pidió. */
function codigoDistintoDe(codigo: string): string {
  return codigo === "000000" ? "111111" : "000000";
}

/** Reloj movible: la expiración solo se puede probar si la prueba manda la hora. */
function relojMovible(instante: { valor: number }) {
  return { ahora: () => new Date(instante.valor) };
}

function servicio(instante: { valor: number }, limites: LimitesOtp = LIMITES) {
  const outbox = outboxEnMemoria({ aleatorio: aleatorioFijo() });
  const servicioOtp = crearServicioOtp({
    outbox,
    limites,
    aleatorio: aleatorioFijo(),
    reloj: relojMovible(instante),
  });
  const codigoEncolado = () => {
    const eventos = outbox.eventos();
    const ultimo = eventos[eventos.length - 1];
    assert.ok(ultimo);
    return (ultimo.payload as PayloadOtpSolicitado).codigo;
  };
  return { servicioOtp, codigoEncolado };
}

describe("verificarCodigo", () => {
  test("el código recién pedido se acepta y el OTP queda consumido", async () => {
    const instante = { valor: Date.UTC(2026, 0, 1, 12, 0, 0) };
    const { servicioOtp, codigoEncolado } = servicio(instante);

    await servicioOtp.solicitarCodigo({ telefono: TELEFONO, canal: "sms", dispositivoId: DISPOSITIVO });
    const codigo = codigoEncolado();

    const primera = await servicioOtp.verificarCodigo({ telefono: TELEFONO, dispositivoId: DISPOSITIVO, codigo });
    assert.equal(primera.ok, true);

    const segunda = await servicioOtp.verificarCodigo({ telefono: TELEFONO, dispositivoId: DISPOSITIVO, codigo });
    assert.deepEqual(segunda, { ok: false, motivo: "codigo_consumido", intentosRestantes: 0 });
  });

  test("un OTP vencido se rechaza aunque el código sea correcto", async () => {
    const instante = { valor: Date.UTC(2026, 0, 1, 12, 0, 0) };
    const { servicioOtp, codigoEncolado } = servicio(instante);

    await servicioOtp.solicitarCodigo({ telefono: TELEFONO, canal: "sms", dispositivoId: DISPOSITIVO });
    const codigo = codigoEncolado();

    instante.valor += LIMITES.vigenciaCodigoMs;

    const resultado = await servicioOtp.verificarCodigo({ telefono: TELEFONO, dispositivoId: DISPOSITIVO, codigo });
    assert.deepEqual(resultado, { ok: false, motivo: "codigo_vencido", intentosRestantes: 0 });
  });

  test("un OTP que superó sus intentos se rechaza aunque el código sea correcto", async () => {
    const instante = { valor: Date.UTC(2026, 0, 1, 12, 0, 0) };
    const { servicioOtp, codigoEncolado } = servicio(instante);

    await servicioOtp.solicitarCodigo({ telefono: TELEFONO, canal: "sms", dispositivoId: DISPOSITIVO });
    const codigo = codigoEncolado();

    for (let intento = 1; intento <= LIMITES.intentosPorCodigo; intento += 1) {
      const fallido = await servicioOtp.verificarCodigo({
        telefono: TELEFONO,
        dispositivoId: DISPOSITIVO,
        codigo: codigoDistintoDe(codigo),
      });
      assert.deepEqual(fallido, {
        ok: false,
        motivo: "codigo_incorrecto",
        intentosRestantes: LIMITES.intentosPorCodigo - intento,
      });
    }

    const resultado = await servicioOtp.verificarCodigo({ telefono: TELEFONO, dispositivoId: DISPOSITIVO, codigo });
    assert.deepEqual(resultado, { ok: false, motivo: "intentos_agotados", intentosRestantes: 0 });
  });

  test("pedir un código nuevo reemplaza al anterior y devuelve los intentos", async () => {
    const instante = { valor: Date.UTC(2026, 0, 1, 12, 0, 0) };
    const { servicioOtp, codigoEncolado } = servicio(instante);

    await servicioOtp.solicitarCodigo({ telefono: TELEFONO, canal: "sms", dispositivoId: DISPOSITIVO });
    const viejo = codigoEncolado();
    await servicioOtp.verificarCodigo({ telefono: TELEFONO, dispositivoId: DISPOSITIVO, codigo: codigoDistintoDe(viejo) });

    await servicioOtp.solicitarCodigo({ telefono: TELEFONO, canal: "sms", dispositivoId: DISPOSITIVO });
    const nuevo = codigoEncolado();
    assert.notEqual(viejo, nuevo);

    const conElViejo = await servicioOtp.verificarCodigo({ telefono: TELEFONO, dispositivoId: DISPOSITIVO, codigo: viejo });
    assert.deepEqual(conElViejo, {
      ok: false,
      motivo: "codigo_incorrecto",
      intentosRestantes: LIMITES.intentosPorCodigo - 1,
    });

    const conElNuevo = await servicioOtp.verificarCodigo({ telefono: TELEFONO, dispositivoId: DISPOSITIVO, codigo: nuevo });
    assert.equal(conElNuevo.ok, true);
  });

  test("el código vale para el dispositivo que lo pidió, y no para otro", async () => {
    const instante = { valor: Date.UTC(2026, 0, 1, 12, 0, 0) };
    const { servicioOtp, codigoEncolado } = servicio(instante);

    await servicioOtp.solicitarCodigo({ telefono: TELEFONO, canal: "sms", dispositivoId: DISPOSITIVO });
    const codigo = codigoEncolado();

    const otro = await servicioOtp.verificarCodigo({ telefono: TELEFONO, dispositivoId: "otro-telefono", codigo });
    assert.deepEqual(otro, { ok: false, motivo: "sin_codigo", intentosRestantes: 0 });
  });

  test("sin OTP pedido no hay nada que verificar", async () => {
    const resultado = await verificarCodigo({
      repositorio: repositorioOtpEnMemoria(),
      clave: { telefono: TELEFONO, dispositivoId: DISPOSITIVO },
      codigo: "123456",
      limites: LIMITES,
    });
    assert.deepEqual(resultado, { ok: false, motivo: "sin_codigo", intentosRestantes: 0 });
  });
});

describe("intentos simultáneos", () => {
  test("varios intentos fallidos en paralelo nunca pasan de `intentosPorCodigo`", async () => {
    const instante = { valor: Date.UTC(2026, 0, 1, 12, 0, 0) };
    const { servicioOtp, codigoEncolado } = servicio(instante);

    await servicioOtp.solicitarCodigo({ telefono: TELEFONO, canal: "sms", dispositivoId: DISPOSITIVO });
    const codigo = codigoEncolado();
    const enParalelo = LIMITES.intentosPorCodigo + 5;

    const resultados = await Promise.all(
      Array.from({ length: enParalelo }, () =>
        servicioOtp.verificarCodigo({
          telefono: TELEFONO,
          dispositivoId: DISPOSITIVO,
          codigo: codigoDistintoDe(codigo),
        }),
      ),
    );

    const motivos = resultados.map((resultado) => (resultado.ok ? "aceptado" : resultado.motivo));
    const cobrados = motivos.filter((motivo) => motivo === "codigo_incorrecto").length;
    const rechazados = motivos.filter((motivo) => motivo === "intentos_agotados").length;

    assert.equal(cobrados, LIMITES.intentosPorCodigo, `se cobraron ${cobrados} intentos con un tope de ${LIMITES.intentosPorCodigo}`);
    assert.equal(rechazados, enParalelo - LIMITES.intentosPorCodigo);

    const conElCorrecto = await servicioOtp.verificarCodigo({ telefono: TELEFONO, dispositivoId: DISPOSITIVO, codigo });
    assert.deepEqual(conElCorrecto, { ok: false, motivo: "intentos_agotados", intentosRestantes: 0 });
  });

  test("el mismo código acertado en paralelo consume el OTP una sola vez", async () => {
    const instante = { valor: Date.UTC(2026, 0, 1, 12, 0, 0) };
    const { servicioOtp, codigoEncolado } = servicio(instante, { ...LIMITES, intentosPorCodigo: 5 });

    await servicioOtp.solicitarCodigo({ telefono: TELEFONO, canal: "sms", dispositivoId: DISPOSITIVO });
    const codigo = codigoEncolado();

    const resultados = await Promise.all(
      Array.from({ length: 3 }, () =>
        servicioOtp.verificarCodigo({ telefono: TELEFONO, dispositivoId: DISPOSITIVO, codigo }),
      ),
    );

    assert.equal(resultados.filter((resultado) => resultado.ok).length, 1);
  });
});

describe("estadoDeOtp", () => {
  const base: OtpPendiente = {
    telefono: TELEFONO,
    dispositivoId: DISPOSITIVO,
    canal: "sms",
    huellaCodigo: huellaDeCodigo("123456"),
    creadoEn: new Date(Date.UTC(2026, 0, 1, 12, 0, 0)),
    expiraEn: new Date(Date.UTC(2026, 0, 1, 12, 5, 0)),
    intentos: 0,
    consumidoEn: null,
  };

  test("vence en el instante exacto de `expiraEn`, no un milisegundo después", () => {
    assert.equal(estadoDeOtp(base, new Date(Date.UTC(2026, 0, 1, 12, 4, 59)), 3), "vigente");
    assert.equal(estadoDeOtp(base, base.expiraEn, 3), "vencido");
  });

  test("el consumo gana a todo: un OTP usado no revive ni dentro de su vigencia", () => {
    const usado = { ...base, consumidoEn: new Date(Date.UTC(2026, 0, 1, 12, 1, 0)) };
    assert.equal(estadoDeOtp(usado, new Date(Date.UTC(2026, 0, 1, 12, 2, 0)), 3), "consumido");
  });

  test("los intentos se cuentan contra el tope configurado", () => {
    const ahora = new Date(Date.UTC(2026, 0, 1, 12, 1, 0));
    assert.equal(estadoDeOtp({ ...base, intentos: 2 }, ahora, 3), "vigente");
    assert.equal(estadoDeOtp({ ...base, intentos: 3 }, ahora, 3), "intentos_agotados");
  });
});
