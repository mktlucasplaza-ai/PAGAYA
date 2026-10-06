/**
 * La sesión persistente sin contraseña de PRD-004 §3, y las vigencias por rol
 * de PRD-001 §14. Sin base de datos: el puerto `RepositorioSesiones` existe
 * para que esto sea posible.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { ErrorPagaya, aleatorioFijo, relojFijo } from "@pagaya/nucleo";

import type { Titular } from "./roles.ts";
import {
  POLITICAS_POR_DEFECTO,
  abrirSesion,
  autenticar,
  estadoDeSesion,
  huellaDeToken,
  politicaDe,
  promoverACuenta,
  renovarSesion,
  revocarSesion,
  type RepositorioSesiones,
  type Sesion,
} from "./sesion.ts";

const AHORA = new Date("2026-10-06T21:30:00.000Z");
const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
const LOCAL = "local-fuegos";

const CLIENTE: Titular = { tipo: "cliente", usuarioId: "camila" };
const MESERO: Titular = { tipo: "personal", rol: "mesero", usuarioId: "rodrigo", localId: LOCAL };

function abrir(titular: Titular, instante = AHORA, semilla = 3) {
  return abrirSesion({
    titular,
    dispositivoId: "telefono-1",
    reloj: relojFijo(instante),
    aleatorio: aleatorioFijo(semilla),
  });
}

/** Repositorio en memoria: es lo que permite probar `autenticar` sin PostgreSQL. */
function repositorioEnMemoria(iniciales: Sesion[] = []): RepositorioSesiones {
  const filas = new Map(iniciales.map((s) => [s.id, s]));
  return {
    guardar: async (sesion) => {
      filas.set(sesion.id, sesion);
    },
    porHuellaDeToken: async (huella) =>
      [...filas.values()].find((s) => s.huellaToken === huella) ?? null,
    porId: async (id) => filas.get(id) ?? null,
  };
}

