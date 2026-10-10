/**
 * El puerto para encolar un evento, antes de que exista `evento_salida`.
 *
 * AT-2 (arquitectura.md §3) decide la tabla, el repartidor y los dos canales de
 * entrega; eso lo construye F1-70b. Lo que F1-20a necesita hoy es la mitad que
 * no depende de la tabla: la **forma** del puerto que un productor usa para
 * encolar, para poder escribir el OTP (F1-20) sin esperar a F1-70b y sin que
 * `identidad` llame a un proveedor de SMS directamente —exactamente lo que AT-2
 * prohíbe para el push.
 *
 * `outbox-memoria.ts` es el único adaptador que existe hoy. Cuando F1-70b
 * traiga `evento_salida`, el adaptador de PostgreSQL implementa este mismo
 * puerto (arquitectura.md §14, AT-25): el código que encola no cambia, cambia
 * la inyección.
 */
import { type FuenteAleatoria, type Reloj, aleatorioDelSistema, relojDelSistema } from "@pagaya/nucleo";

/** Lo que un productor pide encolar. El tipo lo define el productor (p. ej. `"otp_solicitado"`). */
export type NuevoEvento<Tipo extends string = string, Payload = unknown> = {
  readonly tipo: Tipo;
  readonly payload: Payload;
};

/**
 * Lo que queda encolado. `idEvento` es lo que AT-2 exige para la entrega "al
 * menos una vez": el consumidor lo usa para descartar repetidos.
 */
export type EventoSalida<Tipo extends string = string, Payload = unknown> = NuevoEvento<Tipo, Payload> & {
  readonly idEvento: string;
  readonly creadoEn: Date;
};

export type Outbox = {
  encolar<Tipo extends string, Payload>(evento: NuevoEvento<Tipo, Payload>): Promise<EventoSalida<Tipo, Payload>>;
};

/** Dependencias inyectables, para no improvisar un reloj o un azar propios (ver @pagaya/nucleo). */
export type DependenciasOutbox = {
  readonly reloj?: Reloj;
  readonly aleatorio?: FuenteAleatoria;
};

const BYTES_ID = 16;

export function idDeEvento(aleatorio: FuenteAleatoria): string {
  return Buffer.from(aleatorio.bytes(BYTES_ID)).toString("hex");
}

export const DEPENDENCIAS_OUTBOX_POR_DEFECTO: Required<DependenciasOutbox> = {
  reloj: relojDelSistema,
  aleatorio: aleatorioDelSistema,
};
