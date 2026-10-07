#!/usr/bin/env node
/**
 * `make cargar-piloto` — valida el archivo del local y muestra o aplica el plan.
 *
 *   node packages/carga-inicial/src/cli.ts validar [archivo]
 *   node packages/carga-inicial/src/cli.ts plan    [archivo]
 *   node packages/carga-inicial/src/cli.ts cargar  [archivo]
 *
 * Sin archivo se usa el ejemplo versionado del repositorio, que son datos
 * ficticios: así `validar` se puede correr recién clonado el repositorio, sin
 * base de datos ni ambiente.
 *
 * `plan` y `cargar` sí necesitan la base: desde F1-06 el plan se calcula contra
 * el estado real del local —que es lo único que hace de la idempotencia una
 * propiedad y no una promesa— y la escritura entra por `entreLocales`
 * (docs/arquitectura.md §12, AT-19). `plan` no escribe nada: lee el estado,
 * compara y muestra.
 */
import { cargarConfiguracion } from "@pagaya/config";
import { crearAcceso, type Acceso } from "@pagaya/base-datos";
import { ErrorPagaya } from "@pagaya/nucleo";

import { cargar, planificar, resumir } from "./plan.ts";
import { repositorioPostgres } from "./repositorio-postgres.ts";
import { archivoEjemplo, validarArchivo, type Validacion } from "./validacion.ts";

function validado(archivo: string): Validacion & { ok: true } {
  console.log(`archivo: ${archivo}`);
  const resultado = validarArchivo(archivo);
  if (!resultado.ok) {
    console.error(`\n${resultado.problemas.length} problema(s):`);
    for (const problema of resultado.problemas) {
      console.error(`  ${problema.ruta === "" ? "(raíz)" : problema.ruta}: ${problema.mensaje}`);
    }
    throw new ErrorPagaya("carga_invalida", "el archivo no cumple el contrato de carga");
  }
  for (const aviso of resultado.avisos) console.log(`  aviso  ${aviso.ruta}: ${aviso.mensaje}`);
  return resultado;
}

function contar(resultado: Validacion & { ok: true }): void {
  const { local } = resultado;
  console.log(
    `local '${local.local.slug}' (${local.local.zona_horaria}): ` +
      `${local.categorias.length} categoría(s), ${local.productos.length} producto(s), ` +
      `${local.zonas.length} zona(s), ${local.mesas.length} mesa(s), ` +
      `${local.meseros.length} mesero(s), ${local.turnos.length} turno(s), ` +
      `${local.asignaciones.length} asignación(es)`,
  );
}

/** El acceso del ambiente de `PAGAYA_AMBIENTE`. Lo cierra quien lo abre. */
function abrirAcceso(): Acceso {
  const config = cargarConfiguracion();
  console.log(`ambiente ${config.ambiente}`);
  return crearAcceso(config);
}

async function ejecutar(comando: string | undefined, archivo: string): Promise<void> {
  if (comando === "validar") {
    const resultado = validado(archivo);
    contar(resultado);
    console.log("el archivo cumple el contrato");
    return;
  }

  if (comando !== "plan" && comando !== "cargar") {
    console.error(
      "uso: node packages/carga-inicial/src/cli.ts validar|plan|cargar [archivo.json]",
    );
    process.exit(2);
    return;
  }

  const resultado = validado(archivo);
  contar(resultado);

  const acceso = abrirAcceso();
  try {
    const repositorio = repositorioPostgres(acceso);
    if (comando === "plan") {
      const estado = await repositorio.leerEstado(resultado.local.local.slug);
      const plan = planificar(resultado.local, estado);
      console.log(`\nplan sobre el estado actual (${estado.length} fila(s) en la base):`);
      for (const linea of resumir(plan)) console.log(linea);
      return;
    }
    const plan = await cargar(repositorio, resultado.local);
    console.log("\naplicado:");
    for (const linea of resumir(plan)) console.log(linea);
    if (plan.cambios.length === 0) {
      console.log("nada que escribir: el local ya está como dice el archivo");
    }
  } finally {
    await acceso.cerrar();
  }
}

try {
  await ejecutar(process.argv[2], process.argv[3] ?? archivoEjemplo());
} catch (error) {
  if (error instanceof ErrorPagaya) {
    console.error(`\n[${error.codigo}] ${error.message}`);
  } else {
    console.error(error);
  }
  process.exit(1);
}
