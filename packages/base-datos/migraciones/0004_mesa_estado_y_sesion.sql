-- 0004 — Mesa y sesión de mesa con sus estados (F1-10a).
--
-- Qué lo exige: PRD-001 §12 ("Mesa: número, zona, QR, estado") y §15 (el ciclo
-- `libre → ocupada → pago_pendiente → pagada → libre`, y el de la comanda,
-- `abierta → cobrando → pagada`, con la rama `anulada`); PRD-002 §3.4 (la
-- sesión de mesa "vincula mesa, comanda y clientes sentados. Se abre al primer
-- ingreso […] y se cierra con el pago y la liberación"); y PRD-005 §6, que
-- refuerza sobre la misma sesión la invariante que esta migración escribe:
-- "como máximo una comanda abierta por mesa".
--
-- La decisión, con sus alternativas descartadas, está en
-- docs/arquitectura.md §13 (AT-20).
--
-- **Lo que esta migración NO crea, y por qué** está en docs/arquitectura.md
-- §13.2: el PIN (F1-12a), la máquina de estados (F1-10b), los participantes
-- (F1-41a), `comanda.version` (F1-70a, AT-3) y `abierta_por` /
-- `origen_primer_pedido` (F1-80b, PRD-005 §6). Esta migración escribe el
-- esquema mínimo que el índice único de más abajo necesita para existir, nada
-- que otra tarea tenga que decidir.

-- ---------------------------------------------------------------------------
-- El estado de la mesa. PRD-001 §12 lo define con cinco valores; §15 dibuja el
-- ciclo normal de cuatro y deja `bloqueada` fuera del diagrama porque no es un
-- paso del ciclo sino una excepción operativa (ver docs/arquitectura.md §13.2:
-- quién la usa y cuándo es F1-10b, no esta migración).
--
-- `libre` es el valor por defecto: toda mesa creada por el cargador (F1-06)
-- nace libre, y la migración 0003 ya dejó dicho que escribir este estado desde
-- el cargador sería liberar una mesa ocupada en cada corrida.
-- ---------------------------------------------------------------------------

ALTER TABLE pagaya.mesa
  ADD COLUMN estado text NOT NULL DEFAULT 'libre'
    CONSTRAINT mesa_estado_valido
      CHECK (estado IN ('libre', 'ocupada', 'pago_pendiente', 'pagada', 'bloqueada'));

COMMENT ON COLUMN pagaya.mesa.estado IS
  'Ciclo de PRD-001 §12 y §15. Lo mueve la máquina de estados de F1-10b; el cargador (F1-06) nunca lo escribe.';

-- ---------------------------------------------------------------------------
-- La comanda, mínima. Solo lo que el índice único de abajo exige: identidad,
-- de qué mesa es y su estado. Todo lo demás —ítems, participantes, total,
-- `version`, `abierta_por`— es de la tarea que lo prueba (docs/arquitectura.md
-- §13.2), igual que 0003 dejó fuera el esquema completo de §12 por el mismo
-- motivo.
--
-- El índice único parcial es la invariante en sí, no una ayuda para
-- encontrarla rápido: `UNIQUE (local_id, mesa_id)` a secas rechazaría la
-- comanda `pagada` de ayer en cuanto se abriera una nueva hoy. Filtrado a
-- `estado = 'abierta'` es, letra por letra, "como máximo una comanda abierta
-- por mesa" (PRD-005 §6) — y como lo revisa PostgreSQL, dos transacciones que
-- intentan abrir la segunda comanda de la misma mesa a la vez no pueden las
-- dos ganar.
-- ---------------------------------------------------------------------------

CREATE TABLE pagaya.comanda (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id       uuid        NOT NULL REFERENCES pagaya.local(id) ON DELETE CASCADE,
  mesa_id        uuid        NOT NULL,
  estado         text        NOT NULL DEFAULT 'abierta'
                             CHECK (estado IN ('abierta', 'cobrando', 'pagada', 'anulada')),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT comanda_del_local UNIQUE (local_id, id),
  CONSTRAINT comanda_mesa_del_mismo_local
    FOREIGN KEY (local_id, mesa_id) REFERENCES pagaya.mesa (local_id, id)
);

COMMENT ON TABLE pagaya.comanda IS
  'La cuenta de mesa (PRD-001 §12), mínima: solo lo que F1-10a necesita para la invariante de abajo. Ítems, participantes, total y version (AT-3) los agrega la tarea que los prueba.';

CREATE UNIQUE INDEX comanda_una_abierta_por_mesa ON pagaya.comanda (local_id, mesa_id)
  WHERE estado = 'abierta';

COMMENT ON INDEX pagaya.comanda_una_abierta_por_mesa IS
  'La invariante de PRD-002 §3.4 y PRD-005 §6: como máximo una comanda abierta por mesa. Parcial, porque una comanda pagada o anulada no compite con la siguiente.';

SELECT pagaya.activar_aislamiento('pagaya.comanda');

-- ---------------------------------------------------------------------------
-- La sesión de mesa. PRD-002 §3.4: "vincula mesa, comanda y clientes
-- sentados. Se abre al primer ingreso (por PIN o por el mesero) y se cierra
-- con el pago y la liberación."
--
-- Lo que esta tabla escribe es la mitad de esa frase: la apertura y el cierre
-- que vinculan mesa y comanda. El PIN vigente, los intentos fallidos y los
-- clientes sentados son datos de otras tareas (F1-12a, F1-41a) que van a
-- referenciar esta tabla, no columnas que le falten a ésta.
--
-- `comanda_id` no es nulo: una sesión no existe sin la comanda que abre con
-- ella, en la misma transacción. Y es de a una por comanda —`UNIQUE
-- (local_id, comanda_id)`—, porque en la Fase 1 una comanda tiene exactamente
-- una sesión que la vincula a su mesa; una comanda con dos sesiones sería dos
-- historias distintas de quién abrió y cerró lo mismo.
--
-- El `CHECK` que empareja `estado` y `cerrada_en` es la misma regla que ya usa
-- `usuario_local_segun_rol` en la migración 0003: una equivalencia, para que no
-- exista ni una sesión cerrada sin su instante de cierre ni una abierta con
-- uno puesto.
-- ---------------------------------------------------------------------------

CREATE TABLE pagaya.sesion_mesa (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id   uuid        NOT NULL REFERENCES pagaya.local(id) ON DELETE CASCADE,
  mesa_id    uuid        NOT NULL,
  comanda_id uuid        NOT NULL,
  estado     text        NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
  abierta_en timestamptz NOT NULL DEFAULT now(),
  cerrada_en timestamptz,

  CONSTRAINT sesion_mesa_cierre_segun_estado CHECK ((estado = 'abierta') = (cerrada_en IS NULL)),
  CONSTRAINT sesion_mesa_una_por_comanda UNIQUE (local_id, comanda_id),
  CONSTRAINT sesion_mesa_del_local UNIQUE (local_id, id),
  CONSTRAINT sesion_mesa_mesa_del_mismo_local
    FOREIGN KEY (local_id, mesa_id) REFERENCES pagaya.mesa (local_id, id),
  CONSTRAINT sesion_mesa_comanda_del_mismo_local
    FOREIGN KEY (local_id, comanda_id) REFERENCES pagaya.comanda (local_id, id)
);

COMMENT ON TABLE pagaya.sesion_mesa IS
  'Vincula mesa, comanda y apertura/cierre (PRD-002 §3.4). El PIN (F1-12a) y los clientes sentados (F1-41a) la referencian; no son columnas de esta migración.';

SELECT pagaya.activar_aislamiento('pagaya.sesion_mesa');
