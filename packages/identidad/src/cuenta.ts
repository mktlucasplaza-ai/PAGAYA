/**
 * F1-21a: el alta de la cuenta del cliente, con una cuenta por teléfono.
 *
 * Qué lo exige: **RF-C-02 (mod. por PRD-004 §3)** —"nombre de pila, teléfono y
 * OTP. Una cuenta por número de teléfono"— y **PRD-004 §9, criterio 5**: "un
 * segundo registro con el mismo número de teléfono **entra a la cuenta
 * existente** en lugar de crear otra". Esas dos frases son una sola operación,
 * no dos caminos: ver `registro.ts`, donde `confirmar` ya estaba declarado así
 * desde F1-03.
 *
 * El alta **parte de un OTP ya verificado** (F1-20b, `verificacion-otp.ts`):
 * acá no se compara ningún código. Y **no abre la sesión**: eso es F1-21b, que
 * es la que llama a `abrirSesion` o a `promoverACuenta` (`sesion.ts`, AT-10).
 * Esta tarea termina en una cuenta.
 *
 * **Esta tarea no agrega migraciones.** La tabla `usuario` y su restricción
 * `usuario_telefono_unico` existen desde la migración 0003, y el cliente es un
 * usuario **sin `local_id`** (arquitectura.md §9.3). Lo que entra por el puerto
 * `RepositorioCuentas` es la operación, no la consulta: la decisión de que sea
 * **una sola sentencia atómica** y por qué, en arquitectura.md §32 (AT-65).
 */
import { aleatorioDelSistema, type FuenteAleatoria } from "@pagaya/nucleo";

import type { UsuarioId } from "./roles.ts";

/**
 * La cuenta del cliente: los dos campos de PRD-004 §3 y su identificador. Sin
 * `localId` a propósito —una persona no pertenece a un local (§9.3)— y sin rol,
 * porque esta función solo da de alta clientes.
 */
export type CuentaCliente = {
  readonly id: UsuarioId;
  readonly nombrePila: string;
  readonly telefono: string;
};

/** PRD-004 §3: dos campos. El OTP ya se verificó y el consentimiento es F1-22. */
export type DatosDeAlta = {
  readonly nombrePila: string;
  readonly telefono: string;
};

/**
 * `telefono_de_personal` es el caso que arquitectura.md §9.4 dejó escrito: "un
 * titular tiene un rol", y el teléfono es único en **todo** el sistema, así que
 * el mesero que carga el local con su número no puede además registrarse como
 * cliente. Se rechaza con su propio motivo en lugar de devolver la cuenta del
 * mesero —sería entregarle una sesión de personal a quien pasó un OTP de
 * cliente— y en lugar de convertirla, que es lo que el disparador
 * `identidad_no_cruza_de_lado` de la migración 0003 ya prohíbe.
 */
export type MotivoRechazoAlta = "nombre_invalido" | "telefono_invalido" | "telefono_de_personal";

export type AltaDeCuenta =
  | { readonly ok: true; readonly cuenta: CuentaCliente; readonly reusada: boolean }
  | { readonly ok: false; readonly motivo: MotivoRechazoAlta };

/**
 * Lo que el repositorio puede responder: el formato ya lo revisó
 * `altaDeCuenta`, así que de los tres motivos solo le queda el que únicamente
 * se sabe al escribir.
 */
export type AltaPersistida =
  | { readonly ok: true; readonly cuenta: CuentaCliente; readonly reusada: boolean }
  | { readonly ok: false; readonly motivo: "telefono_de_personal" };

/**
 * Lo único que el alta necesita de la persistencia, y es **una** operación:
 * "crea la cuenta, o entra a la existente".
 *
 * **No existe un `porTelefono` seguido de un `crear`, y eso es el contrato, no
 * una comodidad del adaptador.** Entre la lectura y la escritura hay una
 * ventana: dos registros simultáneos con el mismo número leen "no existe", los
 * dos insertan, y uno se cae contra `usuario_telefono_unico` —el cliente ve un
 * error habiendo hecho todo bien— o, si alguien "arregla" eso capturando el
 * error, queda un camino que a veces crea dos cuentas. PRD-004 §3 dice una
 * cuenta por número, y una regla que depende de que dos peticiones no se crucen
 * no es una regla. En PostgreSQL es un `INSERT … ON CONFLICT (telefono) DO
 * UPDATE … RETURNING`: ver `cuenta-postgres.ts` y arquitectura.md §32.
 *
 * `reusada` no es decoración: distingue el registro nuevo del reingreso, que
 * son dos hechos distintos del embudo de PRD-004 §7 (F1-80a), y es lo que una
 * prueba puede afirmar para mostrar que la cuenta no se duplicó.
 */
