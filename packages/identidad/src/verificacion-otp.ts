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

/**
 * El resultado de `registrarIntento`. Cuando es `ok`, el contador **ya subió**
 * y `otp.intentos` es el valor de después: quien llama no vuelve a escribirlo.
 */
export type IntentoRegistrado =
  | { readonly ok: true; readonly otp: OtpPendiente }
  | { readonly ok: false; readonly motivo: Exclude<MotivoRechazoOtp, "codigo_incorrecto"> };

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
 *
 * **`registrarIntento` y `consumir` son operaciones atómicas, y eso es parte
 * del contrato, no del adaptador.** Contar leyendo el OTP y volviéndolo a
 * guardar deja una ventana entre la lectura y la escritura: dos intentos
 * simultáneos leen el mismo contador, los dos lo suben a lo mismo y el tope de
 * PRD-001 §14 se salta con solo pedir en paralelo. Por eso el puerto no expone
 * una lectura seguida de una escritura, sino la operación completa. En
 * PostgreSQL cada una es **una sola sentencia**: ver arquitectura.md §31.
 */
export type RepositorioOtp = {
  guardar(otp: OtpPendiente): Promise<void>;

  /**
   * Sube el contador en una sola operación y **solo si el OTP está vigente**
   * (no consumido, no vencido, con intentos por debajo de `intentosPorCodigo`);
   * si no lo está, no toca nada y devuelve por qué.
   */
  registrarIntento(peticion: {
    readonly clave: ClaveOtp;
    readonly intentosPorCodigo: number;
    readonly ahora: Date;
  }): Promise<IntentoRegistrado>;

  /**
   * Marca el OTP como usado, también en una sola operación y solo si seguía sin
   * consumir. Devuelve `null` si otro lo consumió primero: es lo que hace que
   * un código acertado dos veces en paralelo abra una sola puerta.
   */
  consumir(peticion: { readonly clave: ClaveOtp; readonly ahora: Date }): Promise<OtpPendiente | null>;
};

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
const RECHAZO_POR_ESTADO: Readonly<
  Record<Exclude<EstadoOtp, "vigente">, Exclude<MotivoRechazoOtp, "codigo_incorrecto">>
> = {
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
 * **El intento se cobra antes de mirar el código**, en la operación atómica del
 * puerto: así el tope vale aunque lleguen varios intentos a la vez, y así un
 * vencido o un agotado se rechazan sin haber comparado nada. Un acierto consume
 * el OTP, también atómicamente, para que el mismo código no sirva dos veces.
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
  const intento = await repositorio.registrarIntento({
    clave,
    intentosPorCodigo: limites.intentosPorCodigo,
    ahora,
  });
  if (!intento.ok) return { ok: false, motivo: intento.motivo, intentosRestantes: 0 };

  const intentosRestantes = Math.max(0, limites.intentosPorCodigo - intento.otp.intentos);
  if (!huellasIguales(intento.otp.huellaCodigo, huellaDeCodigo(codigo))) {
    return { ok: false, motivo: "codigo_incorrecto", intentosRestantes };
  }

  const consumido = await repositorio.consumir({ clave, ahora });
  if (consumido === null) return { ok: false, motivo: "codigo_consumido", intentosRestantes: 0 };
  return { ok: true, otp: consumido };
}

/**
 * El único adaptador que existe hoy, por el mismo motivo que
 * `limitadorEnviosEnMemoria` y `outboxEnMemoria`: F1-20b no agrega
 * migraciones. No persiste entre procesos ni entre instancias, así que un
 * local con más de un proceso de API necesita el adaptador de PostgreSQL
 * (arquitectura.md §31) antes de producción, sin tocar esta regla.
 *
 * **Cómo cumple la atomicidad que el puerto exige:** `registrarIntento` y
 * `consumir` leen y escriben el `Map` sin ningún `await` en el medio, así que
 * nada se intercala entre las dos mitades. Es lo mismo que en PostgreSQL hace
 * una sola sentencia; lo que no se puede es volver a partirlo en una lectura y
 * una escritura separadas, acá ni allá.
 */
export function repositorioOtpEnMemoria(): RepositorioOtp {
  const porClave = new Map<string, OtpPendiente>();
  const llave = ({ telefono, dispositivoId }: ClaveOtp) => `${telefono}\u0000${dispositivoId}`;

  return {
    guardar: async (otp) => {
      porClave.set(llave(otp), otp);
    },

    registrarIntento: async ({ clave, intentosPorCodigo, ahora }) => {
      const otp = porClave.get(llave(clave));
      if (otp === undefined) return { ok: false, motivo: "sin_codigo" };

      const estado = estadoDeOtp(otp, ahora, intentosPorCodigo);
      if (estado !== "vigente") return { ok: false, motivo: RECHAZO_POR_ESTADO[estado] };

      const intentado: OtpPendiente = { ...otp, intentos: otp.intentos + 1 };
      porClave.set(llave(clave), intentado);
      return { ok: true, otp: intentado };
    },

    consumir: async ({ clave, ahora }) => {
      const otp = porClave.get(llave(clave));
      if (otp === undefined || otp.consumidoEn !== null) return null;

      const consumido: OtpPendiente = { ...otp, consumidoEn: ahora };
      porClave.set(llave(clave), consumido);
      return consumido;
    },
  };
}
