/**
 * La máquina de estados de la mesa y su sesión (F1-10b).
 *
 * **Qué lo exige.** PRD-001 §15 dibuja el ciclo de la mesa —`libre → ocupada →
 * pago_pendiente → pagada → libre`, con la rama de la comanda anulada
 * volviendo directo a `libre`— y PRD-002 §3.4, textual: la sesión de mesa "se
 * abre al primer ingreso (por PIN o por el mesero) y se cierra con el pago y
 * la liberación". La migración 0004 (`docs/arquitectura.md` §13) ya declaró
 * los valores válidos de `mesa.estado` y `sesion_mesa.estado` en un `CHECK`;
 * quién puede pasar de uno a otro es esta máquina, no el esquema.
 *
 * **Qué no decide este archivo, y por qué.** `pago_pendiente`, `pagada` y
 * `bloqueada` están en el `CHECK` de la migración 0004 pero ninguna tarea del
 * backlog hoy produce esas transiciones: `pago_pendiente`/`pagada` llegan con
 * el pago (Fase 2, PRD-002 §3.4) y `bloqueada` es, según el comentario de la
 * propia migración, "una excepción operativa" que ningún RF asigna a un rol
 * todavía. Decisión AT-33 (`docs/arquitectura.md` §16): esta máquina solo
 * cubre `libre ⇄ ocupada` para la mesa y `(sin sesión) ⇄ abierta ⇄ cerrada`
 * para la sesión —las tres acciones que nombra F1-10b: abrir, ocupar,
 * cerrar—. Ampliarla a los estados de pago es decisión de la tarea que los
 * use por primera vez, no una que esta tarea anticipe sin RF que la pida.
 *
 * Son funciones puras, como `puedeVerComanda` en `@pagaya/identidad/acceso`:
 * reciben el estado actual, nunca una fila ni una conexión, y devuelven si la
 * transición se aplica o por qué no. Quien persiste (F1-10c, F1-14a) lee el
 * estado actual, llama a la función y escribe el resultado en la misma
 * transacción; esta máquina no sabe que PostgreSQL existe.
 */

/** PRD-001 §12 y §15; el `CHECK` completo de la migración 0004. */
export type EstadoMesa = "libre" | "ocupada" | "pago_pendiente" | "pagada" | "bloqueada";

/** El `CHECK` de `sesion_mesa.estado` en la migración 0004. */
export type EstadoSesionMesa = "abierta" | "cerrada";

/** Por qué se rechazó la transición: la acción pedida y desde dónde se pidió. */
export type MotivoTransicionMesaInvalida = {
  readonly accion: "ocupar" | "cerrar";
  readonly desde: EstadoMesa;
};

export type ResultadoMesa =
  | { readonly aplicada: true; readonly estado: EstadoMesa }
  | { readonly aplicada: false; readonly motivo: MotivoTransicionMesaInvalida };

/**
 * `null` es "la sesión todavía no existe": `sesion_mesa` no tiene una fila
 * "vacía" en la migración 0004, así que quien llama pasa `null` cuando su
 * consulta no encontró ninguna sesión para la comanda.
 */
export type MotivoTransicionSesionInvalida = {
  readonly accion: "abrir" | "cerrar";
  readonly desde: EstadoSesionMesa | null;
};

export type ResultadoSesion =
  | { readonly aplicada: true; readonly estado: EstadoSesionMesa }
  | { readonly aplicada: false; readonly motivo: MotivoTransicionSesionInvalida };

/**
 * `ocupar` — el primer ingreso (PRD-002 §3.4) ocupa la mesa. Solo desde
 * `libre`: una mesa `pago_pendiente`, `pagada` o `bloqueada` no es una mesa
 * libre aunque no tenga sesión abierta hoy, y `ocupada` dos veces sería la
 * segunda comanda que el índice único de la migración 0004 (AT-20) ya
 * rechaza a nivel de esquema.
 */
export function ocuparMesa(estado: EstadoMesa): ResultadoMesa {
  if (estado !== "libre") {
    return { aplicada: false, motivo: { accion: "ocupar", desde: estado } };
  }
  return { aplicada: true, estado: "ocupada" };
}

/**
 * `cerrar` (mesa) — la liberación de PRD-002 §3.4. Solo desde `ocupada`: en
 * Fase 1 no hay tarea que lleve la mesa a `pago_pendiente` o `pagada`, así que
 * no hay otro estado real desde el que cerrar hoy (ver AT-33). F1-15 agrega
 * los efectos de cerrar —expirar dispositivos, rotar el PIN—, no esta
 * transición.
 */
export function cerrarMesa(estado: EstadoMesa): ResultadoMesa {
  if (estado !== "ocupada") {
    return { aplicada: false, motivo: { accion: "cerrar", desde: estado } };
  }
  return { aplicada: true, estado: "libre" };
}

/**
 * `abrir` (sesión) — nace con la mesa que ocupa. Solo desde "no existe
 * sesión": una `sesion_mesa` es de a una por comanda (`sesion_mesa_una_por_comanda`
 * en la migración 0004) y una comanda nueva es la que abre la sesión, nunca
 * una reabierta.
 */
export function abrirSesion(estado: EstadoSesionMesa | null): ResultadoSesion {
  if (estado !== null) {
    return { aplicada: false, motivo: { accion: "abrir", desde: estado } };
  }
  return { aplicada: true, estado: "abierta" };
}

/**
 * `cerrar` (sesión) — solo desde `abierta`. Una sesión `cerrada` es terminal:
 * PRD-002 §3.4 no describe una forma de reabrirla, y la migración 0004 no le
 * da una columna para distinguir "cerrada hoy" de "cerrada hace una semana".
 */
export function cerrarSesion(estado: EstadoSesionMesa | null): ResultadoSesion {
  if (estado !== "abierta") {
    return { aplicada: false, motivo: { accion: "cerrar", desde: estado } };
  }
  return { aplicada: true, estado: "cerrada" };
}
