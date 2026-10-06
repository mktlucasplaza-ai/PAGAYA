/**
 * La sesión: persistente, sin contraseña y revocable.
 *
 * Qué lo exige:
 *
 * - **RF-C-02 (mod. por PRD-004 §3):** "sin contraseña, con sesión
 *   persistente". PRD-004 §3 lo dice entero: "la sesión queda persistente en el
 *   dispositivo y se recupera con OTP. Una contraseña en un restaurante es una
 *   barrera sin beneficio".
 * - **PRD-001 §14:** "OTP con expiración y límite de intentos; **sesiones por
 *   rol**". La vigencia no es una sola para todos: la del cliente dura lo que
 *   dure su relación con el local, la del mesero dura una jornada.
 * - **RF-C-24 / PRD-004 §2.2:** unirse a la mesa, ver la carta y ver la comanda
 *   **no exigen registro**. Entonces existe una sesión sin cuenta, y existe el
 *   momento en que esa sesión se convierte en una con cuenta (F1-23).
 * - **RF-C-23:** eliminar la cuenta. Una sesión tiene que poder apagarse.
 *
 * Lo que F1-03 **no** hace: emitir el OTP (F1-20) ni crear la cuenta (F1-21).
 * Lo que sí fija es el final de esos caminos: toda sesión nace en `abrirSesion`
 * o en `promoverACuenta`, para que no exista una segunda manera de empezar una.
 */
import { createHash } from "node:crypto";

import { ErrorPagaya, type FuenteAleatoria, type Reloj } from "@pagaya/nucleo";

import { type Rol, type Titular, rolDelTitular } from "./roles.ts";

export type SesionId = string;
/** El dispositivo desde el que se abrió. Lo provee el cliente y no autentica. */
export type DispositivoId = string;

const SEGUNDO = 1000;
const MINUTO = 60 * SEGUNDO;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

/** Bytes del token. 32 bytes = 256 bits: no se adivina y no hay por qué discutirlo. */
const BYTES_TOKEN = 32;
const BYTES_ID = 16;
const PREFIJO_TOKEN = "pgs_";

export type Sesion = {
  readonly id: SesionId;
  readonly titular: Titular;
  readonly dispositivoId: DispositivoId;
  /**
   * sha256 del token. **El token no se guarda nunca**, acá ni en la base: una
   * tabla de sesiones en claro es un archivo de contraseñas en claro, y
   * PRD-001 §14 pide cifrado en reposo. Para comparar basta la huella.
   */
  readonly huellaToken: string;
  readonly creadaEn: Date;
  readonly ultimaActividadEn: Date;
  readonly expiraEn: Date;
  readonly revocadaEn: Date | null;
};

export type SesionAbierta = {
  readonly sesion: Sesion;
  /** El token en claro. Se devuelve una vez, al dispositivo, y no vuelve a existir. */
  readonly token: string;
};

export type EstadoSesion = "activa" | "expirada" | "revocada";

/**
 * Vigencia por rol (PRD-001 §14). `deslizante` decide si la actividad la
 * empuja hacia adelante o si el plazo se cuenta desde que se abrió.
 */
export type PoliticaSesion = {
  readonly vigenciaMs: number;
  readonly deslizante: boolean;
};

export type PoliticasSesion = Readonly<Record<"sin_cuenta" | Rol, PoliticaSesion>>;

/**
 * Los plazos son supuesto S-10 de docs/arquitectura.md: ningún PRD los fija.
 * Lo que sí está decidido es la **forma**, y es lo que importa acá:
 *
 * - **cliente, 180 días deslizantes.** Es lo que significa "persistente"
 *   (PRD-004 §3): al cliente que vuelve no se le vuelve a pedir el OTP. No
 *   tiene tope absoluto a propósito; lo que la cierra es la revocación
 *   (RF-C-23) o el desuso, no el calendario.
 * - **mesero 16 h y admin 12 h, no deslizantes.** Una jornada. Un teléfono de
 *   salón se presta, se pierde y se queda arriba de la barra: la sesión del
 *   personal tiene que caducar sola, y recuperarla cuesta un OTP, no una
 *   contraseña.
 * - **sin cuenta, 12 h deslizantes.** Cubre una comida larga. No es una
 *   identidad y no hay nada que recuperar; lo que de verdad le quita el acceso a
 *   la comanda es que se cierre la sesión de mesa (ver `acceso.ts`).
 */
