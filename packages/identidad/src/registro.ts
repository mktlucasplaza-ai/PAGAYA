/**
 * La frontera que F1-20 (OTP) y F1-21 (registro) van a implementar.
 *
 * **F1-21 (confirmar) no tiene implementación acá, y es a propósito.** Tiene
 * sus propios requisitos —menos de 40 s de punta a punta en gama baja
 * (RF-C-25), consentimiento con versión (RF-C-26)— y es otra tarea del
 * backlog.
 *
 * **F1-20a sí implementa `solicitarCodigo`**, y lo hace sobre el outbox de
 * `@pagaya/notificacion` (arquitectura.md §14, AT-25), no llamando a un
 * proveedor de SMS directamente: eso es exactamente lo que AT-2 prohíbe para
 * el push, y la misma razón aplica acá —si el proceso muere entre generar el
 * código y enviarlo, un envío directo lo pierde en silencio; encolado en la
 * misma transacción que el estado futuro del OTP (F1-20b), no—.
 *
 * Lo que F1-03 fijó y sigue valiendo:
 *
 * 1. **Todo camino de identidad termina en una sesión** abierta por
 *    `abrirSesion` o `promoverACuenta` (ver `sesion.ts`). No hay una segunda
 *    forma de empezar una sesión, y por eso la política de vigencia por rol
 *    (PRD-001 §14) no se puede esquivar desde el registro.
 * 2. **El canal del OTP es un dato, no una decisión del dominio.** PRD-004 §3
 *    lo exige configurable —"SMS por defecto, con alternativa por email o
 *    mensajería"—: el día que se cambie de proveedor no se toca el flujo,
 *    porque el flujo nunca conoció al proveedor (lo conoce el repartidor de
 *    F1-70b, del lado de `notificacion`).
 * 3. **El código corto no autentica** (PRD-003 §3.1). Nada de lo que se declare
 *    acá puede abrir una sesión a partir de un código corto; el QR personal de
 *    60 s es otra cosa y llega en Fase 3.
 */
import type { FuenteAleatoria } from "@pagaya/nucleo";
import { DEPENDENCIAS_OUTBOX_POR_DEFECTO, type EventoSalida, type Outbox } from "@pagaya/notificacion";

import type { DispositivoId, SesionAbierta, SesionId } from "./sesion.ts";

/** PRD-004 §3: SMS por defecto, con alternativa por email o mensajería. */
export type CanalOtp = "sms" | "email" | "mensajeria";

export const CANAL_OTP_POR_DEFECTO: CanalOtp = "sms";

/** El tipo de evento que F1-20a encola, y que el repartidor de F1-70b entrega. */
export const TIPO_EVENTO_OTP_SOLICITADO = "otp_solicitado";

/** Lo que el repartidor de F1-70b necesita para entregar el OTP: a quién, por qué canal y con qué código. */
export type PayloadOtpSolicitado = {
  readonly telefono: string;
  readonly canal: CanalOtp;
  readonly dispositivoId: DispositivoId;
  readonly codigo: string;
};

export type EventoOtpSolicitado = EventoSalida<typeof TIPO_EVENTO_OTP_SOLICITADO, PayloadOtpSolicitado>;

/**
 * El proveedor de envío real, detrás de una interfaz (arquitectura.md AT-1).
 * **No lo llama `identidad`** —eso es justo lo que el outbox evita—: lo
 * implementa F1-70b contra el proveedor que se contrate, del lado del
 * repartidor de `notificacion`, al consumir un `EventoOtpSolicitado`.
 */
export type ProveedorCodigo = {
  enviar(envio: {
    readonly canal: CanalOtp;
    readonly destino: string;
    readonly codigo: string;
  }): Promise<void>;
};

const DIGITOS_CODIGO = 6;
const TOPE_CODIGO = 10 ** DIGITOS_CODIGO;
/** 4 bytes alcanzan de sobra para un entero de 6 dígitos y no sesgan el módulo de forma perceptible. */
const BYTES_CODIGO = 4;

