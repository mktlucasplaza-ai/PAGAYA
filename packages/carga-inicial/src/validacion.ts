/**
 * Validación del archivo de carga.
 *
 * Dos reglas gobiernan este archivo:
 *
 * 1. **Se reportan todos los problemas, no el primero.** Un cargador que falla
 *    de a un error por corrida convierte cada tipeo en un viaje de ida y vuelta
 *    con el humano, que es justo lo que F1-05 viene a ahorrar.
 * 2. **Una clave desconocida es un error, no algo que se ignora.** Un
 *    `"precios": 5900` donde iba `"precio"` que pasa en silencio es un supuesto
 *    no escrito: el archivo dice una cosa y la base guarda otra.
 *
 * Lo que no se valida acá no se valida en ninguna parte: cuando llegue el
 * adaptador de PostgreSQL la base va a repetir las restricciones que
 * pueda —claves únicas, referencias—, pero el archivo se revisa antes de abrir
 * una transacción.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  FORMATO_SOPORTADO,
  type Asignacion,
  type Categoria,
  type LocalPiloto,
  type Mesa,
  type Mesero,
  type Producto,
  type Turno,
  type Variante,
  type Zona,
} from "./contrato.ts";

export type Problema = {
  /** Dónde, en notación de camino: `carta.productos[3].precio`. */
  readonly ruta: string;
  readonly mensaje: string;
};

export type Validacion =
  | {
      readonly ok: true;
      readonly local: LocalPiloto;
      /** Lo que no impide cargar pero alguien tiene que mirar. */
      readonly avisos: readonly Problema[];
    }
  | { readonly ok: false; readonly problemas: readonly Problema[] };

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NUMERO_MESA = /^[A-Z0-9][A-Z0-9-]{0,7}$/;
const TELEFONO = /^\+569\d{8}$/;
const HORA = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const TOKEN_QR = /^[a-z0-9]{10,32}$/;

/** Acumulador de problemas y avisos. Nadie lanza excepciones durante la validación. */
type Recolector = {
  falla(ruta: string, mensaje: string): void;
  avisa(ruta: string, mensaje: string): void;
  readonly problemas: Problema[];
  readonly avisos: Problema[];
};

