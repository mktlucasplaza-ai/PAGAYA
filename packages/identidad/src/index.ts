/**
 * Identidad: quién es quien pide, y qué puede ver.
 *
 * Cubre el registro obligatorio para pedir (PRD-004 §2 y §3), el OTP con sus
 * límites (PRD-001 §14) y las dos reglas de seguridad del PAGAYA ID
 * (PRD-003 §3.1): el código corto identifica y no autentica; el QR personal es
 * un token de corta vida que sí autentica.
 *
 * **Lo que hay hoy (F1-03):** los tres roles de PRD-001 §4 y §12, la sesión
 * persistente sin contraseña de PRD-004 §3 y la regla de acceso a la comanda de
 * PRD-001 §14. Todo es puro: las reglas se prueban sin base de datos y la
 * persistencia entra por el puerto `RepositorioSesiones`, que implementa F1-02
 * con la capa única de acceso de arquitectura.md AT-1.
 *
 * **Lo que hay desde F1-20a:** pedir un código (`crearServicioOtp`) encola un
 * evento en el outbox de `@pagaya/notificacion` (arquitectura.md §14, AT-25).
 * **Lo que no hay:** confirmar el código y abrir cuenta (F1-21), ni los límites
 * de expiración, intentos y envío (F1-20b, F1-20c). De eso queda declarada la
 * frontera en `registro.ts`, sin implementación.
 *
 * **Lo que no puede haber:** una importación de `mesa` o de `comanda`
 * (fronteras.json). La regla de acceso recibe los hechos de la comanda como
 * descriptor; ver `acceso.ts`.
 */
import type { DescriptorModulo } from "@pagaya/nucleo";

export {
  ROLES,
  esPersonalDelLocal,
  rolDelTitular,
  type LocalId,
  type Rol,
  type RolDePersonal,
  type Titular,
  type UsuarioId,
} from "./roles.ts";

export {
  POLITICAS_POR_DEFECTO,
  abrirSesion,
  autenticar,
  estadoDeSesion,
  huellaDeToken,
  politicaDe,
  promoverACuenta,
  renovarSesion,
  revocarSesion,
  type Autenticacion,
  type DispositivoId,
  type EstadoSesion,
  type PoliticaSesion,
  type PoliticasSesion,
  type RepositorioSesiones,
  type Sesion,
  type SesionAbierta,
  type SesionId,
} from "./sesion.ts";

export {
  comensalesDeLaSesion,
  puedeVerComanda,
  type ComandaParaAcceso,
  type Decision,
  type IdentidadComensal,
  type MotivoRechazo,
} from "./acceso.ts";

export {
  CANAL_OTP_POR_DEFECTO,
  TIPO_EVENTO_OTP_SOLICITADO,
  crearServicioOtp,
  generarCodigoOtp,
  type CanalOtp,
  type Consentimiento,
  type DatosRegistro,
  type EventoOtpSolicitado,
  type LimitesOtp,
  type PayloadOtpSolicitado,
  type ProveedorCodigo,
  type ServicioIdentidad,
} from "./registro.ts";

export const modulo: DescriptorModulo = {
  nombre: "identidad",
  capa: "dominio",
  responsabilidad:
    "Roles, sesiones y acceso a la comanda (F1-03; PRD-001 §4, §12 y §14; PRD-004 §3). Solicitar OTP desde F1-20a (RF-C-02, PRD-004 §3); confirmarlo, el consentimiento y el PAGAYA ID llegan con F1-20b a F1-22 (RF-C-25, RF-C-26; PRD-003 §3).",
};
