/**
 * Carga del ambiente. Un ambiente es un archivo (`ambientes/<nombre>.json`);
 * una credencial es una variable de entorno cuyo *nombre* declara ese archivo.
 * Ver ambientes/README.md.
 *
 * Qué lo exige: PRD-001 §13 pide multi-tenant y zona horaria por local, y
 * PRD-001 §14 pide que los datos sensibles no se guarden donde no corresponde.
 * De ahí las dos reglas de este paquete: ningún valor de credencial en el
 * repositorio, y nada arranca con un secreto a medias.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ErrorPagaya, Secreto } from "@pagaya/nucleo";

export type NivelRegistro = "debug" | "info" | "warn" | "error";

export type Configuracion = {
  readonly ambiente: string;
  readonly api: {
    readonly puerto: number;
    readonly origenesPermitidos: readonly string[];
  };
  readonly baseDatos: {
    /** Cadena de conexión completa. Nunca se imprime: ver `Secreto`. */
    readonly url: Secreto;
    readonly ssl: boolean;
    readonly maxConexiones: number;
  };
  readonly repartidor: {
    readonly intervaloSondeoMs: number;
    readonly topeReintentos: number;
  };
  readonly registro: {
    readonly nivel: NivelRegistro;
  };
  readonly firmaSesion: Secreto;
};

export type OpcionesCarga = {
  /** Nombre del ambiente. Por defecto, `PAGAYA_AMBIENTE` del entorno. */
  readonly ambiente?: string;
  /** Entorno de donde salen los secretos. Por defecto, `process.env`. */
  readonly entorno?: Readonly<Record<string, string | undefined>>;
  /** Raíz del repositorio. Por defecto, la que contiene a `ambientes/`. */
  readonly raiz?: string;
};

const NIVELES: readonly NivelRegistro[] = ["debug", "info", "warn", "error"];

function raizPorDefecto(): string {
  // packages/config/src -> packages/config -> packages -> raíz
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}

function invalida(detalle: string, causa?: unknown): ErrorPagaya {
  return new ErrorPagaya(
    "configuracion_invalida",
    detalle,
    causa === undefined ? undefined : { causa },
  );
}

/** Los ambientes que existen hoy, leídos del directorio. */
export function ambientesDisponibles(raiz: string = raizPorDefecto()): string[] {
  try {
    return readdirSync(join(raiz, "ambientes"))
      .filter((n) => n.endsWith(".json"))
      .map((n) => n.slice(0, -".json".length))
      .sort();
  } catch (causa) {
    throw invalida(`no se puede leer el directorio ambientes/ en ${raiz}`, causa);
  }
}

function leerObjeto(valor: unknown, ruta: string): Record<string, unknown> {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) {
    throw invalida(`${ruta}: se esperaba un objeto`);
  }
  return valor as Record<string, unknown>;
}

function leerEntero(valor: unknown, ruta: string, minimo: number): number {
  if (typeof valor !== "number" || !Number.isInteger(valor) || valor < minimo) {
    throw invalida(`${ruta}: se esperaba un entero >= ${minimo}, llegó ${JSON.stringify(valor)}`);
  }
  return valor;
}

function leerBooleano(valor: unknown, ruta: string): boolean {
  if (typeof valor !== "boolean") {
    throw invalida(`${ruta}: se esperaba true o false, llegó ${JSON.stringify(valor)}`);
  }
  return valor;
}

function leerTextos(valor: unknown, ruta: string): string[] {
  if (!Array.isArray(valor) || valor.some((v) => typeof v !== "string" || v.length === 0)) {
    throw invalida(`${ruta}: se esperaba una lista de textos no vacíos`);
  }
  return valor as string[];
}

function leerSecreto(
  nombreVariable: unknown,
  ruta: string,
  entorno: Readonly<Record<string, string | undefined>>,
): Secreto {
  if (typeof nombreVariable !== "string" || !/^[A-Z][A-Z0-9_]*$/.test(nombreVariable)) {
    throw invalida(
      `${ruta}: se esperaba el NOMBRE de una variable de entorno en MAYÚSCULAS, ` +
        `llegó ${JSON.stringify(nombreVariable)}. Acá va el nombre del secreto, nunca su valor.`,
    );
  }
  const valor = entorno[nombreVariable];
  if (valor === undefined || valor.length === 0) {
    throw invalida(
      `falta la variable de entorno ${nombreVariable}, declarada en ${ruta}. ` +
        `No hay valor por defecto para un secreto: ver ambientes/README.md.`,
    );
  }
  return new Secreto(nombreVariable, valor);
}