export const POLITICAS_POR_DEFECTO: PoliticasSesion = {
  sin_cuenta: { vigenciaMs: 12 * HORA, deslizante: true },
  cliente: { vigenciaMs: 180 * DIA, deslizante: true },
  mesero: { vigenciaMs: 16 * HORA, deslizante: false },
  admin: { vigenciaMs: 12 * HORA, deslizante: false },
};

export function politicaDe(
  titular: Titular,
  politicas: PoliticasSesion = POLITICAS_POR_DEFECTO,
): PoliticaSesion {
  const rol = rolDelTitular(titular);
  return rol === null ? politicas.sin_cuenta : politicas[rol];
}

export function huellaDeToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function nuevoToken(aleatorio: FuenteAleatoria): { token: string; huella: string } {
  const token = PREFIJO_TOKEN + Buffer.from(aleatorio.bytes(BYTES_TOKEN)).toString("base64url");
  return { token, huella: huellaDeToken(token) };
}

function nuevoId(aleatorio: FuenteAleatoria): SesionId {
  return Buffer.from(aleatorio.bytes(BYTES_ID)).toString("hex");
}

/**
 * Abre una sesión. Devuelve el token una sola vez: el dispositivo lo guarda, el
 * servidor guarda su huella.
 */
export function abrirSesion({
  titular,
  dispositivoId,
  reloj,
  aleatorio,
  politicas = POLITICAS_POR_DEFECTO,
}: {
  readonly titular: Titular;
  readonly dispositivoId: DispositivoId;
  readonly reloj: Reloj;
  readonly aleatorio: FuenteAleatoria;
  readonly politicas?: PoliticasSesion;
}): SesionAbierta {
  const ahora = reloj.ahora();
  const { token, huella } = nuevoToken(aleatorio);
  return {
    token,
    sesion: {
      id: nuevoId(aleatorio),
      titular,
      dispositivoId,
      huellaToken: huella,
      creadaEn: ahora,
      ultimaActividadEn: ahora,
      expiraEn: new Date(ahora.getTime() + politicaDe(titular, politicas).vigenciaMs),
      revocadaEn: null,
    },
  };
}

export function estadoDeSesion(sesion: Sesion, ahora: Date): EstadoSesion {
  if (sesion.revocadaEn !== null) return "revocada";
  if (sesion.expiraEn.getTime() <= ahora.getTime()) return "expirada";
  return "activa";
}

/**
 * Marca actividad. Si la política es deslizante, empuja el vencimiento; si no,
 * solo registra que la sesión se usó.
 *
 * Renovar es una escritura: quien conecte esto a HTTP (F1-70) decide cada
 * cuánto lo hace, porque llamarlo en cada petición es escribir en la base en
 * cada petición.
 */
export function renovarSesion({
  sesion,
  ahora,
  politicas = POLITICAS_POR_DEFECTO,
}: {
  readonly sesion: Sesion;
  readonly ahora: Date;
  readonly politicas?: PoliticasSesion;
}): Sesion {
  const estado = estadoDeSesion(sesion, ahora);
  if (estado !== "activa") {
    throw new ErrorPagaya(
      "sesion_invalida",
      `no se renueva una sesión ${estado}: hay que abrir una nueva`,
    );
  }
  const politica = politicaDe(sesion.titular, politicas);
  return {
    ...sesion,
    ultimaActividadEn: ahora,
    expiraEn: politica.deslizante ? new Date(ahora.getTime() + politica.vigenciaMs) : sesion.expiraEn,
  };
}

