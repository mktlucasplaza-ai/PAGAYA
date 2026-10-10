/**
 * El puerto de encolar, probado sin `evento_salida` (la crea F1-70b).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { aleatorioFijo, relojFijo } from "@pagaya/nucleo";

import { outboxEnMemoria } from "./outbox-memoria.ts";

describe("outboxEnMemoria", () => {
  test("encolar guarda el evento con id, tipo y payload del productor", async () => {
    const reloj = relojFijo(new Date("2026-10-10T12:00:00.000Z"));
    const outbox = outboxEnMemoria({ reloj, aleatorio: aleatorioFijo() });

    const encolado = await outbox.encolar({ tipo: "otp_solicitado", payload: { telefono: "+56912345678" } });

    assert.equal(encolado.tipo, "otp_solicitado");
    assert.deepEqual(encolado.payload, { telefono: "+56912345678" });
    assert.equal(encolado.creadoEn.toISOString(), "2026-10-10T12:00:00.000Z");
    assert.match(encolado.idEvento, /^[0-9a-f]{32}$/);
  });

  test("dos eventos encolados no comparten id, y quedan en el orden en que se encolaron", async () => {
    const outbox = outboxEnMemoria({ reloj: relojFijo(new Date()), aleatorio: aleatorioFijo() });

    await outbox.encolar({ tipo: "otp_solicitado", payload: { telefono: "+56911111111" } });
    await outbox.encolar({ tipo: "otp_solicitado", payload: { telefono: "+56922222222" } });

    const [primero, segundo] = outbox.eventos();
    assert.ok(primero && segundo);
    assert.notEqual(primero.idEvento, segundo.idEvento);
    assert.equal((primero.payload as { telefono: string }).telefono, "+56911111111");
    assert.equal((segundo.payload as { telefono: string }).telefono, "+56922222222");
  });
});
