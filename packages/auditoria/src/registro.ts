/**
 * Escribir una fila de auditoría, en la transacción de quien la escribe.
 *
 * Qué lo exige: PRD-001 §14 —"toda anulación, corrección y pago queda
 * registrada con actor y timestamp"— y AT-4 regla 5, que agrega el intento
 * rechazado. La tabla y su append-only son la migración 0005; la decisión está
 * en docs/arquitectura.md §15 (AT-30 la tabla, AT-31 esta función).
 *
 * La forma es toda la decisión: `registrar` recibe la **transacción**, no el
 * `Acceso`. No puede abrir una propia, así que no existe la forma de escribir
 * la auditoría fuera de la transacción del cambio que audita. "En la misma
 * transacción" deja de ser una convención que alguien respeta y pasa a ser lo
 * único que el tipo permite: si el cambio se revierte, la fila se va con él.
 *
 * El `local` sale de la mirada de la transacción (AT-13) y no de un parámetro:
 * un parámetro podría decir un local distinto al que la transacción está
 * mirando, y la row level security lo rechazaría más tarde y en otro idioma.
 */
import type { Transaccion } from "@pagaya/base-datos";
import { ErrorPagaya } from "@pagaya/nucleo";

/**
 * Quién. `sistema` existe porque no todo lo auditable lo hace una persona: el
 * vencimiento de una sesión (PRD-004 §3) o una salida encolada que se ejecuta
 * sola (RF-C-21) no tienen actor, y poner uno inventado sería falsear la fila.
 *
 * `rol` se guarda como instantánea (migración 0005): el rol de hoy no es el que
 * tenía quien hizo esto. Traducir un `Titular` de `@pagaya/identidad` a este
 * tipo es trabajo de quien llama —auditoría no puede importar un módulo de
 * dominio sin cerrar un ciclo en el grafo (fronteras.json)—.
 */
export type Actor =
  | {
      readonly tipo: "usuario";
      readonly usuarioId: string;
      readonly rol: "cliente" | "mesero" | "admin";
    }
  | { readonly tipo: "sistema" };

export const SISTEMA: Actor = { tipo: "sistema" };

/** Si el hecho se aplicó o se rechazó. El rechazo exige motivo (migración 0005). */
export type ResultadoAuditado = "aplicado" | "rechazado";

export type NuevoRegistro = {
  /** Qué pasó, como identificador y no como frase: `comanda_corregida`. */
  readonly accion: string;
  /** Sobre qué: `comanda`, `pago`, `participante`. */
  readonly entidad: string;
  readonly entidadId: string;
  readonly actor: Actor;
  /** Por defecto `aplicado`. */
  readonly resultado?: ResultadoAuditado;
  /** Obligatorio cuando el resultado es `rechazado` (RF-M-08 lo exige además al corregir). */
  readonly motivo?: string;
  /** El detalle del hecho (RF-A-15). Documento y no columnas, por AT-14. */
  readonly datos?: Readonly<Record<string, unknown>>;
};

/** Lo que quedó escrito. `id` es el orden de escritura; `ocurridoEn`, el instante de la transacción. */
export type RegistroAuditado = {
  readonly id: string;
  readonly accion: string;
  readonly entidad: string;
  readonly entidadId: string;
  readonly resultado: ResultadoAuditado;
  readonly ocurridoEn: Date;
};

type FilaAuditoria = {
  id: string;
  accion: string;
  entidad: string;
  entidad_id: string;
  resultado: ResultadoAuditado;
  ocurrido_en: Date;
};

const SQL = `
  INSERT INTO pagaya.auditoria
    (local_id, accion, entidad, entidad_id, resultado, actor_tipo, actor_id, actor_rol, motivo, datos)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
  RETURNING id::text AS id, accion, entidad, entidad_id, resultado, ocurrido_en
`;

/**
 * El local desde el que se escribe. Las otras dos miradas se rechazan acá y no
 * en la base: `sin_local` escribiría `NULL` y `entre_locales` dejaría la fila en
 * el local de nadie. Lo que PRD-001 §14 pide auditar pasa siempre dentro de un
 * local; el día que haya que auditar el alta de uno —que cruza locales por
 * definición— esa tarea agrega el parámetro explícito y su prueba.
 */
function localDe(tx: Transaccion): string {
  if (tx.mirada.tipo === "local") return tx.mirada.local;
  throw new ErrorPagaya(
    "auditoria_invalida",
    `una fila de auditoría es de un local y esta transacción mira con '${tx.mirada.tipo}': ` +
      `la transacción se abre con conLocal, la misma en la que se escribe el cambio`,
  );
}

export async function registrar(
  tx: Transaccion,
  registro: NuevoRegistro,
): Promise<RegistroAuditado> {
  const actor = registro.actor;
  const fila = await tx.una<FilaAuditoria>(SQL, [
    localDe(tx),
    registro.accion,
    registro.entidad,
    registro.entidadId,
    registro.resultado ?? "aplicado",
    actor.tipo,
    actor.tipo === "usuario" ? actor.usuarioId : null,
    actor.tipo === "usuario" ? actor.rol : null,
    registro.motivo ?? null,
    JSON.stringify(registro.datos ?? {}),
  ]);

  if (fila === null) {
    throw new ErrorPagaya(
      "auditoria_invalida",
      `el INSERT de auditoría no devolvió la fila (acción '${registro.accion}')`,
    );
  }

  return {
    id: fila.id,
    accion: fila.accion,
    entidad: fila.entidad,
    entidadId: fila.entidad_id,
    resultado: fila.resultado,
    ocurridoEn: fila.ocurrido_en,
  };
}
