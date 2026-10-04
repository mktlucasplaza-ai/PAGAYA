/**
 * Lectura del grafo de fronteras y del código real.
 *
 * Lo usan dos consumidores: `eslint.config.js`, que convierte el grafo en
 * reglas de lint para que la violación se vea en el editor, y
 * `scripts/fronteras.prueba.ts`, que es la verificación autoritativa —resuelve
 * rutas de verdad, así que también atrapa lo que el lint no ve, como un
 * `../../otro-paquete/src`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ: string = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export type Capa = "base" | "infraestructura" | "transversal" | "dominio" | "aplicacion";

export type Paquete = {
  readonly ruta: string;
  readonly capa: Capa;
  readonly puede_importar: readonly string[];
  readonly porque: string;
};

export type Fronteras = {
  readonly orden_de_capas: readonly Capa[];
  readonly dependencias_externas: Readonly<Record<string, readonly string[] | string>>;
  readonly paquetes: Readonly<Record<string, Paquete>>;
};

export function leerFronteras(): Fronteras {
  return JSON.parse(readFileSync(join(RAIZ, "fronteras.json"), "utf8")) as Fronteras;
}

/** Todos los `.ts` de un directorio, recursivo, sin `node_modules`. */
export function archivosTs(directorio: string): string[] {
  const encontrados: string[] = [];
  const pendientes = [directorio];
  while (pendientes.length > 0) {
    const actual = pendientes.pop() as string;
    for (const entrada of readdirSync(actual, { withFileTypes: true })) {
      if (entrada.name === "node_modules" || entrada.name.startsWith(".")) continue;
      const ruta = join(actual, entrada.name);
      if (entrada.isDirectory()) pendientes.push(ruta);
      else if (entrada.name.endsWith(".ts")) encontrados.push(ruta);
    }
  }
  return encontrados.sort();
}

export type Importacion = {
  readonly archivo: string;
  readonly especificador: string;
};

const PATRON_IMPORT =
  /(?:^|[\s;{}()])(?:import|export)\s[^;'"]*?from\s*["']([^"']+)["']|(?:^|[\s;{}()])import\s*["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)|\brequire\(\s*["']([^"']+)["']\s*\)/g;

export function importacionesDe(archivo: string): Importacion[] {
  const texto = readFileSync(archivo, "utf8");
  const encontradas: Importacion[] = [];
  for (const coincidencia of texto.matchAll(PATRON_IMPORT)) {
    const especificador =
      coincidencia[1] ?? coincidencia[2] ?? coincidencia[3] ?? coincidencia[4];
    if (especificador !== undefined) encontradas.push({ archivo, especificador });
  }
  return encontradas;
}

/** A qué paquete pertenece un archivo, por su ruta. */
export function paqueteDe(
  archivo: string,
  fronteras: Fronteras,
): { nombre: string; paquete: Paquete } | undefined {
  const relativo = relative(RAIZ, archivo);
  for (const [nombre, paquete] of Object.entries(fronteras.paquetes)) {
    if (relativo === paquete.ruta || relativo.startsWith(paquete.ruta + sep)) {
      return { nombre, paquete };
    }
  }
  return undefined;
}

export function esDirectorio(ruta: string): boolean {
  try {
    return statSync(ruta).isDirectory();
  } catch {
    return false;
  }
}
