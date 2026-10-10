#!/usr/bin/env node
/** Punto de entrada del proceso API. */
import { crearAcceso } from "@pagaya/base-datos";
import { cargarConfiguracion } from "@pagaya/config";
import { ErrorPagaya } from "@pagaya/nucleo";

import { MODULOS, crearServidor } from "./servidor.ts";

try {
  const config = cargarConfiguracion();
  const acceso = crearAcceso(config);
  const servidor = crearServidor(config, { acceso });

  servidor.listen(config.api.puerto, () => {
    console.log(
      `api de pagaya en el puerto ${config.api.puerto} ` +
        `(ambiente ${config.ambiente}, ${MODULOS.length} módulos montados)`,
    );
  });

  for (const senal of ["SIGINT", "SIGTERM"] as const) {
    process.on(senal, () => {
      console.log(`${senal}: cerrando`);
      servidor.close(() => {
        acceso.cerrar().finally(() => process.exit(0));
      });
    });
  }
} catch (error) {
  if (error instanceof ErrorPagaya) {
    console.error(`[${error.codigo}] ${error.message}`);
    process.exit(1);
  }
  throw error;
}
