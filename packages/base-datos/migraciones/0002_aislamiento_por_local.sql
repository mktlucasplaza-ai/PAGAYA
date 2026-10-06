-- 0002 — El local y el aislamiento entre locales (F1-02).
--
-- Qué lo exige: PRD-001 §13 ("multi-tenant desde el día uno: todos los datos
-- aislados por local, aunque el MVP opere con un local piloto" y "zona horaria
-- y turnos por local, porque 'visita del día' y 'ventas del día' dependen de
-- eso"), PRD-001 §14 ("acceso a la comanda limitado a la mesa y al personal del
-- local") y docs/arquitectura.md AT-1, que decide `local_id` obligatorio en
-- toda tabla de negocio, "filtrada en una única capa de acceso y respaldada por
-- row level security de PostgreSQL. El aislamiento no puede depender de que
-- nadie olvide un WHERE".
--
-- Esta migración no crea ninguna tabla de mesa, comanda ni pago: ésas son
-- F1-10, F1-40 y la Fase 2. Lo que crea es el inquilino y el mecanismo que
-- todas ellas van a usar. Ver docs/arquitectura.md §9 (AT-10 a AT-13).
--
-- La forma del mecanismo, en tres piezas:
--
--   pagaya_app          rol sin login al que la capa de acceso cambia con
--                       `SET LOCAL ROLE` en cada transacción. Es el único rol
--                       con permisos sobre las tablas de negocio.
--   pagaya.local_id     variable de sesión, fijada por transacción. Si no está,
--                       `local_actual()` es NULL, `local_id = NULL` no es
--                       verdadero para ninguna fila, y la consulta no ve nada.
--   pagaya.entre_locales variable de sesión que abre el paso entre locales para
--                       lo que legítimamente lo necesita: dar de alta un local
--                       y la carga inicial (F1-05). Apagada por defecto.
--
-- **Dos condiciones del alta de la base, sin las cuales esto es decorativo:**
--
-- 1. El rol que conecta **no puede ser superusuario**: un superusuario esquiva
--    la row level security entera, FORCE incluido, y las tres piezas de arriba
--    se vuelven falsas sin que nada falle. Es además lo que PRD-001 §14 pide
--    por otro lado: el proceso no corre con más privilegio del que necesita.
-- 2. `FORCE ROW LEVEL SECURITY` en toda tabla, para que el dueño del esquema
--    —que es el mismo rol que conecta— también quede sujeto. Sin FORCE, una
--    consulta que esquiva la capa de acceso vería las filas de todos los
--    locales en vez de ninguna.
--
-- Las dos las verifica packages/base-datos/src/acceso.prueba.ts contra
-- PostgreSQL de verdad.
--
-- Lo que esto **no** es: una frontera de privilegio contra nuestro propio
-- código. Quien puede abrir una transacción puede encender `entre_locales`,
-- igual que podría haber escrito un `SET ROLE`. Lo que compra la row level
-- security acá es que **el caso por defecto sea cero filas** y que cruzar de
-- local haya que escribirlo. La frontera de privilegio de verdad necesita una
-- segunda credencial; está nombrada como decisión diferida en
-- docs/arquitectura.md §9 (AT-11, consecuencias).

-- ---------------------------------------------------------------------------
-- El rol. Es un objeto del clúster, no de la base: por eso la creación es
-- condicional (en un equipo con la base de dev y la de pruebas en el mismo
-- clúster, la segunda migración lo encuentra ya creado). El comentario va
-- dentro del mismo bloque: si el rol ya existía porque lo creó otra base, quien
-- corre esta migración puede no tener permiso para comentarlo, y fallar por un
-- comentario sería absurdo.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pagaya_app') THEN
    CREATE ROLE pagaya_app NOLOGIN NOBYPASSRLS;
    COMMENT ON ROLE pagaya_app IS
      'Rol de la capa de acceso de PAGAYA. Ve solo el local fijado en la transacción (F1-02).';
  END IF;
END $$;

GRANT USAGE ON SCHEMA pagaya TO pagaya_app;

-- El rol que conecta tiene que poder hacer `SET LOCAL ROLE pagaya_app`. En dev
-- y en integración continua migra y sirve el mismo rol; cuando se separen, esto
-- es un GRANT en el alta de la base y no una migración nueva
-- (docs/arquitectura.md, supuesto S-10).
DO $$
BEGIN
  EXECUTE format('GRANT pagaya_app TO %I', current_user);
END $$;

-- ---------------------------------------------------------------------------
-- Las dos variables de sesión. `current_setting(..., true)` devuelve NULL si la
-- variable no existe, que es justamente el caso que tiene que ver cero filas.
-- ---------------------------------------------------------------------------

CREATE FUNCTION pagaya.local_actual() RETURNS uuid
  LANGUAGE sql
  STABLE
  PARALLEL SAFE
AS $$
  SELECT nullif(current_setting('pagaya.local_id', true), '')::uuid
$$;

COMMENT ON FUNCTION pagaya.local_actual() IS
  'El local fijado para esta transacción, o NULL. Lo fija la capa de acceso con SET LOCAL.';

CREATE FUNCTION pagaya.entre_locales() RETURNS boolean
  LANGUAGE sql
  STABLE
  PARALLEL SAFE
AS $$
  SELECT coalesce(current_setting('pagaya.entre_locales', true), 'no') = 'si'
$$;

COMMENT ON FUNCTION pagaya.entre_locales() IS
  'Si esta transacción pidió explícitamente cruzar de local (alta de un local, carga inicial F1-05). Apagada salvo que la capa de acceso la encienda, con motivo.';

GRANT EXECUTE ON FUNCTION pagaya.local_actual(), pagaya.entre_locales() TO pagaya_app;

-- ---------------------------------------------------------------------------
-- Zona horaria del local. Un nombre IANA mal escrito no se nota: PostgreSQL
-- falla al convertir, o peor, alguien "arregla" la consulta cayendo a UTC y el
-- cierre de caja de un sábado queda partido en dos días. Se valida al escribir.
-- ---------------------------------------------------------------------------

CREATE FUNCTION pagaya.zona_horaria_valida(zona text) RETURNS boolean
  LANGUAGE plpgsql
  STABLE
AS $$
BEGIN
  PERFORM now() AT TIME ZONE zona;
  RETURN true;
EXCEPTION
  WHEN OTHERS THEN RETURN false;
END
$$;

COMMENT ON FUNCTION pagaya.zona_horaria_valida(text) IS
  'Si PostgreSQL reconoce el nombre IANA. Se usa en el CHECK de local.zona_horaria.';

-- ---------------------------------------------------------------------------
-- El local.
--
-- "Datos del local" son hoy el nombre: lo demás que RF-A-09 y PRD-002 §5.5
-- nombran —RUT, dirección, datos de boleta— llega con la tarea que los usa, no
-- como columnas muertas que nadie llena en la Fase 1.
--
-- `configuracion` es un documento y no una columna por campo a propósito
-- (AT-12): entre PRD-002 y PRD-007 la configuración del local cambió de forma
-- cuatro veces, y nada de lo que guarda sostiene una invariante. Lo que sí
-- sostiene una invariante —dinero, identidad, aislamiento— es columna con su
-- restricción, nunca una clave de este documento.
-- ---------------------------------------------------------------------------

CREATE TABLE pagaya.local (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre         text        NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 120),
  zona_horaria   text        NOT NULL CHECK (pagaya.zona_horaria_valida(zona_horaria)),
  configuracion  jsonb       NOT NULL DEFAULT '{}'::jsonb
                             CHECK (jsonb_typeof(configuracion) = 'object'),
  activo         boolean     NOT NULL DEFAULT true,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE pagaya.local IS
  'El inquilino. Su clave de aislamiento es su propio id, no una columna local_id (PRD-001 §13).';
COMMENT ON COLUMN pagaya.local.zona_horaria IS
  'Nombre IANA, p. ej. America/Santiago. De esto dependen "visita del día" y "ventas del día" (PRD-001 §8 y §13).';
COMMENT ON COLUMN pagaya.local.configuracion IS
  'Configuración del local (PRD-002 §6, PRD-003 §5, PRD-004 §8, PRD-006 §4, PRD-007 §4). Cada clave la agrega la tarea que la usa; nada que sostenga una invariante vive acá.';

ALTER TABLE pagaya.local ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagaya.local FORCE ROW LEVEL SECURITY;

-- Un local se lee y se configura a sí mismo —RF-A-07 (umbrales de nivel),
-- RF-A-09 (medios de pago, impuestos y datos del local) y RF-A-12 (rotación
-- del PIN) son del administrador de ese local—, pero **no puede mudarse de
-- identidad**: el `WITH CHECK` del UPDATE impide que una fila termine con el
-- id de otro.
--
-- Darse de alta y darse de baja sí cruzan de local por definición —hay que
-- estar fuera de uno para crearlo— y por eso exigen `entre_locales`.
--
-- Quién, dentro del local, tiene derecho a configurarlo es otra pregunta y
-- otra capa: roles y sesiones son F1-03. La row level security responde "de
-- qué local es esta fila", no "quién es esta persona".
CREATE POLICY lectura_del_local ON pagaya.local
  FOR SELECT TO pagaya_app
  USING (id = pagaya.local_actual() OR pagaya.entre_locales());

CREATE POLICY alta_de_local ON pagaya.local
  FOR INSERT TO pagaya_app
  WITH CHECK (pagaya.entre_locales());

CREATE POLICY cambio_de_local ON pagaya.local
  FOR UPDATE TO pagaya_app
  USING (id = pagaya.local_actual() OR pagaya.entre_locales())
  WITH CHECK (id = pagaya.local_actual() OR pagaya.entre_locales());

CREATE POLICY baja_de_local ON pagaya.local
  FOR DELETE TO pagaya_app
  USING (pagaya.entre_locales());

GRANT SELECT, INSERT, UPDATE, DELETE ON pagaya.local TO pagaya_app;

-- ---------------------------------------------------------------------------
-- La fecha del local. "Máximo una visita por día por local" (PRD-001 §8) y
-- "ventas del día" (RF-A-06) son preguntas sobre el calendario del local, no
-- sobre el del servidor ni el del teléfono del cliente. Se calcula en la base
-- para que la respuesta sea una sola.
-- ---------------------------------------------------------------------------

CREATE FUNCTION pagaya.fecha_local(local uuid, instante timestamptz) RETURNS date
  LANGUAGE sql
  STABLE
  PARALLEL SAFE
AS $$
  SELECT (instante AT TIME ZONE l.zona_horaria)::date
  FROM pagaya.local AS l
  WHERE l.id = local
$$;

COMMENT ON FUNCTION pagaya.fecha_local(uuid, timestamptz) IS
  'El día calendario del local para un instante dado. Supuesto S-9: el día operativo es el día calendario del local; un local que cierra después de medianoche necesitaría un corte configurable, y eso es un PRD.';

GRANT EXECUTE ON FUNCTION pagaya.fecha_local(uuid, timestamptz) TO pagaya_app;

-- ---------------------------------------------------------------------------
-- El mecanismo que toda tabla de negocio usa.
--
-- Son cinco pasos y basta con olvidar uno —típicamente FORCE— para que el
-- aislamiento sea una creencia. Por eso es una llamada y no un copiar y pegar:
-- `SELECT pagaya.activar_aislamiento('pagaya.mesa');` al final de la migración
-- que crea la tabla.
-- ---------------------------------------------------------------------------

CREATE FUNCTION pagaya.activar_aislamiento(tabla regclass) RETURNS void
  LANGUAGE plpgsql
AS $$
DECLARE
  columna_local smallint;
BEGIN
  SELECT a.attnum INTO columna_local
  FROM pg_attribute AS a
  WHERE a.attrelid = tabla
    AND a.attname = 'local_id'
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND a.atttypid = 'uuid'::regtype
    AND a.attnotnull;

  IF columna_local IS NULL THEN
    RAISE EXCEPTION
      '%: toda tabla de negocio lleva local_id uuid NOT NULL (arquitectura.md AT-1)', tabla;
  END IF;

  IF NOT EXISTS (
    SELECT FROM pg_constraint AS c
    WHERE c.conrelid = tabla
      AND c.contype = 'f'
      AND c.confrelid = 'pagaya.local'::regclass
      AND c.conkey = ARRAY[columna_local]::smallint[]
  ) THEN
    RAISE EXCEPTION
      '%.local_id tiene que referenciar a pagaya.local: un local_id huérfano aísla filas de nadie',
      tabla;
  END IF;

  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tabla);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tabla);

  EXECUTE format(
    'CREATE POLICY aislamiento_por_local ON %s FOR ALL TO pagaya_app
       USING (local_id = pagaya.local_actual() OR pagaya.entre_locales())
       WITH CHECK (local_id = pagaya.local_actual() OR pagaya.entre_locales())', tabla);

  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO pagaya_app', tabla);
END
$$;

COMMENT ON FUNCTION pagaya.activar_aislamiento(regclass) IS
  'Enciende el aislamiento por local de una tabla de negocio: exige local_id uuid NOT NULL con referencia a local, fuerza RLS, crea la política y da los permisos. La llama la migración que crea la tabla.';

-- ---------------------------------------------------------------------------
-- Las excepciones, escritas. Una tabla sin local_id tiene que ser una decisión
-- que alguien tomó y firmó, no un descuido que nadie vio.
-- ---------------------------------------------------------------------------

CREATE TABLE pagaya.tabla_sin_local (
  tabla  text PRIMARY KEY,
  motivo text NOT NULL CHECK (length(btrim(motivo)) > 0)
);

COMMENT ON TABLE pagaya.tabla_sin_local IS
  'Tablas del esquema pagaya que a propósito no llevan local_id, con el motivo. Agregar una fila acá es la forma de pedir la excepción, y se revisa como cualquier otro cambio.';

INSERT INTO pagaya.tabla_sin_local (tabla, motivo) VALUES
  ('migracion',
   'Registro de las migraciones aplicadas: es del esquema, no de ningún local (F1-01).'),
  ('local',
   'Es el inquilino mismo: su clave de aislamiento es su propio id, con sus políticas aparte.'),
  ('tabla_sin_local',
   'Es el registro de las excepciones: si llevara local_id, un local podría concederse una.');

-- ---------------------------------------------------------------------------
-- La guardia. Devuelve las tablas del esquema que deberían estar aisladas y no
-- lo están, con el motivo exacto. La usa una prueba de `make verify`, y sirve
-- igual para mirar una base en operación sin leer una sola migración.
-- ---------------------------------------------------------------------------

CREATE FUNCTION pagaya.tablas_sin_aislamiento()
  RETURNS TABLE (tabla text, motivo text)
  LANGUAGE sql
  STABLE
AS $$
  SELECT c.relname::text,
         CASE
           WHEN NOT EXISTS (
             SELECT FROM pg_attribute AS a
             WHERE a.attrelid = c.oid AND a.attname = 'local_id'
               AND a.attnum > 0 AND NOT a.attisdropped
               AND a.atttypid = 'uuid'::regtype AND a.attnotnull
           ) THEN 'no tiene local_id uuid NOT NULL'
           WHEN NOT c.relrowsecurity THEN 'row level security apagada'
           WHEN NOT c.relforcerowsecurity THEN 'row level security sin FORCE: el dueño la esquiva'
           ELSE 'sin política aislamiento_por_local'
         END
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'pagaya'
    AND c.relkind = 'r'
    AND c.relname NOT IN (SELECT e.tabla FROM pagaya.tabla_sin_local AS e)
    AND NOT (
      EXISTS (
        SELECT FROM pg_attribute AS a
        WHERE a.attrelid = c.oid AND a.attname = 'local_id'
          AND a.attnum > 0 AND NOT a.attisdropped
          AND a.atttypid = 'uuid'::regtype AND a.attnotnull
      )
      AND c.relrowsecurity
      AND c.relforcerowsecurity
      AND EXISTS (
        SELECT FROM pg_policy AS p
        WHERE p.polrelid = c.oid AND p.polname = 'aislamiento_por_local'
      )
    )
$$;

COMMENT ON FUNCTION pagaya.tablas_sin_aislamiento() IS
  'Las tablas del esquema que deberían estar aisladas por local y no lo están. Si devuelve algo, make verify falla.';
