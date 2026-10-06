/**
 * La regla de PRD-001 §14 —"acceso a la comanda limitado a la mesa y al
 * personal del local"— verificada sin base de datos.
 *
 * Que estas pruebas no necesiten PostgreSQL no es comodidad: es la consecuencia
 * de que la regla reciba un descriptor en lugar de importar la comanda
 * (ver acceso.ts). Si algún día necesitaran una base encendida, es que alguien
 * metió una consulta dentro de la decisión.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { aleatorioFijo, relojFijo } from "@pagaya/nucleo";

import {
  comensalesDeLaSesion,
  puedeVerComanda,
  type ComandaParaAcceso,
  type Decision,
  type IdentidadComensal,
} from "./acceso.ts";
import { ROLES, esPersonalDelLocal, type Rol, type Titular } from "./roles.ts";
import { abrirSesion, promoverACuenta, revocarSesion, type Sesion } from "./sesion.ts";

const AHORA = new Date("2026-10-06T21:30:00.000Z");
const LOCAL = "local-fuegos";
const OTRO_LOCAL = "local-del-frente";

/**
 * Una sola fuente de azar para todo el archivo: dos llamadas devuelven dos
 * sesiones con identificadores distintos, que es la situación real. Con una
 * fuente nueva por sesión, dos dispositivos distintos compartirían id y una
 * prueba podría pasar por el motivo equivocado.
 */
const AZAR = aleatorioFijo(7);

function sesionDe(titular: Titular, dispositivoId = "telefono-1"): Sesion {
  return abrirSesion({
    titular,
    dispositivoId,
    reloj: relojFijo(AHORA),
    aleatorio: AZAR,
  }).sesion;
}

function comanda(cambios: Partial<ComandaParaAcceso> = {}): ComandaParaAcceso {
  return {
    localId: LOCAL,
    sesionMesaAbierta: true,
    comensales: [],
    meserosAsignados: [],
    ...cambios,
  };
}

function decidir(sesion: Sesion, sobre: ComandaParaAcceso, ahora = AHORA): Decision {
  return puedeVerComanda({ sesion, comanda: sobre, ahora });
}

function motivo(decision: Decision): string {
  return decision.permitido ? "permitido" : decision.motivo;
}

describe("la mesa ve su comanda", () => {
  test("el comensal registrado que está sentado la ve", () => {
    const sesion = sesionDe({ tipo: "cliente", usuarioId: "camila" });
    const comensales: IdentidadComensal[] = [{ tipo: "cuenta", usuarioId: "camila" }];
    assert.deepEqual(decidir(sesion, comanda({ comensales })), { permitido: true });
  });

  test("el comensal SIN cuenta que está sentado la ve: ver la comanda no exige registro (RF-C-24)", () => {
    const sesion = sesionDe({ tipo: "sin_cuenta" });
    const comensales: IdentidadComensal[] = [{ tipo: "dispositivo", sesionId: sesion.id }];
    assert.deepEqual(decidir(sesion, comanda({ comensales })), { permitido: true });
  });

  test("un dispositivo que no está en esa mesa no la ve, aunque la mesa esté abierta", () => {
    const intruso = sesionDe({ tipo: "sin_cuenta" }, "telefono-del-de-al-lado");
    const comensales: IdentidadComensal[] = [{ tipo: "dispositivo", sesionId: "otra-sesion" }];
    assert.equal(motivo(decidir(intruso, comanda({ comensales }))), "fuera_de_la_mesa");
  });

  test("un cliente registrado del mismo local que no está sentado tampoco la ve", () => {
    const sesion = sesionDe({ tipo: "cliente", usuarioId: "camila" });
    const comensales: IdentidadComensal[] = [{ tipo: "cuenta", usuarioId: "benjamin" }];
    assert.equal(motivo(decidir(sesion, comanda({ comensales }))), "fuera_de_la_mesa");
  });

  test("al cerrarse la sesión de mesa el acceso del comensal se apaga (PRD-001 §16)", () => {
    const sesion = sesionDe({ tipo: "cliente", usuarioId: "camila" });
    const comensales: IdentidadComensal[] = [{ tipo: "cuenta", usuarioId: "camila" }];
    assert.deepEqual(decidir(sesion, comanda({ comensales })), { permitido: true });
    assert.equal(
      motivo(decidir(sesion, comanda({ comensales, sesionMesaAbierta: false }))),
      "sesion_de_mesa_cerrada",
    );
  });

  test("la sesión promovida sigue viendo la comanda que la nombra por su dispositivo (F1-23)", () => {
    const anonima = sesionDe({ tipo: "sin_cuenta" });
    const comensales: IdentidadComensal[] = [{ tipo: "dispositivo", sesionId: anonima.id }];
    const { sesion: registrada } = promoverACuenta({
      sesion: anonima,
      titular: { tipo: "cliente", usuarioId: "camila" },
      ahora: AHORA,
      aleatorio: aleatorioFijo(11),
    });
    assert.deepEqual(decidir(registrada, comanda({ comensales })), { permitido: true });
  });
});

