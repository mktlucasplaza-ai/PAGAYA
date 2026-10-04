#!/usr/bin/env node
/** Punto de entrada del proceso repartidor. */
import { cargarConfiguracion } from "@pagaya/config";
import { ErrorPagaya } from "@pagaya/nucleo";

import { crearRepartidor } from "./repartidor.ts";

try {
  const config = cargarConfiguracion();
  const repartidor = crearRepartidor(config);
  repartidor.iniciar();
  console.log(
    `repartidor de pagaya en marcha (ambiente ${config.ambiente}, ` +
      `sondeo cada ${config.repartidor.intervaloSondeoMs} ms)`,
  );

  for (const senal of ["SIGINT", "SIGTERM"] as const) {
    process.on(senal, () => {
      console.log(`${senal}: cerrando`);
      void repartidor.detener().then(() => process.exit(0));
    });
  }
} catch (error) {
  if (error instanceof ErrorPagaya) {
    console.error(`[${error.codigo}] ${error.message}`);
    process.exit(1);
  }
  throw error;
}