describe("el token no se guarda, se guarda su huella", () => {
  test("la sesión lleva sha256 del token y no el token", () => {
    const { sesion, token } = abrir(CLIENTE);
    assert.match(token, /^pgs_[A-Za-z0-9_-]{43}$/);
    assert.equal(sesion.huellaToken, huellaDeToken(token));
    assert.match(sesion.huellaToken, /^[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(sesion).includes(token), "el token quedó dentro de la sesión");
  });

  test("dos sesiones no comparten token ni identificador", () => {
    const aleatorio = aleatorioFijo(1);
    const reloj = relojFijo(AHORA);
    const una = abrirSesion({ titular: CLIENTE, dispositivoId: "a", reloj, aleatorio });
    const otra = abrirSesion({ titular: CLIENTE, dispositivoId: "b", reloj, aleatorio });
    assert.notEqual(una.token, otra.token);
    assert.notEqual(una.sesion.id, otra.sesion.id);
    assert.notEqual(una.sesion.huellaToken, otra.sesion.huellaToken);
  });
});

describe("la vigencia depende del rol (PRD-001 §14)", () => {
  test("la del cliente es persistente: 180 días y se desliza con el uso (PRD-004 §3)", () => {
    const { sesion } = abrir(CLIENTE);
    assert.equal(sesion.expiraEn.getTime() - AHORA.getTime(), 180 * DIA);

    const unMesDespues = new Date(AHORA.getTime() + 30 * DIA);
    const renovada = renovarSesion({ sesion, ahora: unMesDespues });
    assert.equal(renovada.expiraEn.getTime() - unMesDespues.getTime(), 180 * DIA);
    assert.equal(renovada.ultimaActividadEn.getTime(), unMesDespues.getTime());
  });

  test("la del mesero dura una jornada y NO se desliza: usarla no la estira", () => {
    const { sesion } = abrir(MESERO);
    assert.equal(sesion.expiraEn.getTime() - AHORA.getTime(), 16 * HORA);

    const masTarde = new Date(AHORA.getTime() + 8 * HORA);
    const renovada = renovarSesion({ sesion, ahora: masTarde });
    assert.equal(renovada.expiraEn.getTime(), sesion.expiraEn.getTime());
    assert.equal(renovada.ultimaActividadEn.getTime(), masTarde.getTime());
  });

  test("la sesión sin cuenta cubre una comida y no más", () => {
    const { sesion } = abrir({ tipo: "sin_cuenta" });
    assert.equal(sesion.expiraEn.getTime() - AHORA.getTime(), 12 * HORA);
    assert.equal(politicaDe({ tipo: "sin_cuenta" }), POLITICAS_POR_DEFECTO.sin_cuenta);
  });

  test("hay una política declarada para cada titular posible", () => {
    const titulares: Titular[] = [
      { tipo: "sin_cuenta" },
      CLIENTE,
      MESERO,
      { tipo: "personal", rol: "admin", usuarioId: "jefa", localId: LOCAL },
    ];
    for (const titular of titulares) {
      assert.ok(politicaDe(titular).vigenciaMs > 0, `sin política para ${titular.tipo}`);
    }
  });
});

describe("una sesión se puede apagar", () => {
  test("expira sola al vencer el plazo", () => {
    const { sesion } = abrir(MESERO);
    assert.equal(estadoDeSesion(sesion, AHORA), "activa");
    assert.equal(estadoDeSesion(sesion, new Date(sesion.expiraEn.getTime())), "expirada");
  });

  test("revocar es inmediato y la revocación manda sobre el plazo (RF-C-23)", () => {
    const { sesion } = abrir(CLIENTE);
    const revocada = revocarSesion(sesion, AHORA);
    assert.equal(estadoDeSesion(revocada, AHORA), "revocada");
    assert.equal(revocarSesion(revocada, new Date(AHORA.getTime() + HORA)), revocada);
  });

  test("renovar una sesión que no está activa falla en lugar de resucitarla", () => {
    const { sesion } = abrir(CLIENTE);
    const revocada = revocarSesion(sesion, AHORA);
    assert.throws(
      () => renovarSesion({ sesion: revocada, ahora: AHORA }),
      (error: unknown) => error instanceof ErrorPagaya && error.codigo === "sesion_invalida",
    );
  });
});

describe("del dispositivo sin cuenta a la cuenta (F1-23)", () => {
  test("conserva el id y el dispositivo, rota el token y toma la vigencia del rol nuevo", () => {
    const anonima = abrir({ tipo: "sin_cuenta" });
    const promovida = promoverACuenta({
      sesion: anonima.sesion,
      titular: CLIENTE,
      ahora: AHORA,
      aleatorio: aleatorioFijo(99),
    });

    assert.equal(promovida.sesion.id, anonima.sesion.id, "el id cambió: se pierde el carro");
    assert.equal(promovida.sesion.dispositivoId, anonima.sesion.dispositivoId);
    assert.equal(promovida.sesion.creadaEn.getTime(), anonima.sesion.creadaEn.getTime());
    assert.notEqual(promovida.token, anonima.token);
    assert.equal(promovida.sesion.huellaToken, huellaDeToken(promovida.token));
    assert.equal(promovida.sesion.expiraEn.getTime() - AHORA.getTime(), 180 * DIA);
  });

  test("una sesión que ya tiene cuenta no se promueve: eso es abrir otra", () => {
    const { sesion } = abrir(CLIENTE);
    assert.throws(
      () =>
        promoverACuenta({
          sesion,
          titular: MESERO,
          ahora: AHORA,
          aleatorio: aleatorioFijo(5),
        }),
      (error: unknown) => error instanceof ErrorPagaya && error.codigo === "sesion_invalida",
    );
  });

  test("una sesión vencida no se promueve", () => {
    const { sesion } = abrir({ tipo: "sin_cuenta" });
    assert.throws(
      () =>
        promoverACuenta({
          sesion,
          titular: CLIENTE,
          ahora: new Date(sesion.expiraEn.getTime() + 1),
          aleatorio: aleatorioFijo(5),
        }),
      (error: unknown) => error instanceof ErrorPagaya && error.codigo === "sesion_invalida",
    );
  });
});

describe("del token a la sesión", () => {
  test("un token válido devuelve su sesión", async () => {
    const { sesion, token } = abrir(CLIENTE);
    const resultado = await autenticar({
      repositorio: repositorioEnMemoria([sesion]),
      token,
      ahora: AHORA,
    });
    assert.deepEqual(resultado, { ok: true, sesion });
  });

  test("un token desconocido no dice nada más que eso", async () => {
    const { sesion } = abrir(CLIENTE);
    const resultado = await autenticar({
      repositorio: repositorioEnMemoria([sesion]),
      token: "pgs_inventado",
      ahora: AHORA,
    });
    assert.deepEqual(resultado, { ok: false, motivo: "token_desconocido" });
  });

  test("el token de una sesión revocada o vencida no sirve, y el motivo los distingue", async () => {
    const { sesion, token } = abrir(MESERO);
    const repositorio = repositorioEnMemoria([revocarSesion(sesion, AHORA)]);
    assert.deepEqual(await autenticar({ repositorio, token, ahora: AHORA }), {
      ok: false,
      motivo: "sesion_revocada",
    });

    const vigente = repositorioEnMemoria([sesion]);
    assert.deepEqual(
      await autenticar({
        repositorio: vigente,
        token,
        ahora: new Date(sesion.expiraEn.getTime() + 1),
      }),
      { ok: false, motivo: "sesion_expirada" },
    );
  });

  test("el token viejo de una sesión promovida deja de servir", async () => {
    const anonima = abrir({ tipo: "sin_cuenta" });
    const promovida = promoverACuenta({
      sesion: anonima.sesion,
      titular: CLIENTE,
      ahora: AHORA,
      aleatorio: aleatorioFijo(99),
    });
    const repositorio = repositorioEnMemoria([promovida.sesion]);

    assert.deepEqual(await autenticar({ repositorio, token: anonima.token, ahora: AHORA }), {
      ok: false,
      motivo: "token_desconocido",
    });
    const conElNuevo = await autenticar({ repositorio, token: promovida.token, ahora: AHORA });
    assert.equal(conElNuevo.ok, true);
  });
});
