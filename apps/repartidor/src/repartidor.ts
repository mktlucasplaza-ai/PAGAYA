/**
 * El segundo proceso del despliegue (arquitectura.md AT-1): el repartidor del
 * outbox.
 *
 * AT-2 lo define así: toma los eventos pendientes con `FOR UPDATE SKIP LOCKED`,
 * los entrega por WebSocket y por push, reintenta con espera creciente y se
 * despierta por `LISTEN/NOTIFY` sondeando como respaldo. Nada de eso existe
 * todavía: la tabla `evento_salida` llega con F1-70.
 *
 * Lo que existe en F1-01 es el proceso: arranca con su configuración, hace su
 * ciclo al ritmo configurado, y se apaga limpio cuando el despliegue lo manda a
 * terminar. Que exista el proceso vacío importa porque es lo que obliga a que el
 * ambiente lo contemple (`intervalo_sondeo_ms`, `tope_reintentos`) y porque su
 * frontera —no puede importar ningún módulo de dominio— queda verificada desde
 * el primer día, cuando todavía es gratis cumplirla.
 */
import type { Configuracion } from "@pagaya/config";

/** Una pasada del ciclo. Devuelve cuántos eventos repartió. */
export type Pasada = () => Promise<number>;

export type DependenciasRepartidor = {
  /** F1-70 reemplaza esto por la lectura real del outbox. */
  readonly pasada?: Pasada;
  /**
   * Dónde se reporta una pasada que falló. Se inyecta en lugar de escribir a
   * `console` directo porque un fallo del repartidor es un dato de operación
   * —AT-2 lo vigila contra el presupuesto de 3 s— y porque así una prueba puede
   * comprobar que se reportó sin ensuciar la salida de `make verify`.
   */
  readonly registrar?: (mensaje: string, error: unknown) => void;
};

export type Repartidor = {
  iniciar(): void;
  detener(): Promise<void>;
  /** Cuántas pasadas completó. Es lo que vigila el presupuesto de 3 s de AT-2. */
  readonly pasadas: number;
};

const sinOutboxTodavia: Pasada = async () => 0;

export function crearRepartidor(
  config: Configuracion,
  dependencias: DependenciasRepartidor = {},
): Repartidor {
  const pasada = dependencias.pasada ?? sinOutboxTodavia;
  const registrar =
    dependencias.registrar ??
    ((mensaje: string, error: unknown) => {
      console.error(mensaje, error);
    });
  let temporizador: NodeJS.Timeout | undefined;
  let enCurso: Promise<unknown> = Promise.resolve();
  let pasadas = 0;

  const repartidor: Repartidor = {
    iniciar() {
      if (temporizador !== undefined) return;
      temporizador = setInterval(() => {
        enCurso = pasada()
          .then(() => {
            pasadas += 1;
          })
          .catch((error: unknown) => {
            registrar("repartidor: la pasada falló", error);
          });
      }, config.repartidor.intervaloSondeoMs);
      temporizador.unref();
    },

    async detener() {
      if (temporizador !== undefined) {
        clearInterval(temporizador);
        temporizador = undefined;
      }
      await enCurso;
    },

    get pasadas() {
      return pasadas;
    },
  };

  return repartidor;
}
