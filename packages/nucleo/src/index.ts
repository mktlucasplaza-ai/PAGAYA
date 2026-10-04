/**
 * Núcleo: lo que todos los módulos comparten y nadie debería definir dos veces.
 *
 * No hay reglas de negocio acá, ni en ningún paquete de esta entrega: F1-01 es
 * la fundación. Lo que sí hay son las tres piezas que la fundación necesita
 * para que los módulos siguientes no improvisen cada uno la suya: un error con
 * código, un envoltorio de secreto que no se filtra a los registros y un reloj
 * inyectable.
 */

/**
 * Códigos de error. Son parte del contrato de operación: PRD-003 §5 y
 * arquitectura.md AT-4 (regla 5) exigen que un rechazo quede registrado con su
 * motivo, y un motivo en prosa libre no se puede contar ni alertar.
 */
export type CodigoError =
  | "configuracion_invalida"
  | "migracion_invalida"
  | "no_implementado";

/** Error con código estable. `detalle` es para el humano, `codigo` para la máquina. */
export class ErrorPagaya extends Error {
  readonly codigo: CodigoError;

  constructor(codigo: CodigoError, detalle: string, opciones?: { causa?: unknown }) {
    super(detalle, opciones?.causa === undefined ? undefined : { cause: opciones.causa });
    this.name = "ErrorPagaya";
    this.codigo = codigo;
  }
}

/**
 * Un secreto que se puede pasar pero no imprimir. El valor solo sale por
 * `revelar()`; cualquier otro camino —plantilla de texto, `JSON.stringify`,
 * `console.log`— devuelve el nombre de la variable, no su contenido.
 *
 * Lo exige PRD-001 §14 ("datos de pago solo en la pasarela; cifrado en tránsito
 * y en reposo") por el lado de no dejar credenciales en un registro de errores,
 * que es el lugar más fácil donde se escapan.
 */
export class Secreto {
  readonly nombre: string;
  readonly #valor: string;

  constructor(nombre: string, valor: string) {
    this.nombre = nombre;
    this.#valor = valor;
  }

  revelar(): string {
    return this.#valor;
  }

  toString(): string {
    return `«secreto ${this.nombre}»`;
  }

  toJSON(): string {
    return this.toString();
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return this.toString();
  }
}

/**
 * Reloj inyectable. "Visita del día" y "ventas del día" dependen de la zona
 * horaria del local (PRD-001 §8 y §13): la hora es un dato del dominio, y un
 * dato del dominio no se lee de una función global que las pruebas no pueden
 * mover.
 */
export type Reloj = {
  ahora(): Date;
};

export const relojDelSistema: Reloj = {
  ahora: () => new Date(),
};

/** Reloj fijo para pruebas. */
export function relojFijo(instante: Date): Reloj {
  return { ahora: () => new Date(instante.getTime()) };
}

/**
 * Descriptor de módulo. Cada módulo de arquitectura.md AT-1 publica el suyo:
 * es lo que permite que el proceso que los hospeda (apps/api) verifique al
 * arrancar que están todos, y que una prueba compare la lista de módulos
 * declarados en fronteras.json contra los que existen de verdad.
 *
 * No es decoración: en F1-01 los módulos están vacíos, y un paquete vacío que
 * nadie importa es un paquete que compila para siempre aunque su frontera esté
 * mal declarada.
 */
export type DescriptorModulo = {
  readonly nombre: string;
  readonly capa: "transversal" | "dominio";
  /** Qué va a vivir acá, y qué RF o sección del PRD lo exige. */
  readonly responsabilidad: string;
};
