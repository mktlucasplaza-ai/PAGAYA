/**
 * Quién puede ver la comanda.
 *
 * **PRD-001 §14, textual:** "acceso a la comanda limitado **a la mesa y al
 * personal del local**". Son dos puertas distintas y ninguna de las dos es el
 * rol a secas:
 *
 * - **La mesa.** Quien está sentado en esa sesión de mesa, con cuenta o sin
 *   ella: RF-C-24 y PRD-004 §2.2 dicen que ver la comanda **no exige
 *   registro**. Y ese acceso dura lo que dura la sesión de mesa: PRD-001 §16
 *   pide "expirar el acceso al cerrarse" y PRD-002 §3.4 rota el PIN ahí mismo.
 * - **El personal del local.** El administrador ve el salón completo
 *   (RF-A-05); el mesero ve **solo las mesas asignadas a él** (RF-M-01,
 *   PRD-001 §4.2: "ve solo las mesas a su cargo"). Es el supuesto S-9 de
 *   docs/arquitectura.md.
 *
 * Y una tercera que ningún PRD escribe porque no hace falta escribirla: nadie
 * ve la comanda de otro local (PRD-001 §13, multi-tenant desde el día uno).
 *
 * ## Por qué la regla recibe un descriptor y no una comanda
 *
 * `fronteras.json` prohíbe que identidad importe `comanda` y `mesa`, y con
 * razón: las importan ellas a ella. Entonces la regla no puede recibir la
 * entidad; recibe `ComandaParaAcceso`, que nombra **exactamente** los cuatro
 * hechos que la decisión necesita. Quien los tiene los pasa.
 *
 * El efecto secundario es el que importa: la regla es una función pura, se
 * prueba sin base de datos, y la lista de hechos que gobiernan el acceso a la
 * comanda está escrita en un solo tipo en lugar de repartida en consultas.
 *
 * ## Qué **no** decide esta función
 *
 * - **Escribir.** Pedir exige cuenta (RF-C-05 mod., PRD-004 §2.1), cargar
 *   ítems y corregir son del mesero (RF-M-07, RF-M-08) y la comanda `cobrando`
 *   rechaza toda escritura (arquitectura.md AT-3). Son reglas de las tareas que
 *   agregan esas escrituras (F1-23, F1-40, F1-43, F1-44), no de ésta. Leer no
 *   es escribir: reusar `puedeVerComanda` antes de un `INSERT` sería autorizar
 *   un pedido por haber mirado la carta.
 * - **El historial del cliente** (RF-C-13) y el **comprobante** posterior al
 *   pago. Son lecturas de las cuentas pagadas de una persona, no acceso a la
 *   comanda de una mesa abierta, y llegan en Fase 2 y 3 con su propia regla.
 *   Si alguien afloja esta función para que entren, rompe PRD-001 §16.
 */
import type { LocalId, UsuarioId } from "./roles.ts";
import { estadoDeSesion, type Sesion, type SesionId } from "./sesion.ts";

/**
 * Cómo se nombra a un comensal dentro de una comanda. Es el dato que la regla
 * compara, y tiene dos formas porque hay dos maneras de estar sentado: sin
 * cuenta —el dispositivo que entró con el PIN (F1-13, RF-C-24)— y con cuenta
 * —el cliente registrado (PRD-001 §12, "Participante de comanda: cliente ↔
 * comanda")—.
 */
export type IdentidadComensal =
  | { readonly tipo: "dispositivo"; readonly sesionId: SesionId }
  | { readonly tipo: "cuenta"; readonly usuarioId: UsuarioId };

/**
 * Los hechos que deciden el acceso a una comanda. Los cuatro campos son
 * obligatorios a propósito: un `meserosAsignados` opcional se olvida, y
 * olvidarlo abriría la comanda a todo el personal sin que nadie lo note.
 */
export type ComandaParaAcceso = {
  readonly localId: LocalId;
  /**
   * Si la sesión de mesa a la que pertenece esta comanda sigue abierta. Lo que
   * la cierra es F1-15 en Fase 1 y el pago desde Fase 2 (PRD-002 §3.4).
   */
  readonly sesionMesaAbierta: boolean;
  /** Quién está sentado. Lo sabe `comanda`, que es su dueña. */
  readonly comensales: readonly IdentidadComensal[];
  /** A qué meseros les toca esta mesa en este turno (RF-M-01, RF-A-04). Lo sabe `mesa`. */
  readonly meserosAsignados: readonly UsuarioId[];
};

