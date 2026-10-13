/**
 * F1-20b: el código tiene fecha de muerte y cupo de intentos.
 *
 * Qué lo exige: **PRD-001 §14** ("OTP con expiración y límite de intentos") y
 * **PRD-004 §8**, que al describir el modelo de datos nombra los cuatro campos
 * de la verificación: "teléfono, canal, intentos, expiración".
 *
 * Es el otro lado de F1-20c: aquel acota cuántos códigos se **envían**
 * (`limite-envios.ts`), éste acota cuánto dura y cuántas veces se puede
 * **probar** el que ya se envió. Son dos límites distintos y los dos están en
 * `LimitesOtp`: `enviosPor*PorHora` contra el costo del SMS,
 * `vigenciaCodigoMs` e `intentosPorCodigo` contra el adivinador.
 *
 * El estado del OTP entra por el puerto `RepositorioOtp`, igual que
 * `LimitadorEnvios` (arquitectura.md §30) y por el mismo motivo: esta tarea no
 * agrega migraciones. El adaptador en memoria es el único que existe hoy; las
 * columnas que la tabla va a necesitar están en arquitectura.md §31 (AT-60),
 * para que quien la cree no tenga que deducirlas de este archivo.
 *
 * **Lo que no es esta tarea:** crear la cuenta y abrir la sesión (F1-21). Un
 * `verificarCodigo` que devuelve `ok` no deja a nadie adentro; `confirmar`
 * (`registro.ts`) es quien lo usará como primer paso.
 */
import { timingSafeEqual } from "node:crypto";

import { type Reloj, relojDelSistema } from "@pagaya/nucleo";

import type { CanalOtp, LimitesOtp } from "./registro.ts";
import { huellaDeToken, type DispositivoId } from "./sesion.ts";

/**
 * A quién se le pidió el código. El dispositivo es parte de la clave y no
 * decoración: el código viaja al teléfono pero se prueba desde el navegador
 * que lo pidió, y `confirmar` ya recibe los dos datos (ver `ServicioIdentidad`).
 */
export type ClaveOtp = {
  readonly telefono: string;
  readonly dispositivoId: DispositivoId;
};

/**
 * El OTP que está esperando ser verificado. **El código no se guarda**, igual
 * que el token de sesión (`Sesion.huellaToken`): se guarda su huella, que es
 * lo único que hace falta para comparar.
 */
export type OtpPendiente = {
  readonly telefono: string;
  readonly dispositivoId: DispositivoId;
  readonly canal: CanalOtp;
  readonly huellaCodigo: string;
  readonly creadoEn: Date;
  readonly expiraEn: Date;
  readonly intentos: number;
  readonly consumidoEn: Date | null;
};

/**
 * Lo único que la verificación necesita de la persistencia. Lo implementará el
 * carril 1 contra PostgreSQL, con las columnas de arquitectura.md §31; acá es
 * un puerto para que la regla se pueda probar sin base encendida, igual que
 * `RepositorioSesiones`.
 *
 * `guardar` es un *upsert* por `ClaveOtp`: **hay un solo OTP por teléfono y
 * dispositivo**, y pedir uno nuevo pisa al anterior. No es un detalle del
 * adaptador en memoria, es la regla —ver §31— y en PostgreSQL la impone una
 * clave única, no el código que la llama.
 */
export type RepositorioOtp = {
  guardar(otp: OtpPendiente): Promise<void>;
  ultimo(clave: ClaveOtp): Promise<OtpPendiente | null>;
};

export type MotivoRechazoOtp =
  | "sin_codigo"
  | "codigo_vencido"
  | "codigo_consumido"
  | "intentos_agotados"
  | "codigo_incorrecto";

export type VerificacionOtp =
  | { readonly ok: true; readonly otp: OtpPendiente }
  | { readonly ok: false; readonly motivo: MotivoRechazoOtp; readonly intentosRestantes: number };

export type EstadoOtp = "vigente" | "vencido" | "consumido" | "intentos_agotados";