function recolector(): Recolector {
  const problemas: Problema[] = [];
  const avisos: Problema[] = [];
  return {
    problemas,
    avisos,
    falla: (ruta, mensaje) => problemas.push({ ruta, mensaje }),
    avisa: (ruta, mensaje) => avisos.push({ ruta, mensaje }),
  };
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function objeto(crudo: unknown, ruta: string, r: Recolector): Record<string, unknown> {
  if (esObjeto(crudo)) return crudo;
  r.falla(ruta, "se esperaba un objeto");
  return {};
}

function lista(crudo: unknown, ruta: string, r: Recolector): unknown[] {
  if (Array.isArray(crudo)) return crudo;
  r.falla(ruta, "se esperaba una lista");
  return [];
}

/** Toda clave que el contrato no nombra es un error. Ver la regla 2 del encabezado. */
function soloEstasClaves(
  rec: Record<string, unknown>,
  permitidas: readonly string[],
  ruta: string,
  r: Recolector,
): void {
  for (const clave of Object.keys(rec)) {
    if (permitidas.includes(clave)) continue;
    r.falla(
      ruta === "" ? clave : `${ruta}.${clave}`,
      `clave desconocida; el contrato acepta: ${permitidas.join(", ")}`,
    );
  }
}

function texto(
  rec: Record<string, unknown>,
  campo: string,
  ruta: string,
  r: Recolector,
  patron?: RegExp,
): string {
  const valor = rec[campo];
  const donde = `${ruta}.${campo}`;
  if (typeof valor !== "string" || valor.trim() === "") {
    r.falla(donde, "se esperaba un texto no vacío");
    return "";
  }
  if (patron !== undefined && !patron.test(valor)) {
    r.falla(donde, `'${valor}' no calza con ${String(patron)}`);
    return "";
  }
  return valor;
}

function textoOpcional(
  rec: Record<string, unknown>,
  campo: string,
  ruta: string,
  r: Recolector,
  patron?: RegExp,
): string | null {
  const valor = rec[campo];
  if (valor === undefined || valor === null) return null;
  return texto(rec, campo, ruta, r, patron) || null;
}

function entero(
  rec: Record<string, unknown>,
  campo: string,
  ruta: string,
  r: Recolector,
  limites: { readonly min: number; readonly max?: number },
): number {
  const valor = rec[campo];
  const donde = `${ruta}.${campo}`;
  if (typeof valor !== "number" || !Number.isInteger(valor)) {
    r.falla(
      donde,
      "se esperaba un entero; los montos van en pesos chilenos, que no tienen decimales",
    );
    return limites.min;
  }
  if (valor < limites.min || (limites.max !== undefined && valor > limites.max)) {
    r.falla(donde, `${valor} está fuera del rango permitido`);
    return limites.min;
  }
  return valor;
}

function booleano(
  rec: Record<string, unknown>,
  campo: string,
  ruta: string,
  r: Recolector,
): boolean {
  const valor = rec[campo];
  if (typeof valor === "boolean") return valor;
  r.falla(`${ruta}.${campo}`, "se esperaba true o false");
  return false;
}

function unicos<T>(
  items: readonly T[],
  clave: (item: T) => string,
  ruta: string,
  nombre: string,
  r: Recolector,
): void {
  const vistos = new Map<string, number>();
  items.forEach((item, i) => {
    const k = clave(item);
    if (k === "") return;
    const antes = vistos.get(k);
    if (antes !== undefined) {
      r.falla(`${ruta}[${i}]`, `'${k}': ${nombre} se repite, ya venía en ${ruta}[${antes}]`);
      return;
    }
    vistos.set(k, i);
  });
}

function referencia(
  valor: string,
  declarados: ReadonlySet<string>,
  ruta: string,
  nombre: string,
  r: Recolector,
): void {
  if (valor === "" || declarados.has(valor)) return;
  r.falla(ruta, `'${valor}': ${nombre} no existe en este archivo`);
}

/**
 * La zona horaria tiene que ser una zona IANA escrita en su forma canónica.
 * PRD-001 §13 y §8: "visita del día" y "ventas del día" dependen de ella, así
 * que un `America/Santiaago` que pase callado desplaza el corte del día del
 * local piloto y nadie lo nota hasta el primer reporte.
 */
function zonaHoraria(rec: Record<string, unknown>, ruta: string, r: Recolector): string {
  const declarada = texto(rec, "zona_horaria", ruta, r);
  if (declarada === "") return "";
  let canonica: string;
  try {
    canonica = Intl.DateTimeFormat("es-CL", { timeZone: declarada }).resolvedOptions().timeZone;
  } catch {
    r.falla(`${ruta}.zona_horaria`, `'${declarada}' no es una zona horaria IANA`);
    return "";
  }
  if (canonica !== declarada) {
    r.falla(
      `${ruta}.zona_horaria`,
      `'${declarada}' es un alias; escribe la forma canónica '${canonica}'`,
    );
    return "";
  }
  return declarada;
}

/**
 * Token del QR derivado del local y el número de mesa.
 *
 * Es determinista a propósito: si el cargador sorteara un token, la segunda
 * corrida cambiaría el QR impreso de todas las mesas. Que sea derivable no lo
 * debilita, porque el QR **identifica y no autentica** (PRD-003 §3.1): dice qué
 * mesa es, y quien se sienta ahí todavía tiene que poner el PIN vigente
 * (PRD-002 §3.1). Un local que prefiera un token opaco lo declara en el
 * archivo, y así además sobrevive a una renumeración de mesas.
 */
export function tokenQrDerivado(localSlug: string, numeroMesa: string): string {
  return createHash("sha256").update(`${localSlug}|${numeroMesa}`, "utf8").digest("hex").slice(0, 12);
}

function validarLocal(crudo: unknown, r: Recolector): LocalPiloto["local"] {
  const rec = objeto(crudo, "local", r);
  soloEstasClaves(rec, ["slug", "nombre", "zona_horaria", "moneda"], "local", r);
  const moneda = texto(rec, "moneda", "local", r);
  if (moneda !== "" && moneda !== "CLP") {
    r.falla(
      "local.moneda",
      `'${moneda}': el MVP opera en Chile (PRD-002 §1), la única moneda es CLP`,
    );
  }
  return {
    slug: texto(rec, "slug", "local", r, SLUG),
    nombre: texto(rec, "nombre", "local", r),
    zona_horaria: zonaHoraria(rec, "local", r),
    moneda: "CLP",
  };
}

function validarZonas(crudo: unknown, r: Recolector): Zona[] {
  const zonas = lista(crudo, "zonas", r).map((item, i) => {
    const ruta = `zonas[${i}]`;
    const rec = objeto(item, ruta, r);
    soloEstasClaves(rec, ["slug", "nombre"], ruta, r);
    return { slug: texto(rec, "slug", ruta, r, SLUG), nombre: texto(rec, "nombre", ruta, r) };
  });
  unicos(zonas, (z) => z.slug, "zonas", "la zona", r);
  if (zonas.length === 0) r.falla("zonas", "un local tiene al menos una zona (RF-A-02)");
  return zonas;
}

function validarCategorias(crudo: unknown, r: Recolector): Categoria[] {
  const categorias = lista(crudo, "carta.categorias", r).map((item, i) => {
    const ruta = `carta.categorias[${i}]`;
    const rec = objeto(item, ruta, r);
    soloEstasClaves(rec, ["slug", "nombre", "orden"], ruta, r);
    return {
      slug: texto(rec, "slug", ruta, r, SLUG),
      nombre: texto(rec, "nombre", ruta, r),
      orden: entero(rec, "orden", ruta, r, { min: 1, max: 999 }),
    };
  });
  unicos(categorias, (c) => c.slug, "carta.categorias", "la categoría", r);
  unicos(categorias, (c) => String(c.orden), "carta.categorias", "el orden", r);
  if (categorias.length === 0) {
    r.falla("carta.categorias", "la carta se muestra por categorías (RF-C-03): tiene que haber una");
  }
  return categorias;
}

function validarVariantes(
  crudo: unknown,
  ruta: string,
  precio: number,
  r: Recolector,
): Variante[] {
  if (crudo === undefined) return [];
  const variantes = lista(crudo, ruta, r).map((item, i) => {
    const donde = `${ruta}[${i}]`;
    const rec = objeto(item, donde, r);
    soloEstasClaves(rec, ["slug", "nombre", "precio_delta"], donde, r);
    const delta = entero(rec, "precio_delta", donde, r, { min: -9_999_999, max: 9_999_999 });
    if (precio + delta < 0) {
      r.falla(
        `${donde}.precio_delta`,
        `${delta} deja el precio del producto en ${precio + delta}: una variante no puede hacerlo negativo`,
      );
    }
    return {
      slug: texto(rec, "slug", donde, r, SLUG),
      nombre: texto(rec, "nombre", donde, r),
      precio_delta: delta,
    };
  });
  unicos(variantes, (v) => v.slug, ruta, "la variante", r);
  return variantes;
}

function validarProductos(
  crudo: unknown,
  categorias: readonly Categoria[],
  r: Recolector,
): Producto[] {
  const slugs = new Set(categorias.map((c) => c.slug));
  const productos = lista(crudo, "carta.productos", r).map((item, i) => {
    const ruta = `carta.productos[${i}]`;
    const rec = objeto(item, ruta, r);
    soloEstasClaves(
      rec,
      ["sku", "categoria", "nombre", "descripcion", "precio", "disponible", "foto", "orden", "variantes"],
      ruta,
      r,
    );
    const categoria = texto(rec, "categoria", ruta, r, SLUG);
    referencia(categoria, slugs, `${ruta}.categoria`, "la categoría", r);
    const precio = entero(rec, "precio", ruta, r, { min: 0, max: 99_999_999 });
    return {
      sku: texto(rec, "sku", ruta, r, SLUG),
      categoria,
      nombre: texto(rec, "nombre", ruta, r),
      descripcion: texto(rec, "descripcion", ruta, r),
      precio,
      disponible: booleano(rec, "disponible", ruta, r),
      foto: textoOpcional(rec, "foto", ruta, r),
      orden: entero(rec, "orden", ruta, r, { min: 1, max: 999 }),
      variantes: validarVariantes(rec["variantes"], `${ruta}.variantes`, precio, r),
    };
  });
  unicos(productos, (p) => p.sku, "carta.productos", "el producto", r);
  for (const categoria of categorias) {
    if (categoria.slug === "" || productos.some((p) => p.categoria === categoria.slug)) continue;
    r.avisa(
      "carta.categorias",
      `la categoría '${categoria.slug}' no tiene productos: la carta la mostraría vacía (RF-C-03)`,
    );
  }
  return productos;
}

function validarMesas(
  crudo: unknown,
  localSlug: string,
  zonas: readonly Zona[],
  r: Recolector,
): Mesa[] {
  const slugs = new Set(zonas.map((z) => z.slug));
  const mesas = lista(crudo, "mesas", r).map((item, i) => {
    const ruta = `mesas[${i}]`;
    const rec = objeto(item, ruta, r);
    soloEstasClaves(rec, ["numero", "zona", "capacidad", "qr_token"], ruta, r);
    const numero = texto(rec, "numero", ruta, r, NUMERO_MESA);
    const zona = texto(rec, "zona", ruta, r, SLUG);
    referencia(zona, slugs, `${ruta}.zona`, "la zona", r);
    const declarado = textoOpcional(rec, "qr_token", ruta, r, TOKEN_QR);
    return {
      numero,
      zona,
      capacidad: entero(rec, "capacidad", ruta, r, { min: 1, max: 40 }),
      qr_token: declarado ?? (numero === "" ? "" : tokenQrDerivado(localSlug, numero)),
    };
  });
  unicos(mesas, (m) => m.numero, "mesas", "la mesa", r);
  unicos(mesas, (m) => m.qr_token, "mesas", "el token del QR", r);
  if (mesas.length === 0) r.falla("mesas", "un local piloto tiene al menos una mesa (RF-A-02)");
  return mesas;
}

function validarMeseros(crudo: unknown, r: Recolector): Mesero[] {
  const meseros = lista(crudo, "meseros", r).map((item, i) => {
    const ruta = `meseros[${i}]`;
    const rec = objeto(item, ruta, r);
    soloEstasClaves(rec, ["codigo", "nombre_pila", "telefono"], ruta, r);
    return {
      codigo: texto(rec, "codigo", ruta, r, SLUG),
      nombre_pila: texto(rec, "nombre_pila", ruta, r),
      telefono: texto(rec, "telefono", ruta, r, TELEFONO),
    };
  });
  unicos(meseros, (m) => m.codigo, "meseros", "el mesero", r);
  // PRD-004 §3 y RF-C-02 (mod.): una cuenta por número de teléfono. Dos meseros
  // con el mismo número serían la misma cuenta con dos nombres.
  unicos(meseros, (m) => m.telefono, "meseros", "el teléfono", r);
  if (meseros.length === 0) r.falla("meseros", "sin meseros no hay a quién notificar (RF-M-01)");
  return meseros;
}

function validarTurnos(crudo: unknown, r: Recolector): Turno[] {
  const turnos = lista(crudo, "turnos", r).map((item, i) => {
    const ruta = `turnos[${i}]`;
    const rec = objeto(item, ruta, r);
    soloEstasClaves(rec, ["slug", "nombre", "inicio", "fin"], ruta, r);
    const inicio = texto(rec, "inicio", ruta, r, HORA);
    const fin = texto(rec, "fin", ruta, r, HORA);
    if (inicio !== "" && inicio === fin) {
      r.falla(`${ruta}.fin`, "el turno empieza y termina a la misma hora");
    }
    return {
      slug: texto(rec, "slug", ruta, r, SLUG),
      nombre: texto(rec, "nombre", ruta, r),
      inicio,
      fin,
    };
  });
  unicos(turnos, (t) => t.slug, "turnos", "el turno", r);
  if (turnos.length === 0) {
    r.falla("turnos", "las mesas se asignan por turno (RF-A-04): tiene que haber uno");
  }
  return turnos;
}

/**
 * Desarma las asignaciones a una fila por (turno, mesa).
 *
 * **Supuesto explícito:** una mesa tiene a lo más un mesero por turno. Ningún
 * PRD lo dice con esas palabras, pero PRD-001 §9 manda cada notificación "al
 * mesero de la mesa" en singular y escala al administrador cuando *no hay*
 * asignación: dos meseros para la misma mesa duplicarían cada aviso de RF-M-02
 * y RF-M-03 y dejarían sin definir quién atiende. Si el local necesita dos, es
 * un PRD nuevo, no un archivo de carga.
 */
function validarAsignaciones(
  crudo: unknown,
  mesas: readonly Mesa[],
  meseros: readonly Mesero[],
  turnos: readonly Turno[],
  r: Recolector,
): Asignacion[] {
  const numeros = new Set(mesas.map((m) => m.numero));
  const codigos = new Set(meseros.map((m) => m.codigo));
  const slugsTurno = new Set(turnos.map((t) => t.slug));
  const porClave = new Map<string, { readonly mesero: string; readonly ruta: string }>();
  const asignaciones: Asignacion[] = [];

  lista(crudo, "asignaciones", r).forEach((item, i) => {
    const ruta = `asignaciones[${i}]`;
    const rec = objeto(item, ruta, r);
    soloEstasClaves(rec, ["turno", "mesero", "mesas"], ruta, r);
    const turno = texto(rec, "turno", ruta, r, SLUG);
    referencia(turno, slugsTurno, `${ruta}.turno`, "el turno", r);
    const mesero = texto(rec, "mesero", ruta, r, SLUG);
    referencia(mesero, codigos, `${ruta}.mesero`, "el mesero", r);
    const suyas = lista(rec["mesas"], `${ruta}.mesas`, r);
    if (suyas.length === 0) {
      r.falla(`${ruta}.mesas`, "una asignación sin mesas no asigna nada");
    }
    suyas.forEach((numero, j) => {
      const donde = `${ruta}.mesas[${j}]`;
      if (typeof numero !== "string") {
        r.falla(donde, "se esperaba el número de mesa como texto");
        return;
      }
      referencia(numero, numeros, donde, "la mesa", r);
      if (!numeros.has(numero)) return;
      const clave = `${turno}|${numero}`;
      const antes = porClave.get(clave);
      if (antes !== undefined) {
        r.falla(
          donde,
          `la mesa '${numero}' ya está asignada a '${antes.mesero}' en el turno '${turno}' ` +
            `(${antes.ruta}); una mesa tiene a lo más un mesero por turno (PRD-001 §9)`,
        );
        return;
      }
      porClave.set(clave, { mesero, ruta: donde });
      asignaciones.push({ turno, mesa: numero, mesero });
    });
  });

  for (const turno of turnos) {
    for (const mesa of mesas) {
      if (porClave.has(`${turno.slug}|${mesa.numero}`)) continue;
      r.avisa(
        "asignaciones",
        `la mesa '${mesa.numero}' no tiene mesero en el turno '${turno.slug}': ` +
          `sus avisos escalan al administrador de turno (PRD-001 §9)`,
      );
    }
  }
  for (const mesero of meseros) {
    if (asignaciones.some((a) => a.mesero === mesero.codigo)) continue;
    r.avisa(
      "asignaciones",
      `el mesero '${mesero.codigo}' no tiene mesas en ningún turno: su app abriría vacía (RF-M-01)`,
    );
  }

  return asignaciones;
}

/** Valida el JSON ya parseado. No lanza: devuelve el modelo o la lista de problemas. */
export function validar(crudo: unknown): Validacion {
  const r = recolector();
  const raiz = objeto(crudo, "", r);
  soloEstasClaves(
    raiz,
    ["formato", "local", "carta", "zonas", "mesas", "meseros", "turnos", "asignaciones"],
    "",
    r,
  );

  const formato = raiz["formato"];
  if (formato !== FORMATO_SOPORTADO) {
    // Un formato desconocido no se adivina: se detiene acá, porque cualquier
    // mensaje posterior sería sobre un contrato que este código no entiende.
    r.falla(
      "formato",
      `se esperaba ${FORMATO_SOPORTADO} y hay ${JSON.stringify(formato)}; ` +
        `este código no sabe leer otra versión del contrato`,
    );
    return { ok: false, problemas: r.problemas };
  }

  const local = validarLocal(raiz["local"], r);
  const carta = objeto(raiz["carta"], "carta", r);
  soloEstasClaves(carta, ["categorias", "productos"], "carta", r);
  const categorias = validarCategorias(carta["categorias"], r);
  const productos = validarProductos(carta["productos"], categorias, r);
  const zonas = validarZonas(raiz["zonas"], r);
  const mesas = validarMesas(raiz["mesas"], local.slug, zonas, r);
  const meseros = validarMeseros(raiz["meseros"], r);
  const turnos = validarTurnos(raiz["turnos"], r);
  const asignaciones = validarAsignaciones(raiz["asignaciones"], mesas, meseros, turnos, r);

  if (r.problemas.length > 0) return { ok: false, problemas: r.problemas };
  return {
    ok: true,
    local: { local, zonas, categorias, productos, mesas, meseros, turnos, asignaciones },
    avisos: r.avisos,
  };
}

/** El archivo de ejemplo versionado en el repositorio. Datos ficticios. */
export function archivoEjemplo(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "datos", "local-piloto-demo.json");
}

/** Lee y valida un archivo. Un JSON mal formado es un problema más, no una excepción. */
export function validarArchivo(ruta: string): Validacion {
  let texto: string;
  try {
    texto = readFileSync(ruta, "utf8");
  } catch (error) {
    return {
      ok: false,
      problemas: [{ ruta, mensaje: `no se pudo leer: ${(error as Error).message}` }],
    };
  }
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch (error) {
    return { ok: false, problemas: [{ ruta, mensaje: `JSON inválido: ${(error as Error).message}` }] };
  }
  return validar(crudo);
}
