#!/usr/bin/env node
/**
 * `make migrar` — aplica las migraciones pendientes al ambiente de
 * `PAGAYA_AMBIENTE`. No corre dentro de `make verify`: verificar no debe
 * escribir en ninguna base de datos.
 */
import { cargarConfiguracion } from "@pagaya/config";
import { ErrorPagaya } from "@pagaya/nucleo";

import { listarMigraciones } from "./migraciones.ts";
import { migrarAmbiente } from "./postgres.ts";

async function migrar(): Promise<void> {
  const config = cargarConfiguracion();
  const migraciones = listarMigraciones();
  console.log(`ambiente ${config.ambiente}: ${migraciones.length} migración(es) en el repositorio`);

  const informe = await migrarAmbiente(config);
  for (const nombre of informe.yaEstaban) console.log(`  ya estaba  ${nombre}`);
  for (const nombre of informe.aplicadas) console.log(`  aplicada   ${nombre}`);
  if (informe.aplicadas.length === 0) console.log("nada que aplicar");
}

const comando = process.argv[2];
try {
  if (comando === "migrar") {
    await migrar();
  } else {
    console.error(`uso: node packages/base-datos/src/cli.ts migrar`);
    process.exit(2);
  }
} catch (error) {
  if (error instanceof ErrorPagaya) {
    console.error(`[${error.codigo}] ${error.message}`);
  } else {
    console.error(error);
  }
  process.exit(1);
}
