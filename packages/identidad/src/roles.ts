/**
 * Los tres roles del sistema, y de quién es una sesión.
 *
 * PRD-001 §4 define tres roles con experiencias distintas —cliente, mesero,
 * administrador— y PRD-001 §12 agrega el dato que decide la forma de este
 * archivo: el usuario tiene `rol` y además el **local al que pertenece
 * (meseros y admin)**. El cliente no pertenece a un local: su cuenta es una
 * persona (PRD-004 §3, una cuenta por número de teléfono) y lo que es por local
 * son sus visitas y su nivel (PRD-001 §8), no su identidad.
 *
 * De ahí salen tres titulares de sesión y no tres roles: al dispositivo que se
 * unió a la mesa **sin registrarse** (RF-C-24, PRD-004 §2.2) hay que poder
 * nombrarlo, porque ve la carta y la comanda, y no tiene rol porque no tiene
 * cuenta. Modelarlo como un cuarto rol sería mentir en el modelo de datos de
 * PRD-001 §12; modelarlo como "cliente sin usuarioId" sería un `null` que todo
 * el código tiene que recordar revisar.
 */

/** Identificadores. F1-02 define su forma en la base; acá solo su nombre. */
export type UsuarioId = string;
export type LocalId = string;

/** PRD-001 §12: `rol (cliente | mesero | admin)`. */
export type Rol = "cliente" | "mesero" | "admin";

export const ROLES: readonly Rol[] = ["cliente", "mesero", "admin"];

/**
 * El personal del local. PRD-001 §14 limita el acceso a la comanda "a la mesa y
 * al **personal del local**": esta es la mitad que no está sentada en la mesa, y
 * por eso es un tipo y no un `if` repetido en cada regla.
 */
export type RolDePersonal = Extract<Rol, "mesero" | "admin">;

export function esPersonalDelLocal(rol: Rol): rol is RolDePersonal {
  return rol === "mesero" || rol === "admin";
}

/**
 * De quién es una sesión.
 *
 * El `localId` vive acá y solo en el personal, que es exactamente lo que dice
 * PRD-001 §12. La consecuencia importa para la regla de acceso: a un cliente no
 * se le compara el local contra el de la comanda, porque no tiene uno; lo que lo
 * ata a un local es estar sentado en una comanda de ese local, que es un hecho
 * más fuerte que un campo.
 */
export type Titular =
  | { readonly tipo: "sin_cuenta" }
  | { readonly tipo: "cliente"; readonly usuarioId: UsuarioId }
  | {
      readonly tipo: "personal";
      readonly rol: RolDePersonal;
      readonly usuarioId: UsuarioId;
      readonly localId: LocalId;
    };

/** El rol del titular, o `null` si todavía no tiene cuenta. */
export function rolDelTitular(titular: Titular): Rol | null {
  switch (titular.tipo) {
    case "sin_cuenta":
      return null;
    case "cliente":
      return "cliente";
    case "personal":
      return titular.rol;
  }
}
