import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cargarConfiguracion } from "@pagaya/config";

import { crearRepartidor } from "./repartidor.ts";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function config() {
  return cargarConfiguracion({
    ambiente: "dev",
    raiz: RAIZ,
    entorno: {
      PAGAYA_BD_URL: "postgres://pagaya:de-mentira@localhost:5432/pagaya_prueba",
      PAGAYA_FIRMA_SESION: "de-mentira",
    },
  });
}

describe("el segundo proceso arranca y se apaga", () => {
  test("hace su pasada al ritmo configurado y detener() espera la que está en curso", async () => {
    let pasadas = 0;
    const repartidor = crearRepartidor(
      { ...config(), repartidor: { intervaloSondeoMs: 50, topeReintentos: 5 } },
      {
        pasada: async () => {
          pasadas += 1;
          return 0;
        },
      },
    );

    repartidor.iniciar();
    repartidor.iniciar(); // idempotente: no debe abrir un segundo ciclo
    await new Promise((listo) => setTimeout(listo, 180));
    await repartidor.detener();

    const alDetener = pasadas;
    assert.ok(alDetener >= 1, `se esperaba al menos una pasada, hubo ${alDetener}`);
    assert.ok(alDetener <= 5, `con un ciclo solo deberían caber ~3 pasadas, hubo ${alDetener}`);

    await new Promise((listo) => setTimeout(listo, 120));
    assert.equal(pasadas, alDetener, "después de detener() no debe seguir repartiendo");
  });

  test("una pasada que falla se reporta y no mata el proceso", async () => {
    let intentos = 0;
    const reportados: string[] = [];
    const repartidor = crearRepartidor(
      { ...config(), repartidor: { intervaloSondeoMs: 50, topeReintentos: 5 } },
      {
        pasada: async () => {
          intentos += 1;
          throw new Error("el proveedor de push no responde");
        },
        registrar: (mensaje) => reportados.push(mensaje),
      },
    );
    repartidor.iniciar();
    await new Promise((listo) => setTimeout(listo, 180));
    await repartidor.detener();
    assert.ok(intentos >= 2, "debe seguir intentando después de un fallo");
    assert.equal(reportados.length, intentos, "cada fallo se reporta una vez");
  });
});