export type RepositorioCuentas = {
  altaDeCliente(datos: DatosDeAlta): Promise<AltaPersistida>;
};

/**
 * Los mismos límites que el `CHECK` de la migración 0003, repetidos acá a
 * propósito: el esquema es el dueño de la regla —es el único lugar donde
 * "imposible" significa imposible— y esta copia solo existe para que un dato
 * mal tipeado en un formulario sea un resultado con motivo y no una excepción
 * de PostgreSQL que la pantalla no sabe traducir (PRD-003 §5: todo rechazo con
 * un código que se pueda contar).
 */
const E164 = /^\+[1-9][0-9]{7,14}$/;
const LARGO_MAXIMO_NOMBRE = 60;

/**
 * Da de alta la cuenta, o entra a la que ya existe para ese teléfono.
 *
 * El nombre y el teléfono se **normalizan antes de comparar**: un espacio al
 * final no puede ser la diferencia entre entrar a su cuenta y crear otra, que
 * es justo lo que PRD-004 §3 cierra ("cierra el farmeo de niveles con cuentas
 * múltiples").
 *
 * **El nombre de la cuenta existente no se toca.** PRD-004 §9, criterio 5 dice
 * "entra a la cuenta existente", no "edita la cuenta existente": quien vuelve a
 * registrarse está ingresando, y dejar que ese formulario renombre la cuenta
 * haría que un tipeo distinto cambie con qué nombre lo saluda el mesero
 * (PRD-003 §3.4). Cambiar el nombre es editar el perfil, y no tiene tarea en
 * este backlog.
 */
export async function altaDeCuenta({
  repositorio,
  datos,
}: {
  readonly repositorio: RepositorioCuentas;
  readonly datos: DatosDeAlta;
}): Promise<AltaDeCuenta> {
  const nombrePila = datos.nombrePila.trim();
  const telefono = datos.telefono.trim();

  if (nombrePila.length === 0 || nombrePila.length > LARGO_MAXIMO_NOMBRE) {
    return { ok: false, motivo: "nombre_invalido" };
  }
  if (!E164.test(telefono)) {
    return { ok: false, motivo: "telefono_invalido" };
  }

  return repositorio.altaDeCliente({ nombrePila, telefono });
}

const BYTES_ID = 16;

/**
 * El adaptador en memoria, por el mismo motivo que `repositorioOtpEnMemoria` y
 * `limitadorEnviosEnMemoria`: deja probar lo que se compone sobre el puerto sin
 * base encendida. **No es el que prueba F1-21a**: la regla que esta tarea tiene
 * que mostrar es una propiedad de PostgreSQL, y un doble que "reutiliza" porque
 * alguien escribió que reutilice no prueba nada (el mismo argumento de
 * arquitectura.md §15 para la prueba de F1-04). Esa prueba está en
 * `cuenta-postgres.prueba.ts`.
 *
 * `telefonosDePersonal` existe para que el adaptador pueda responder los dos
 * resultados del puerto y no solo el cómodo: un doble que nunca rechaza deja a
 * quien lo usa sin manejar el rechazo hasta producción.
 *
 * **Cómo cumple la atomicidad que el puerto exige:** lee y escribe el `Map` sin
 * ningún `await` en el medio, así que nada se intercala entre las dos mitades.
 * Es lo mismo que en PostgreSQL hace una sola sentencia.
 */
export function repositorioCuentasEnMemoria(
  opciones: {
    readonly telefonosDePersonal?: readonly string[];
    readonly aleatorio?: FuenteAleatoria;
  } = {},
): RepositorioCuentas {
  const aleatorio = opciones.aleatorio ?? aleatorioDelSistema;
  const personal = new Set(opciones.telefonosDePersonal ?? []);
  const porTelefono = new Map<string, CuentaCliente>();

  return {
    altaDeCliente: async ({ nombrePila, telefono }) => {
      if (personal.has(telefono)) return { ok: false, motivo: "telefono_de_personal" };

      const existente = porTelefono.get(telefono);
      if (existente !== undefined) return { ok: true, cuenta: existente, reusada: true };

      const cuenta: CuentaCliente = {
        id: Buffer.from(aleatorio.bytes(BYTES_ID)).toString("hex"),
        nombrePila,
        telefono,
      };
      porTelefono.set(telefono, cuenta);
      return { ok: true, cuenta, reusada: false };
    },
  };
}
