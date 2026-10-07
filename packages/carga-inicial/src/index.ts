/**
 * Carga inicial del local piloto (F1-05).
 *
 * El backlog de la Fase 1 ([docs/backlog-fase-1.md](../../../docs/backlog-fase-1.md))
 * define F1-05 como "carga inicial del local piloto por script: carta, mesas,
 * QR, meseros y asignaciones", y dice que **sustituye por ahora a RF-A-01 a
 * RF-A-04**, que llegan con el panel de administración en la Fase 4
 * (PRD-001 §18). Hasta entonces el local piloto se configura con un archivo
 * versionado y este comando.
 *
 * La decisión y sus alternativas descartadas están en
 * [docs/arquitectura.md §11](../../../docs/arquitectura.md).
 */
export {
  FORMATO_SOPORTADO,
  ORDEN_ENTIDADES,
  type Asignacion,
  type Categoria,
  type Entidad,
  type Local,
  type LocalPiloto,
  type Mesa,
  type Mesero,
  type Producto,
  type Turno,
  type Valor,
  type Variante,
  type Zona,
} from "./contrato.ts";

export {
  archivoEjemplo,
  tokenQrDerivado,
  validar,
  validarArchivo,
  type Problema,
  type Validacion,
} from "./validacion.ts";

export {
  cargar,
  filasDeseadas,
  planificar,
  resumir,
  type Accion,
  type Cambio,
  type Fila,
  type FilaIdentificada,
  type Plan,
  type RepositorioCarga,
} from "./plan.ts";

export { repositorioPostgres } from "./repositorio-postgres.ts";

/**
 * El doble en memoria. Dejó de ser lo que hace correr el comando —eso es
 * `repositorioPostgres` desde F1-06— y quedó en lo que siempre fue: el
 * repositorio contra el que se prueban la planificación y la idempotencia sin
 * una base de datos encendida (docs/arquitectura.md §12, AT-19).
 */
export { repositorioMemoria, type RepositorioMemoria } from "./repositorio-memoria.ts";
