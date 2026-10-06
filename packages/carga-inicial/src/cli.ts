#!/usr/bin/env node
/**
 * `make cargar-piloto` — valida el archivo del local y muestra o aplica el plan.
 *
 *   node packages/carga-inicial/src/cli.ts validar [archivo]
 *   node packages/carga-inicial/src/cli.ts plan    [archivo]
 *   node packages/carga-inicial/src/cli.ts cargar  [archivo]
 *
 * Sin archivo se usa el ejemplo versionado del repositorio, que son datos
 * ficticios: así el comando se puede correr recién clonado el repositorio.
 *
 * `cargar` falla a propósito mientras las tablas no existan: lo que escribe en
 * PostgreSQL es el adaptador del puerto `RepositorioCarga`, y ese adaptador
 * llega con esas tablas (ver docs/arquitectura.md §11.2). Un cargador que "cargara" en
 * memoria y dijera que terminó sería un auto-reporte, que es justo lo que
 * CLAUDE.md prohíbe.
 */
import { ErrorPagaya } from "@pagaya/nucleo";

import { cargar, resumir } from "./plan.ts";
import { repositorioMemoria } from "./repositorio-memoria.ts";
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

async function ejecutar(comando: string | undefined, archivo: string): Promise<void> {
  if (comando === "validar") {
    const resultado = validado(archivo);
    contar(resultado);
    console.log("el archivo cumple el contrato");
    return;
  }

  if (comando === "plan") {
    const resultado = validado(archivo);
    contar(resultado);
    // Contra un local vacío: es lo que haría la primera carga. El estado real
    // sale de la base, y esas tablas todavía no existen.
    const plan = await cargar(repositorioMemoria(), resultado.local);
    console.log("\nplan sobre un local vacío:");
    for (const linea of resumir(plan)) console.log(linea);
    return;
  }

  if (comando === "cargar") {
    const resultado = validado(archivo);
    contar(resultado);
    throw new ErrorPagaya(
      "no_implementado",
      "el archivo es válido, pero todavía no hay dónde escribirlo: las tablas de la carta, " +
        "las mesas y el personal no existen todavía. El aislamiento por local ya está " +
        "(F1-02 dejó `entreLocales` nombrada para esta carga), así que lo que falta es la " +
        "migración de esas tablas y el adaptador del puerto RepositorioCarga " +
        "(docs/arquitectura.md §11.2). Mientras tanto, `plan` muestra qué escribiría.",
    );
  }

  console.error(
    "uso: node packages/carga-inicial/src/cli.ts validar|plan|cargar [archivo.json]",
  );
  process.exit(2);
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
