/**
 * Acceso a PostgreSQL. arquitectura.md AT-1 pide una **única capa de acceso**
 * donde se filtre `local_id`, respaldada por row level security: esa capa es
 * `crearAcceso` (F1-02), y la row level security la enciende la migración
 * 0002.
 *
 * Lo que este archivo **no** exporta es tan parte de la decisión como lo que
 * exporta: ni el pool ni el cliente de `pg` salen del paquete. `pg` ya solo
 * puede entrar por acá (fronteras.json, dependencias_externas), así que entre
 * las dos reglas no queda forma de hablar con la base sin decir desde qué
 * local se mira. El pool sigue existiendo para el aplicador de migraciones,
 * que vive dentro de este paquete.
 */
export { crearAcceso } from "./acceso.ts";
export type { Acceso, Fila, Mirada, OpcionesAcceso, Transaccion } from "./acceso.ts";

export { migrarAmbiente } from "./postgres.ts";

export {
  aplicarMigraciones,
  directorioMigraciones,
  listarMigraciones,
  type Informe,
  type Migracion,
  type MigracionAplicada,
  type RegistroMigraciones,
} from "./migraciones.ts";