/** sha256 del código. Es la misma huella de `sesion.ts`: una sola forma de guardar un secreto corto. */
export function huellaDeCodigo(codigo: string): string {
  return huellaDeToken(codigo);
}

/**
 * Si el OTP sigue en condiciones de que se le compare un código. Las tres
 * causas que lo sacan de juego se miran **antes** que el código, que es lo que
 * hace que un vencido o un agotado se rechacen aunque el código sea correcto.
 */
export function estadoDeOtp(otp: OtpPendiente, ahora: Date, intentosPorCodigo: number): EstadoOtp {
  if (otp.consumidoEn !== null) return "consumido";
  if (otp.expiraEn.getTime() <= ahora.getTime()) return "vencido";
  if (otp.intentos >= intentosPorCodigo) return "intentos_agotados";
  return "vigente";
}

/** Cada estado que saca al OTP de juego tiene su propio motivo: PRD-003 §5 pide poder contarlos por separado. */
const RECHAZO_POR_ESTADO: Readonly<Record<Exclude<EstadoOtp, "vigente">, MotivoRechazoOtp>> = {
  vencido: "codigo_vencido",
  consumido: "codigo_consumido",
  intentos_agotados: "intentos_agotados",
};

/** Comparación en tiempo constante: dos huellas sha256 en hexadecimal, del mismo largo. */
function huellasIguales(una: string, otra: string): boolean {
  const a = Buffer.from(una, "hex");
  const b = Buffer.from(otra, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Verifica el código contra el OTP guardado. Devuelve un resultado y no lanza,
 * igual que `autenticar` (`sesion.ts`): quien verifica una credencial necesita
 * distinguir *por qué* falló para contarlo (PRD-003 §5), y un fallo esperado no
 * es una excepción.
 *
 * Un intento fallido se cuenta y se persiste; uno acertado consume el OTP, para
 * que el mismo código no sirva dos veces.
 */
export async function verificarCodigo({
  repositorio,
  clave,
  codigo,
  limites,
  reloj = relojDelSistema,
}: {
  readonly repositorio: RepositorioOtp;
  readonly clave: ClaveOtp;
  readonly codigo: string;
  readonly limites: LimitesOtp;
  readonly reloj?: Reloj;
}): Promise<VerificacionOtp> {
  const ahora = reloj.ahora();
  const otp = await repositorio.ultimo(clave);
  if (otp === null) return { ok: false, motivo: "sin_codigo", intentosRestantes: 0 };

  const estado = estadoDeOtp(otp, ahora, limites.intentosPorCodigo);
  if (estado !== "vigente") return { ok: false, motivo: RECHAZO_POR_ESTADO[estado], intentosRestantes: 0 };

  if (!huellasIguales(otp.huellaCodigo, huellaDeCodigo(codigo))) {
    const fallido: OtpPendiente = { ...otp, intentos: otp.intentos + 1 };
    await repositorio.guardar(fallido);
    return {
      ok: false,
      motivo: "codigo_incorrecto",
      intentosRestantes: Math.max(0, limites.intentosPorCodigo - fallido.intentos),
    };
  }

  const consumido: OtpPendiente = { ...otp, intentos: otp.intentos + 1, consumidoEn: ahora };
  await repositorio.guardar(consumido);
  return { ok: true, otp: consumido };
}

/**
 * El único adaptador que existe hoy, por el mismo motivo que
 * `limitadorEnviosEnMemoria` y `outboxEnMemoria`: F1-20b no agrega
 * migraciones. No persiste entre procesos ni entre instancias, así que un
 * local con más de un proceso de API necesita el adaptador de PostgreSQL
 * (arquitectura.md §31) antes de producción, sin tocar esta regla.
 */
export function repositorioOtpEnMemoria(): RepositorioOtp {
  const porClave = new Map<string, OtpPendiente>();
  const llave = ({ telefono, dispositivoId }: ClaveOtp) => `${telefono}\u0000${dispositivoId}`;

  return {
    guardar: async (otp) => {
      porClave.set(llave(otp), otp);
    },
    ultimo: async (clave) => porClave.get(llave(clave)) ?? null,
  };
}
