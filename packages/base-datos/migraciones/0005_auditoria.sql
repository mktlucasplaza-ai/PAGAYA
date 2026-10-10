-- 0005 — El registro de auditoría append-only (F1-04).
--
-- Qué lo exige: PRD-001 §14, textual: "toda anulación, corrección y pago queda
-- registrada con actor y timestamp". Y tres lugares que ya cuentan con que
-- estas filas existan:
--
--   RF-A-10              "ver el historial de correcciones de comanda y
--                        anulaciones (auditoría)": el panel lee por entidad.
--   RF-A-15 (mod. PRD-006 §2) la vía de ingreso de cada comensal, el
--                        beneficiario y quién pagó, "para auditoría de
--                        descuentos".
--   AT-4, regla 5 (§5)   el intento de descuento rechazado se registra con
--                        actor, comanda y motivo: "un rechazo que nadie ve es
--                        un fraude que nadie investiga".
--
-- La decisión, con sus alternativas descartadas, está en docs/arquitectura.md
-- §15 (AT-30 la tabla y el append-only, AT-31 el puerto que escribe en la
-- transacción de quien la llama).
--
-- **Lo que esta migración NO crea, y por qué** está en §15.4: la lectura del
-- panel (F1-62), la retención y el archivado, y las columnas de una entidad en
-- particular. Nada que otra tarea tenga que decidir.

-- ---------------------------------------------------------------------------
-- La tabla.
--
-- Tres cosas no son obvias:
--
-- 1. **La clave es un `bigint` de identidad y no un `uuid`**, al revés que toda
--    otra tabla del esquema, porque acá el orden de escritura es un dato de la
--    auditoría. `ocurrido_en` no sirve para ordenar: es `now()`, el instante de
--    la transacción, y dos filas escritas en la misma transacción —el cambio y
--    su rechazo, dos ítems corregidos juntos— lo comparten letra por letra. Eso
--    no es un defecto: la fila de auditoría y el cambio comparten instante
--    porque comparten transacción (AT-31), y es justamente por eso que hace
--    falta otra cosa para ordenarlas entre sí.
--
-- 2. **`actor_rol` es una instantánea**, no un `JOIN` a `usuario.rol`. La
--    migración 0003 permite pasar de mesero a administrador (RF-A-03), así que
--    leer el rol actual reescribiría quién hizo qué con qué atribuciones. Es el
--    mismo argumento con el que AT-4 descartó recalcular el descuento al leer.
--
-- 3. **`datos` es un documento** (AT-14) y no una columna por PRD. Lo que
--    RF-A-15 pide guardar —vía de ingreso, beneficiario, quién pagó— cambió de
--    forma entre PRD-003 y PRD-006, y nada de eso sostiene una invariante: lo
--    que sí la sostiene vive en `pago` con su `CHECK` (AT-4, capa 4), no acá.
--    Esta tabla registra el hecho; no es donde se impide el hecho imposible.
--
-- Y una cuarta, por omisión: **`entidad_id` no es clave foránea de nada**, a
-- propósito. Una fila de auditoría tiene que sobrevivir a la fila que describe
-- —la comanda anulada, el participante que salió de la mesa— y una clave
-- foránea con cascada la borraría justo cuando hace falta. Es también lo que
-- permite auditar entidades que todavía no existen como tabla sin tocar esta
-- migración, que es inmutable (AT-7).
--
-- `local_id` sí es clave foránea, y **sin cascada**: ver el bloque del
-- append-only más abajo.
-- ---------------------------------------------------------------------------

CREATE TABLE pagaya.auditoria (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  local_id    uuid        NOT NULL REFERENCES pagaya.local(id),
  -- Qué pasó y sobre qué, en minúsculas con guión bajo: 'comanda_corregida',
  -- 'descuento_rechazado'. El vocabulario lo fija cada tarea que audita; el
  -- esquema solo exige que sea un identificador y no una frase.
  accion      text        NOT NULL CHECK (accion ~ '^[a-z][a-z0-9_]{2,59}$'),
  entidad     text        NOT NULL CHECK (entidad ~ '^[a-z][a-z0-9_]{2,39}$'),
  entidad_id  uuid        NOT NULL,
  -- PRD-003, criterio 4: el intento imposible "es imposible de generar, y el
  -- intento queda registrado". Sin esta columna, un rechazo y un cambio
  -- aplicado se verían igual en el panel de RF-A-10.
  resultado   text        NOT NULL DEFAULT 'aplicado'
                          CHECK (resultado IN ('aplicado', 'rechazado')),
  -- El actor de PRD-001 §14. 'sistema' existe porque no todo lo auditable lo
  -- hace una persona —el vencimiento de una sesión (PRD-004 §3), una salida
  -- encolada que se ejecuta sola (RF-C-21)—, y escribir un usuario inventado
  -- para esos casos sería falsear quién hizo qué.
  actor_tipo  text        NOT NULL CHECK (actor_tipo IN ('usuario', 'sistema')),
  actor_id    uuid        REFERENCES pagaya.usuario(id),
  actor_rol   text        CHECK (actor_rol IN ('cliente', 'mesero', 'admin')),
  motivo      text        CHECK (motivo IS NULL OR length(btrim(motivo)) BETWEEN 1 AND 500),
  datos       jsonb       NOT NULL DEFAULT '{}'::jsonb
                          CHECK (jsonb_typeof(datos) = 'object'),
  ocurrido_en timestamptz NOT NULL DEFAULT now(),

  -- Escritas como equivalencias, igual que `usuario_local_segun_rol` en la
  -- migración 0003: así no existe ni un actor 'sistema' con usuario ni un
  -- actor 'usuario' sin él.
  CONSTRAINT auditoria_actor_segun_tipo
    CHECK ((actor_tipo = 'usuario') = (actor_id IS NOT NULL)),
  CONSTRAINT auditoria_rol_segun_tipo
    CHECK ((actor_tipo = 'usuario') = (actor_rol IS NOT NULL)),

  -- AT-4, regla 5: el rechazo se registra "con actor, comanda y motivo". Un
  -- rechazo sin motivo es una fila que no sirve para investigar nada, que es lo
  -- único para lo que se escribió.
  CONSTRAINT auditoria_rechazo_con_motivo
    CHECK (resultado = 'aplicado' OR motivo IS NOT NULL)
);

