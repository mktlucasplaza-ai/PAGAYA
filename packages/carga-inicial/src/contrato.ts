/**
 * El contrato del archivo de carga, y el modelo que sale de validarlo.
 *
 * F1-05 sustituye por ahora a RF-A-01 a RF-A-04, que llegan en la Fase 4
 * (PRD-001 §18): hasta que exista el panel, la carta, las mesas, los meseros y
 * las asignaciones del local piloto entran por un archivo versionado.
 *
 * El contrato se declara acá, en tipos, y se verifica en `validacion.ts` contra
 * el JSON crudo. Son dos cosas distintas a propósito: `tsc` no mira un archivo
 * que se lee en tiempo de ejecución, así que el tipo sin el validador sería una
 * promesa que nadie cumple.
 */

/** Un valor de campo tal como viaja en el plan: sin anidamiento. */
export type Valor = string | number | boolean | null;

/** Las entidades que F1-05 carga, en el orden en que se pueden escribir. */
export type Entidad =
  | "local"
  | "zona"
  | "categoria"
  | "producto"
  | "variante"
  | "mesa"
  | "mesero"
  | "turno"
  | "asignacion";

/**
 * El orden es parte del contrato con quien implemente el puerto: una zona antes
 * que la mesa que la referencia, una categoría antes que su producto. El
 * adaptador de PostgreSQL puede escribir el plan tal como viene.
 */
export const ORDEN_ENTIDADES: readonly Entidad[] = [
  "local",
  "zona",
  "categoria",
  "producto",
  "variante",
  "mesa",
  "mesero",
  "turno",
  "asignacion",
];

export type Local = {
  readonly slug: string;
  readonly nombre: string;
  /** Zona horaria IANA. PRD-001 §13: "visita del día" y "ventas del día" dependen de ella. */
  readonly zona_horaria: string;
  /** Chile, PRD-002 §1. Se declara para que el día que haya otro mercado falle acá. */
  readonly moneda: "CLP";
};

export type Zona = {
  readonly slug: string;
  readonly nombre: string;
};

export type Categoria = {
  readonly slug: string;
  readonly nombre: string;
  readonly orden: number;
};

/** RF-A-01: categorías, productos, precios, fotos, variantes, disponibilidad. */
export type Producto = {
  readonly sku: string;
  readonly categoria: string;
  readonly nombre: string;
  readonly descripcion: string;
  /** Pesos chilenos, entero: el CLP no tiene decimales. */
  readonly precio: number;
  /**
   * Disponibilidad inicial. Se escribe **solo al crear**: RF-M-12 deja que el
   * mesero marque un producto como agotado durante el servicio, y una segunda
   * corrida del cargador no puede resucitar lo que se acabó.
   */
  readonly disponible: boolean;
  readonly foto: string | null;
  readonly orden: number;
  readonly variantes: readonly Variante[];
};

export type Variante = {
  readonly slug: string;
  readonly nombre: string;
  /** Diferencia sobre el precio del producto, en pesos. Puede ser negativa. */
  readonly precio_delta: number;
};

/**
 * RF-A-02: mesas y zonas, con su QR.
 *
 * `numero` es texto porque no toda mesa es un número: en un local hay "B1" en
 * la barra y "T3" en la terraza. `qr_token` es lo único que el QR necesita
 * llevar; la URL se arma al imprimirlo (F1-11) porque el host depende del
 * ambiente (arquitectura.md §8.4) y el dato que se guarda no.
 */
export type Mesa = {
  readonly numero: string;
  readonly zona: string;
  readonly capacidad: number;
  readonly qr_token: string;
};

/** RF-A-03: usuarios del local. El rol lo da la entidad; acá no hay clientes. */
export type Mesero = {
  readonly codigo: string;
  readonly nombre_pila: string;
  /** E.164. PRD-004 §3: una cuenta por número de teléfono. */
  readonly telefono: string;
};

export type Turno = {
  readonly slug: string;
  readonly nombre: string;
  /** `HH:MM` del local. `fin` menor que `inicio` significa que cruza medianoche. */
  readonly inicio: string;
  readonly fin: string;
};

/**
 * RF-A-04: mesas asignadas a meseros por turno, ya desarmadas a una fila por
 * mesa. La clave natural es (turno, mesa), que es la forma estructural de "una
 * mesa tiene a lo más un mesero en un turno" (ver `validacion.ts`).
 */
export type Asignacion = {
  readonly turno: string;
  readonly mesa: string;
  readonly mesero: string;
};

/** Lo que queda después de validar: el archivo, normalizado y con los derivados resueltos. */
export type LocalPiloto = {
  readonly local: Local;
  readonly zonas: readonly Zona[];
  readonly categorias: readonly Categoria[];
  readonly productos: readonly Producto[];
  readonly mesas: readonly Mesa[];
  readonly meseros: readonly Mesero[];
  readonly turnos: readonly Turno[];
  readonly asignaciones: readonly Asignacion[];
};

/** La versión del formato que entiende este código. Un archivo de otra versión no se adivina. */
export const FORMATO_SOPORTADO = 1;
