/**
 * El outbox en memoria: el doble contra el que F1-20a prueba sin la tabla
 * `evento_salida` (todavía no existe, la crea F1-70b) y sin PostgreSQL
 * encendido, igual que `repositorio-memoria.ts` de `@pagaya/carga-inicial`
 * hace con el cargador (arquitectura.md AT-17).
 *
 * **Nunca es el repartidor.** No reparte nada, no llama a ningún proveedor, no
 * sobrevive a un reinicio del proceso: solo guarda en un arreglo para que una
 * prueba pueda afirmar qué se encoló. El repartidor real (`LISTEN/NOTIFY`,
 * `FOR UPDATE SKIP LOCKED`) es trabajo de F1-70b contra el adaptador de
 * PostgreSQL que implemente `Outbox`.
 */
import type { FuenteAleatoria, Reloj } from "@pagaya/nucleo";

import { DEPENDENCIAS_OUTBOX_POR_DEFECTO, type EventoSalida, type Outbox, idDeEvento } from "./outbox.ts";

export type OutboxMemoria = Outbox & {
  /** Lo encolado hasta ahora, en el orden en que se encoló. */
  eventos(): readonly EventoSalida[];
};

export function outboxEnMemoria(dependencias: { reloj?: Reloj; aleatorio?: FuenteAleatoria } = {}): OutboxMemoria {
  const reloj = dependencias.reloj ?? DEPENDENCIAS_OUTBOX_POR_DEFECTO.reloj;
  const aleatorio = dependencias.aleatorio ?? DEPENDENCIAS_OUTBOX_POR_DEFECTO.aleatorio;
  const eventos: EventoSalida[] = [];

  const encolar: Outbox["encolar"] = async (evento) => {
    const encolado = {
      ...evento,
      idEvento: idDeEvento(aleatorio),
      creadoEn: reloj.ahora(),
    };
    eventos.push(encolado);
    return encolado;
  };

  return { eventos: () => [...eventos], encolar };
}
