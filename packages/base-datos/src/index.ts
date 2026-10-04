/**
 * Acceso a PostgreSQL. arquitectura.md AT-1 pide una **única capa de acceso**
 * donde se filtre `local_id`, respaldada por row level security: esa capa es
 * este paquete, y en F1-01 solo contiene el pool y las migraciones. El filtro
 * por local y la política de RLS llegan con F1-02.
 */
export {
  aplicarMigraciones,
  directorioMigraciones,
  listarMigraciones,
  type Informe,
  type Migracion,
  type MigracionAplicada,
  type RegistroMigraciones,
} from "./migraciones.ts";

export { crearPool, liberarCerrojoMigraciones, registroPostgres } from "./postgres.ts";