export function revocarSesion(sesion: Sesion, ahora: Date): Sesion {
  return sesion.revocadaEn === null ? { ...sesion, revocadaEn: ahora } : sesion;
}

/**
 * El dispositivo que se sentó sin cuenta termina el registro y pasa a tener una
 * (F1-23, RF-C-05 mod.).
 *
 * **Conserva el `id` de la sesión** y el dispositivo: es lo que hace que el
 * carro armado y el participante que ya está en la comanda sobrevivan al
 * registro sin duplicarse, que es justo el riesgo que el backlog le cuelga a
 * F1-23 ("migrar la sesión anónima a la del usuario sin perder el carro").
 *
 * **Rota el token.** El token viejo nació sin cuenta y pudo llegar al
 * dispositivo por un camino que nadie controla —un enlace, un QR armado por un
 * tercero—; mantenerlo sería dejar que quien lo plantó herede la cuenta recién
 * creada. Es la misma lógica de PRD-003 §3.1: un token que ya circuló no se
 * reusa.
 */
export function promoverACuenta({
  sesion,
  titular,
  ahora,
  aleatorio,
  politicas = POLITICAS_POR_DEFECTO,
}: {
  readonly sesion: Sesion;
  readonly titular: Exclude<Titular, { tipo: "sin_cuenta" }>;
  readonly ahora: Date;
  readonly aleatorio: FuenteAleatoria;
  readonly politicas?: PoliticasSesion;
}): SesionAbierta {
  if (sesion.titular.tipo !== "sin_cuenta") {
    throw new ErrorPagaya(
      "sesion_invalida",
      "esta sesión ya tiene cuenta: cambiar de titular es abrir otra sesión, no promover ésta",
    );
  }
  const estado = estadoDeSesion(sesion, ahora);
  if (estado !== "activa") {
    throw new ErrorPagaya("sesion_invalida", `no se promueve una sesión ${estado}`);
  }
  const { token, huella } = nuevoToken(aleatorio);
  return {
    token,
    sesion: {
      ...sesion,
      titular,
      huellaToken: huella,
      ultimaActividadEn: ahora,
      expiraEn: new Date(ahora.getTime() + politicaDe(titular, politicas).vigenciaMs),
    },
  };
}

/**
 * Lo único que la mecánica necesita de la base de datos. Lo implementa F1-02
 * contra PostgreSQL, con la capa única de acceso que exige arquitectura.md AT-1;
 * acá es un puerto para que las reglas se puedan probar sin base encendida, igual
 * que `RegistroMigraciones` en `@pagaya/base-datos`.
 *
 * `porHuellaDeToken` no recibe `localId` y es deliberado: es la búsqueda que
 * **establece** de qué local es la petición, así que no puede filtrar por él.
 * Es la única de identidad que no lleva local, y la lleva su resultado.
 */
export type RepositorioSesiones = {
  guardar(sesion: Sesion): Promise<void>;
  porHuellaDeToken(huella: string): Promise<Sesion | null>;
  porId(id: SesionId): Promise<Sesion | null>;
};

export type Autenticacion =
  | { readonly ok: true; readonly sesion: Sesion }
  | { readonly ok: false; readonly motivo: "token_desconocido" | "sesion_expirada" | "sesion_revocada" };

/**
 * Del token a la sesión. No renueva: leer no es escribir, y quien decide cuándo
 * se renueva es quien conoce el costo de la escritura.
 */
export async function autenticar({
  repositorio,
  token,
  ahora,
}: {
  readonly repositorio: RepositorioSesiones;
  readonly token: string;
  readonly ahora: Date;
}): Promise<Autenticacion> {
  const sesion = await repositorio.porHuellaDeToken(huellaDeToken(token));
  if (sesion === null) return { ok: false, motivo: "token_desconocido" };
  const estado = estadoDeSesion(sesion, ahora);
  if (estado === "revocada") return { ok: false, motivo: "sesion_revocada" };
  if (estado === "expirada") return { ok: false, motivo: "sesion_expirada" };
  return { ok: true, sesion };
}