/**
 * Por qué se rechazó. Es un código y no una frase porque PRD-001 §14 pide
 * auditoría y arquitectura.md AT-4 (regla 5) pide que el intento rechazado
 * quede registrado con su motivo: un motivo en prosa no se cuenta ni se alerta.
 */
export type MotivoRechazo =
  | "sesion_expirada"
  | "sesion_revocada"
  | "otro_local"
  | "mesa_no_asignada"
  | "sesion_de_mesa_cerrada"
  | "fuera_de_la_mesa";

export type Decision =
  | { readonly permitido: true }
  | { readonly permitido: false; readonly motivo: MotivoRechazo };

const PERMITIDO: Decision = { permitido: true };

function rechazo(motivo: MotivoRechazo): Decision {
  return { permitido: false, motivo };
}

/**
 * Con qué nombres puede aparecer esta sesión en la lista de comensales.
 *
 * Devuelve los dos cuando corresponde, y no es laxitud: `promoverACuenta`
 * conserva el id de la sesión (F1-23), así que el dispositivo que se sentó sin
 * cuenta y después se registró es el mismo dispositivo, lo diga la comanda por
 * su sesión o por su cuenta. Aceptar ambos nombres evita que el acceso dependa
 * de si la migración del participante ya ocurrió, y no concede nada: el id de
 * una sesión es esa misma sesión.
 */
export function comensalesDeLaSesion(sesion: Sesion): readonly IdentidadComensal[] {
  const porDispositivo: IdentidadComensal = { tipo: "dispositivo", sesionId: sesion.id };
  if (sesion.titular.tipo === "sin_cuenta") return [porDispositivo];
  return [{ tipo: "cuenta", usuarioId: sesion.titular.usuarioId }, porDispositivo];
}

function mismoComensal(uno: IdentidadComensal, otro: IdentidadComensal): boolean {
  if (uno.tipo === "cuenta" && otro.tipo === "cuenta") return uno.usuarioId === otro.usuarioId;
  if (uno.tipo === "dispositivo" && otro.tipo === "dispositivo") {
    return uno.sesionId === otro.sesionId;
  }
  return false;
}

function estaSentado(sesion: Sesion, comanda: ComandaParaAcceso): boolean {
  return comensalesDeLaSesion(sesion).some((propio) =>
    comanda.comensales.some((sentado) => mismoComensal(propio, sentado)),
  );
}

/**
 * La regla. Total por construcción: toda sesión y toda comanda caen en una de
 * las ramas, y la rama que niega dice por qué.
 */
export function puedeVerComanda({
  sesion,
  comanda,
  ahora,
}: {
  readonly sesion: Sesion;
  readonly comanda: ComandaParaAcceso;
  readonly ahora: Date;
}): Decision {
  const estado = estadoDeSesion(sesion, ahora);
  if (estado === "revocada") return rechazo("sesion_revocada");
  if (estado === "expirada") return rechazo("sesion_expirada");

  const titular = sesion.titular;

  // Puerta 2 — el personal del local.
  //
  // No se mide contra `sesionMesaAbierta`: su acceso no viene de estar sentado,
  // y lo necesita después del cierre para las ventas y la auditoría del turno
  // (RF-A-06, RF-A-10). Lo que PRD-001 §16 manda expirar al cerrarse es el
  // acceso de quien entró por el QR.
  if (titular.tipo === "personal") {
    if (titular.localId !== comanda.localId) return rechazo("otro_local");
    // El administrador ve el salón completo, incluida una mesa sin mesero
    // asignado —que es justo la que PRD-001 §9 le escala (F1-73)—.
    if (titular.rol === "admin") return PERMITIDO;
    return comanda.meserosAsignados.includes(titular.usuarioId)
      ? PERMITIDO
      : rechazo("mesa_no_asignada");
  }

  // Puerta 1 — la mesa: cliente o dispositivo, y solo mientras esté abierta.
  if (!comanda.sesionMesaAbierta) return rechazo("sesion_de_mesa_cerrada");
  return estaSentado(sesion, comanda) ? PERMITIDO : rechazo("fuera_de_la_mesa");
}
