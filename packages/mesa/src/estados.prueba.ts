/**
 * Las transiciones de PRD-001 §15 y PRD-002 §3.4, verificadas sin base de
 * datos (ver estados.ts: son funciones puras, igual que `puedeVerComanda` en
 * `@pagaya/identidad/acceso`).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  abrirSesion,
  cerrarMesa,
  cerrarSesion,
  ocuparMesa,
  type EstadoMesa,
  type EstadoSesionMesa,
} from "./estados.ts";

const TODOS_LOS_ESTADOS_DE_MESA: readonly EstadoMesa[] = [
  "libre",
  "ocupada",
  "pago_pendiente",
  "pagada",
  "bloqueada",
];

const TODOS_LOS_ESTADOS_DE_SESION: readonly (EstadoSesionMesa | null)[] = [null, "abierta", "cerrada"];

describe("ocuparMesa", () => {
  test("desde libre, ocupa la mesa", () => {
    const resultado = ocuparMesa("libre");
    assert.deepEqual(resultado, { aplicada: true, estado: "ocupada" });
  });

  for (const desde of TODOS_LOS_ESTADOS_DE_MESA.filter((estado) => estado !== "libre")) {
    test(`rechaza ocupar desde ${desde}`, () => {
      const resultado = ocuparMesa(desde);
      assert.deepEqual(resultado, {
        aplicada: false,
        motivo: { accion: "ocupar", desde },
      });
    });
  }
});

describe("cerrarMesa", () => {
  test("desde ocupada, libera la mesa", () => {
    const resultado = cerrarMesa("ocupada");
    assert.deepEqual(resultado, { aplicada: true, estado: "libre" });
  });

  for (const desde of TODOS_LOS_ESTADOS_DE_MESA.filter((estado) => estado !== "ocupada")) {
    test(`rechaza cerrar la mesa desde ${desde}`, () => {
      const resultado = cerrarMesa(desde);
      assert.deepEqual(resultado, {
        aplicada: false,
        motivo: { accion: "cerrar", desde },
      });
    });
  }
});

describe("abrirSesion", () => {
  test("sin sesión previa, abre la sesión", () => {
    const resultado = abrirSesion(null);
    assert.deepEqual(resultado, { aplicada: true, estado: "abierta" });
  });

  for (const desde of TODOS_LOS_ESTADOS_DE_SESION.filter((estado) => estado !== null)) {
    test(`rechaza abrir una segunda sesión cuando ya hay una ${desde}`, () => {
      const resultado = abrirSesion(desde);
      assert.deepEqual(resultado, {
        aplicada: false,
        motivo: { accion: "abrir", desde },
      });
    });
  }
});

describe("cerrarSesion", () => {
  test("desde abierta, cierra la sesión", () => {
    const resultado = cerrarSesion("abierta");
    assert.deepEqual(resultado, { aplicada: true, estado: "cerrada" });
  });

  for (const desde of TODOS_LOS_ESTADOS_DE_SESION.filter((estado) => estado !== "abierta")) {
    test(`rechaza cerrar la sesión desde ${JSON.stringify(desde)}`, () => {
      const resultado = cerrarSesion(desde);
      assert.deepEqual(resultado, {
        aplicada: false,
        motivo: { accion: "cerrar", desde },
      });
    });
  }
});
