/**
 * La frontera que F1-20 (OTP) y F1-21 (registro) van a implementar.
 *
 * **Acá no hay implementación, y es a propósito.** F1-03 entrega roles,
 * sesiones y la regla de acceso; el OTP y el registro son otras dos tareas del
 * backlog, con sus propios requisitos —límites de envío por número y por
 * dispositivo (PRD-004 §8), menos de 40 s de punta a punta en gama baja
 * (RF-C-25), consentimiento con versión (RF-C-26)— y con un tercero de por
 * medio que todavía no está elegido (riesgo de estimación de F1-20).
 *
 * Lo que F1-03 sí fija, porque es lo que no se puede decidir dos veces:
 *
 * 1. **Todo camino de identidad termina en una sesión** abierta por
 *    `abrirSesion` o `promoverACuenta` (ver `sesion.ts`). No hay una segunda
 *    forma de empezar una sesión, y por eso la política de vigencia por rol
 *    (PRD-001 §14) no se puede esquivar desde el registro.
 * 2. **El canal del OTP es un puerto.** PRD-004 §3 lo exige configurable —"SMS
 *    por defecto, con alternativa por email o mensajería"— y arquitectura.md
 *    AT-1 pide que el proveedor de envío viva detrás de una interfaz. El costo
 *    por mensaje es el principal costo variable de captar un cliente
 *    (PRD-004 §3): el día que se cambie de proveedor no se toca el flujo.
 * 3. **El código corto no autentica** (PRD-003 §3.1). Nada de lo que se declare
 *    acá puede abrir una sesión a partir de un código corto; el QR personal de
 *    60 s es otra cosa y llega en Fase 3.
 */
import type { DispositivoId, SesionAbierta, SesionId } from "./sesion.ts";

/** PRD-004 §3: SMS por defecto, con alternativa por email o mensajería. */
export type CanalOtp = "sms" | "email" | "mensajeria";

export const CANAL_OTP_POR_DEFECTO: CanalOtp = "sms";

/**
 * El proveedor de envío, detrás de una interfaz (arquitectura.md AT-1). Lo
 * implementa F1-20 contra el proveedor que se contrate; el dominio nunca sabe
 * cuál es.
 */
export type ProveedorCodigo = {
  enviar(envio: {
    readonly canal: CanalOtp;
    readonly destino: string;
    readonly codigo: string;
  }): Promise<void>;
};

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