describe("el personal del local ve lo que le toca", () => {
  const mesero: Titular = {
    tipo: "personal",
    rol: "mesero",
    usuarioId: "rodrigo",
    localId: LOCAL,
  };
  const admin: Titular = { tipo: "personal", rol: "admin", usuarioId: "jefa", localId: LOCAL };

  test("el mesero asignado a la mesa la ve sin estar sentado", () => {
    assert.deepEqual(
      decidir(sesionDe(mesero), comanda({ meserosAsignados: ["rodrigo"] })),
      { permitido: true },
    );
  });

  test("el mesero NO asignado no la ve (RF-M-01: solo las mesas a su cargo)", () => {
    assert.equal(
      motivo(decidir(sesionDe(mesero), comanda({ meserosAsignados: ["otra-persona"] }))),
      "mesa_no_asignada",
    );
  });

  test("una mesa sin asignación no la ve ningún mesero; el administrador sí (F1-73)", () => {
    assert.equal(motivo(decidir(sesionDe(mesero), comanda())), "mesa_no_asignada");
    assert.deepEqual(decidir(sesionDe(admin), comanda()), { permitido: true });
  });

  test("el administrador ve el salón completo, incluidas las mesas de otros meseros (RF-A-05)", () => {
    assert.deepEqual(
      decidir(sesionDe(admin), comanda({ meserosAsignados: ["rodrigo"] })),
      { permitido: true },
    );
  });

  test("el personal sigue viendo la comanda con la sesión de mesa cerrada (RF-A-06, RF-A-10)", () => {
    const cerrada = comanda({ sesionMesaAbierta: false, meserosAsignados: ["rodrigo"] });
    assert.deepEqual(decidir(sesionDe(mesero), cerrada), { permitido: true });
    assert.deepEqual(decidir(sesionDe(admin), cerrada), { permitido: true });
  });
});

describe("nadie cruza la frontera del local (PRD-001 §13)", () => {
  test("el mesero de otro local no ve esta comanda ni estando asignado por error", () => {
    const forastero = sesionDe({
      tipo: "personal",
      rol: "mesero",
      usuarioId: "rodrigo",
      localId: OTRO_LOCAL,
    });
    assert.equal(
      motivo(decidir(forastero, comanda({ meserosAsignados: ["rodrigo"] }))),
      "otro_local",
    );
  });

  test("el administrador de otro local tampoco", () => {
    const forastera = sesionDe({
      tipo: "personal",
      rol: "admin",
      usuarioId: "jefa",
      localId: OTRO_LOCAL,
    });
    assert.equal(motivo(decidir(forastera, comanda())), "otro_local");
  });
});

describe("una sesión que no está activa no ve nada", () => {
  const comensales: IdentidadComensal[] = [{ tipo: "cuenta", usuarioId: "camila" }];

  test("la sesión revocada no ve la comanda en la que está sentada", () => {
    const sesion = revocarSesion(sesionDe({ tipo: "cliente", usuarioId: "camila" }), AHORA);
    assert.equal(motivo(decidir(sesion, comanda({ comensales }))), "sesion_revocada");
  });

  test("la sesión expirada tampoco, y el motivo distingue el caso", () => {
    const sesion = sesionDe({ tipo: "cliente", usuarioId: "camila" });
    const muyDespues = new Date(sesion.expiraEn.getTime() + 1);
    assert.equal(motivo(decidir(sesion, comanda({ comensales }), muyDespues)), "sesion_expirada");
  });

  test("la vigencia se revisa antes que todo: también para el personal", () => {
    const sesion = revocarSesion(
      sesionDe({ tipo: "personal", rol: "admin", usuarioId: "jefa", localId: LOCAL }),
      AHORA,
    );
    assert.equal(motivo(decidir(sesion, comanda())), "sesion_revocada");
  });
});

describe("la regla es total", () => {
  test("toda combinación de titular y situación recibe una decisión con motivo", () => {
    const sesion = sesionDe({ tipo: "cliente", usuarioId: "camila" });
    const titulares: Titular[] = [
      { tipo: "sin_cuenta" },
      { tipo: "cliente", usuarioId: "camila" },
      { tipo: "personal", rol: "mesero", usuarioId: "rodrigo", localId: LOCAL },
      { tipo: "personal", rol: "admin", usuarioId: "jefa", localId: LOCAL },
      { tipo: "personal", rol: "mesero", usuarioId: "rodrigo", localId: OTRO_LOCAL },
    ];
    const situaciones: ComandaParaAcceso[] = [
      comanda(),
      comanda({ sesionMesaAbierta: false }),
      comanda({ comensales: [{ tipo: "cuenta", usuarioId: "camila" }] }),
      comanda({ comensales: [{ tipo: "dispositivo", sesionId: sesion.id }] }),
      comanda({ meserosAsignados: ["rodrigo"] }),
      comanda({ localId: OTRO_LOCAL }),
    ];
    for (const titular of titulares) {
      for (const situacion of situaciones) {
        const decision = decidir(sesionDe(titular), situacion);
        assert.ok(
          decision.permitido || typeof decision.motivo === "string",
          `sin motivo para ${JSON.stringify(titular)}`,
        );
      }
    }
  });

  test("la sesión sin cuenta se nombra solo por su dispositivo; la registrada, de las dos formas", () => {
    const anonima = sesionDe({ tipo: "sin_cuenta" });
    assert.deepEqual(comensalesDeLaSesion(anonima), [
      { tipo: "dispositivo", sesionId: anonima.id },
    ]);

    const registrada = sesionDe({ tipo: "cliente", usuarioId: "camila" });
    assert.deepEqual(comensalesDeLaSesion(registrada), [
      { tipo: "cuenta", usuarioId: "camila" },
      { tipo: "dispositivo", sesionId: registrada.id },
    ]);
  });

  test("los tres roles de PRD-001 §12 existen, y dos de ellos son el personal del local", () => {
    assert.deepEqual([...ROLES], ["cliente", "mesero", "admin"]);
    const personal = ROLES.filter((rol: Rol) => esPersonalDelLocal(rol));
    assert.deepEqual(personal, ["mesero", "admin"]);
  });
});