COMMENT ON TABLE pagaya.auditoria IS
  'Registro append-only de lo que PRD-001 §14 exige registrar con actor y timestamp. Se escribe en la misma transacción que el cambio (docs/arquitectura.md §15, AT-31); no se corrige ni se borra (AT-30).';
COMMENT ON COLUMN pagaya.auditoria.id IS
  'Orden de escritura, que acá es un dato: dos filas de la misma transacción comparten ocurrido_en y solo este número las ordena.';
COMMENT ON COLUMN pagaya.auditoria.actor_rol IS
  'El rol del actor cuando ocurrió el hecho, como instantánea: RF-A-03 permite pasar de mesero a administrador, y leer el rol actual reescribiría la historia.';
COMMENT ON COLUMN pagaya.auditoria.datos IS
  'El detalle del hecho (RF-A-15: vía de ingreso, beneficiario, quién pagó). Documento y no columna por PRD, por AT-14; nada que sostenga una invariante vive acá.';

-- Cómo lee RF-A-10: el historial de *una* comanda, lo más reciente primero. El
-- `local_id` va primero porque la row level security lo agrega a toda consulta
-- (AT-12) y porque ninguna lectura cruza locales.
CREATE INDEX auditoria_por_entidad
  ON pagaya.auditoria (local_id, entidad, entidad_id, id DESC);

SELECT pagaya.activar_aislamiento('pagaya.auditoria');

-- ---------------------------------------------------------------------------
-- Append-only, en dos piezas, porque ninguna de las dos alcanza sola.
--
-- 1. **El privilegio que no se otorga.** `activar_aislamiento` da los cuatro
--    permisos a `pagaya_app`; acá se le quitan los dos que sobran. Un UPDATE
--    de la aplicación falla con "permission denied", no con una fila cambiada:
--    es la pieza que cubre todo el código que escribimos, porque todo el código
--    que escribimos habla por este rol (AT-13).
--
-- 2. **El disparador que sí ve un superusuario.** La migración 0002 ya exige que
--    el rol que conecta no sea superusuario, y la política de aislamiento —que
--    es `TO pagaya_app`— deja al dueño del esquema sin ninguna política
--    aplicable, así que bajo FORCE ROW LEVEL SECURITY tampoco puede tocar estas
--    filas. Pero los dos caminos son privilegios, y un privilegio se concede: un
--    `GRANT UPDATE` de más en una migración futura, o una sesión de superusuario
--    a las 2 de la mañana "arreglando un dato", pasan por el costado de los dos.
--    Un disparador no: se ejecuta igual para el dueño y para el superusuario.
--
-- Es `FOR EACH STATEMENT` y no `FOR EACH ROW` a propósito: así también falla el
-- `DELETE` que, por la row level security, no alcanzaría ninguna fila y
-- terminaría en silencio diciendo "0 filas". Y lleva `TRUNCATE`, que es el
-- camino corto que no dispararía un disparador de filas.
--
-- **Y de ahí sale la ausencia de `ON DELETE CASCADE` en `local_id` y en
-- `actor_id`.** Con cascada, borrar el local sería la tercera puerta: el
-- `DELETE` que la cascada emite sobre esta tabla pasaría por este disparador y
-- lo haría fallar, o —si se lo exceptuara— borraría la auditoría entera del
-- local sin que nadie escriba la palabra `auditoria`. Sin cascada, el `DELETE`
-- del local falla por la clave foránea, y eso es la respuesta correcta y no un
-- obstáculo: la baja de un local es `local.activo = false` (migración 0002), no
-- un borrado. Lo mismo para el mesero que ya corrigió una comanda: `activo`,
-- no `DELETE` (RF-A-03).
-- ---------------------------------------------------------------------------

REVOKE UPDATE, DELETE ON pagaya.auditoria FROM pagaya_app;

CREATE FUNCTION pagaya.auditoria_es_append_only() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'pagaya.auditoria es append-only (PRD-001 §14, docs/arquitectura.md §15 AT-30): una fila de auditoría no se corrige ni se borra; lo que corrige un hecho es otra fila';
END
$$;

COMMENT ON FUNCTION pagaya.auditoria_es_append_only() IS
  'Rechaza todo UPDATE, DELETE y TRUNCATE sobre pagaya.auditoria, incluido el del dueño del esquema y el de un superusuario, que esquivan la row level security y los permisos.';

CREATE TRIGGER auditoria_es_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON pagaya.auditoria
  FOR EACH STATEMENT EXECUTE FUNCTION pagaya.auditoria_es_append_only();
