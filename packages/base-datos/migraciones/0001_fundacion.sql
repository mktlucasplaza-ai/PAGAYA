-- 0001 — Fundación del esquema (F1-01; PRD-001 §13).
--
-- Esta migración no crea ninguna tabla de negocio, y eso es a propósito: F1-01
-- prueba el camino de las migraciones, no el modelo de datos. Las tablas con su
-- `local_id` obligatorio y su row level security llegan con F1-02, que es la
-- tarea que el backlog hace depender de ésta.
--
-- Lo único que se decide acá es dónde van a vivir: un esquema propio, no
-- `public`. Así una extensión, una tabla de una herramienta o un `CREATE TABLE`
-- distraído no aterrizan en el mismo lugar que el negocio, y `search_path` deja
-- de ser una pregunta abierta en cada sesión.
--
-- No se usa ninguna extensión: `gen_random_uuid()` es parte de PostgreSQL desde
-- la 13, y pedir una extensión obliga a tener superusuario en staging para nada.

CREATE SCHEMA IF NOT EXISTS pagaya;

COMMENT ON SCHEMA pagaya IS
  'Tablas de negocio de PAGAYA. Toda tabla acá lleva local_id (arquitectura.md AT-1).';