/** Código numérico de `DIGITOS_CODIGO` dígitos, con ceros a la izquierda. Nunca `Math.random` (ver @pagaya/nucleo). */
export function generarCodigoOtp(aleatorio: FuenteAleatoria): string {
  const bytes = aleatorio.bytes(BYTES_CODIGO);
  const entero = Buffer.from(bytes).readUInt32BE(0) % TOPE_CODIGO;
  return entero.toString().padStart(DIGITOS_CODIGO, "0");
}

/**
 * F1-20a: pedir un código encola un `EventoOtpSolicitado` en el outbox, con el
 * canal pedido. No valida límites de envío (F1-20c) ni persiste expiración o
 * intentos (F1-20b): esas son envolturas sobre esto, no parte de esto.
 */
export function crearServicioOtp(dependencias: {
  readonly outbox: Outbox;
  readonly aleatorio?: FuenteAleatoria;
}): Pick<ServicioIdentidad, "solicitarCodigo"> {
  const aleatorio = dependencias.aleatorio ?? DEPENDENCIAS_OUTBOX_POR_DEFECTO.aleatorio;
  return {
    solicitarCodigo: async (peticion) => {
      await dependencias.outbox.encolar<typeof TIPO_EVENTO_OTP_SOLICITADO, PayloadOtpSolicitado>({
        tipo: TIPO_EVENTO_OTP_SOLICITADO,
        payload: {
          telefono: peticion.telefono,
          canal: peticion.canal,
          dispositivoId: peticion.dispositivoId,
          codigo: generarCodigoOtp(aleatorio),
        },
      });
    },
  };
}

/**
 * Lo que PRD-004 §3 y §8 y PRD-001 §14 exigen acotar. Los valores son de F1-20:
 * "el OTP no es un grifo de costo abierto".
 */
export type LimitesOtp = {
  readonly vigenciaCodigoMs: number;
  readonly intentosPorCodigo: number;
  readonly enviosPorNumeroPorHora: number;
  readonly enviosPorDispositivoPorHora: number;
};

/** RF-C-26: consentimiento con finalidad declarada, versionado y sin casillas pre-marcadas. */
export type Consentimiento = {
  readonly version: string;
  readonly aceptadoEn: Date;
};

/** PRD-004 §3: tres campos. Ni apellido, ni RUT, ni email, ni género. */
export type DatosRegistro = {
  readonly nombrePila: string;
  readonly telefono: string;
  readonly consentimiento: Consentimiento;
};

/**
 * El servicio que implementan F1-20 y F1-21.
 *
 * `confirmar` devuelve una `SesionAbierta` y no un usuario: el registro no
 * termina cuando se crea la cuenta, termina cuando el dispositivo queda con
 * sesión. Si `sesionPrevia` viene con la sesión sin cuenta del dispositivo
 * (RF-C-24), F1-23 la promueve en lugar de abrir otra, que es lo que conserva
 * el carro y el participante.
 *
 * `confirmar` también cubre el ingreso de quien ya tiene cuenta: PRD-004 §9,
 * criterio 5 —"un segundo registro con el mismo número de teléfono entra a la
 * cuenta existente en lugar de crear otra"— dice que no son dos caminos.
 */
export type ServicioIdentidad = {
  /** F1-20. */
  solicitarCodigo(peticion: {
    readonly telefono: string;
    readonly canal: CanalOtp;
    readonly dispositivoId: DispositivoId;
  }): Promise<void>;

  /** F1-21, y F1-23 cuando llega con `sesionPrevia`. */
  confirmar(peticion: {
    readonly codigo: string;
    readonly datos: DatosRegistro;
    readonly dispositivoId: DispositivoId;
    readonly sesionPrevia: SesionId | null;
  }): Promise<SesionAbierta>;
};