/**
 * Lee el ambiente y devuelve la configuración completa, o falla. No existe un
 * estado intermedio: un proceso que arranca con la mitad de su configuración es
 * un proceso que falla más tarde y más lejos.
 */
export function cargarConfiguracion(opciones: OpcionesCarga = {}): Configuracion {
  const entorno = opciones.entorno ?? process.env;
  const raiz = opciones.raiz ?? raizPorDefecto();
  const nombre = opciones.ambiente ?? entorno["PAGAYA_AMBIENTE"];

  if (nombre === undefined || nombre.length === 0) {
    throw invalida(
      `falta PAGAYA_AMBIENTE. Ambientes disponibles: ${ambientesDisponibles(raiz).join(", ")}. ` +
        `No hay ambiente por defecto a propósito: ver ambientes/README.md.`,
    );
  }
  if (!/^[a-z][a-z0-9-]*$/.test(nombre)) {
    throw invalida(`PAGAYA_AMBIENTE='${nombre}' no es un nombre de ambiente válido`);
  }

  const archivo = join(raiz, "ambientes", `${nombre}.json`);
  let crudo: unknown;
  try {
    crudo = JSON.parse(readFileSync(archivo, "utf8")) as unknown;
  } catch (causa) {
    throw invalida(
      `no se puede leer ${archivo}. Ambientes disponibles: ${ambientesDisponibles(raiz).join(", ")}`,
      causa,
    );
  }

  const raiz_ = leerObjeto(crudo, archivo);
  if (raiz_["ambiente"] !== nombre) {
    throw invalida(
      `${archivo}: el campo "ambiente" dice ${JSON.stringify(raiz_["ambiente"])} ` +
        `y el archivo se llama ${nombre}.json`,
    );
  }

  const api = leerObjeto(raiz_["api"], `${archivo} > api`);
  const bd = leerObjeto(raiz_["base_datos"], `${archivo} > base_datos`);
  const rep = leerObjeto(raiz_["repartidor"], `${archivo} > repartidor`);
  const reg = leerObjeto(raiz_["registro"], `${archivo} > registro`);
  const secretos = leerObjeto(raiz_["secretos"], `${archivo} > secretos`);

  const nivel = reg["nivel"];
  if (typeof nivel !== "string" || !NIVELES.includes(nivel as NivelRegistro)) {
    throw invalida(`${archivo} > registro.nivel: se esperaba uno de ${NIVELES.join(" | ")}`);
  }

  return {
    ambiente: nombre,
    api: {
      puerto: leerEntero(api["puerto"], `${archivo} > api.puerto`, 0),
      origenesPermitidos: leerTextos(
        api["origenes_permitidos"],
        `${archivo} > api.origenes_permitidos`,
      ),
    },
    baseDatos: {
      url: leerSecreto(
        secretos["url_base_datos"],
        `${archivo} > secretos.url_base_datos`,
        entorno,
      ),
      ssl: leerBooleano(bd["ssl"], `${archivo} > base_datos.ssl`),
      maxConexiones: leerEntero(bd["max_conexiones"], `${archivo} > base_datos.max_conexiones`, 1),
    },
    repartidor: {
      intervaloSondeoMs: leerEntero(
        rep["intervalo_sondeo_ms"],
        `${archivo} > repartidor.intervalo_sondeo_ms`,
        50,
      ),
      topeReintentos: leerEntero(rep["tope_reintentos"], `${archivo} > repartidor.tope_reintentos`, 1),
    },
    registro: { nivel: nivel as NivelRegistro },
    firmaSesion: leerSecreto(
      secretos["firma_sesion"],
      `${archivo} > secretos.firma_sesion`,
      entorno,
    ),
  };
}
