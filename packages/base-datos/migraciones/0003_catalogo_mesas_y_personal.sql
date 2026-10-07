-- 0003 — El catálogo, las mesas y el personal (F1-06).
--
-- Qué lo exige: PRD-001 §12 (el modelo de datos: Usuario, Mesa, Asignación de
-- mesas, Producto) y, por ahora en lugar del panel de administración de la
-- Fase 4, F1-05: lo que el archivo de carga escribe son exactamente estas
-- tablas —categorías, productos con precio y variantes (RF-A-01), mesas y
-- zonas con su QR (RF-A-02), usuarios del local (RF-A-03) y asignaciones por
-- turno (RF-A-04)—. De acá leen F1-30 (la carta del cliente, RF-C-03) y F1-10
-- y F1-60 (la mesa y las mesas del mesero, RF-M-01).
--
-- La decisión, con sus alternativas descartadas, está en
-- docs/arquitectura.md §12 (AT-18 y AT-19).
--
-- **Lo que esta migración NO crea, y por qué.** La sesión de mesa, el PIN, la
-- comanda, sus ítems y participantes, el pago, la visita y el feedback no están
-- acá: son F1-10 en adelante y la Fase 2 (PRD-001 §18). Una tabla la crea la
-- tarea que la usa; crearlas desde acá sería decidir su esquema desde otra
-- tarea, que es el mismo motivo por el que 0002 no creó ninguna de negocio.
-- Tampoco está la tabla de sesiones, que F1-03 dejó pedida en §9.4 contra el
-- puerto `RepositorioSesiones`: no la escribe el cargador y no la lee F1-30.
--
-- **Qué revisa la base y qué revisa el archivo.** Las dos cosas no son la
-- misma y la frontera es deliberada (§12, AT-18): acá viven las restricciones
-- que ningún camino de escritura puede violar —identidad, dinero, referencias
-- entre tablas y unicidad de las claves naturales—; en
-- packages/carga-inicial/src/validacion.ts viven las del contrato del archivo
-- —rangos, la forma canónica de la zona horaria, el teléfono chileno—, que es
-- donde el mensaje de error le sirve a quien edita el archivo. Repetirlas acá
-- no las haría más ciertas y haría que cada cambio de la carta pidiera una
-- migración.

-- ---------------------------------------------------------------------------
-- El local, dos columnas más.
--
-- `slug` es la clave natural con la que el archivo de carga nombra al local
-- (supuesto S-16): sin ella, la segunda corrida del cargador no puede saber
-- cuál de los locales es el del archivo, y la idempotencia que F1-05 promete no
-- se puede calcular. Ningún PRD la nombra, porque ningún PRD habla del archivo
-- de carga, y por eso es **opcional**: es un dato del archivo, no del local. La
-- identidad del local es su `id` (migración 0002); un local que nadie nombró
-- desde un archivo no tiene por qué tener un nombre corto inventado.
--
-- `moneda` es Chile escrito en el esquema (PRD-002 §1, supuesto S-17). El
-- contrato del archivo ya la declara "para que el día que haya otro mercado
-- falle acá"; una columna con su CHECK hace que también falle cuando el que
-- escriba no sea el archivo —el panel de RF-A-09, por ejemplo—. Y es la regla
-- de AT-14 aplicada: lo que sostiene una invariante de dinero es columna con su
-- restricción, no una clave de `configuracion`.

ALTER TABLE pagaya.local
  ADD COLUMN slug text
    CONSTRAINT local_slug_forma
      CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 2 AND 60)
    CONSTRAINT local_slug_unico UNIQUE,
  ADD COLUMN moneda text NOT NULL DEFAULT 'CLP'
    CONSTRAINT local_moneda_clp CHECK (moneda = 'CLP');

COMMENT ON COLUMN pagaya.local.slug IS
  'Clave natural del local: con ella el archivo de carga (F1-05) lo nombra entre corridas. Nulo si el local no vino de un archivo. Supuesto S-16 de docs/arquitectura.md.';
COMMENT ON COLUMN pagaya.local.moneda IS
  'El MVP opera en Chile (PRD-002 §1): la única moneda es CLP, y los precios son enteros porque el peso no tiene decimales. Supuesto S-17.';

-- ---------------------------------------------------------------------------
-- El usuario. Es la excepción al local_id obligatorio, y estaba escrita antes
-- de que existiera esta tabla: docs/arquitectura.md §9.3 (F1-03) y el
-- comentario de `pagaya.tabla_sin_local` en la migración 0002.
--
-- El argumento es de producto, no de comodidad: PRD-001 §12 le da el "local al
-- que pertenece" solo a meseros y administradores, y PRD-004 §3 hace de una
-- cuenta de cliente una persona —una por número de teléfono—, que no pertenece
-- a ningún local. Por local es lo que cuelga de ella: la visita, el nivel, el
-- participante de comanda y la asignación de mesas.
--
-- De ahí las tres cosas que esta tabla hace distinto de todas las demás:
--
--   1. `local_id` es NULO para el cliente y obligatorio para el personal, y eso
--      no es una convención sino un CHECK.
--   2. `pagaya.activar_aislamiento` **no le sirve**: exige `local_id uuid NOT
--      NULL`. Su política se escribe a mano acá abajo.
--   3. Deja su fila en `pagaya.tabla_sin_local` con el motivo, para que la
--      guardia `tablas_sin_aislamiento()` siga en verde por una decisión
--      escrita y no por un descuido.
--
-- `telefono` es la identidad: PRD-004 §8 lo pide único y PRD-004 §3 lo dice
-- entero —"una cuenta por número de teléfono. Cierra el farmeo de niveles con
-- cuentas múltiples"—. Único **global**, no por local: una persona es una
-- persona en todo el sistema. El email no está: PRD-004 §3 lo deja "opcional y
-- posterior, ofrecido desde el perfil, nunca en el registro", y una columna que
-- nadie llena en toda la Fase 1 llega al día en que se usa llena de nulos y de
-- suposiciones (AT-14).
--
-- `codigo` es el código del personal dentro del local —la clave natural con la
-- que el archivo de carga nombra a cada mesero (RF-A-03, supuesto S-18)—. Un
-- cliente no tiene código, igual que no tiene local.
-- ---------------------------------------------------------------------------

CREATE TABLE pagaya.usuario (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nulo para el cliente, obligatorio para el personal: ver el CHECK de abajo.
  local_id       uuid        REFERENCES pagaya.local(id) ON DELETE CASCADE,
  rol            text        NOT NULL CHECK (rol IN ('cliente', 'mesero', 'admin')),
  nombre_pila    text        NOT NULL CHECK (length(btrim(nombre_pila)) BETWEEN 1 AND 60),
  -- E.164. El archivo de carga es más estricto (móvil chileno, +569…) porque es
  -- su contrato, no el del esquema.
  telefono       text        NOT NULL CHECK (telefono ~ '^\+[1-9][0-9]{7,14}$'),
  codigo         text        CHECK (codigo IS NULL OR codigo ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  activo         boolean     NOT NULL DEFAULT true,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),

  -- docs/arquitectura.md §9.3, literal: nulo para el cliente, obligatorio para
  -- el personal. Escrito como equivalencia y no como dos CHECK sueltos, para
  -- que no exista ni un cliente con local ni un mesero sin él.
  CONSTRAINT usuario_local_segun_rol CHECK ((rol = 'cliente') = (local_id IS NULL)),
  CONSTRAINT usuario_codigo_segun_rol CHECK ((rol = 'cliente') = (codigo IS NULL)),

  CONSTRAINT usuario_telefono_unico UNIQUE (telefono),
  CONSTRAINT usuario_codigo_unico UNIQUE (local_id, codigo),
  -- Lo que hace posible que una asignación exija "personal de este local": una
  -- clave que incluye el local, para referenciarla desde la tabla de al lado.
  CONSTRAINT usuario_del_local UNIQUE (local_id, id)
);

COMMENT ON TABLE pagaya.usuario IS
  'Las personas: cliente, mesero y administrador (PRD-001 §12). Es la única tabla de este esquema cuyo local_id es nulo a propósito —el del cliente—, por docs/arquitectura.md §9.3.';
COMMENT ON COLUMN pagaya.usuario.local_id IS
  'El local al que pertenece, solo para meseros y administradores (PRD-001 §12). Nulo en el cliente: una cuenta de cliente es una persona (PRD-004 §3) y una persona no pertenece a un local.';
COMMENT ON COLUMN pagaya.usuario.telefono IS
  'Identidad del usuario. Único en todo el sistema: una cuenta por número de teléfono (PRD-004 §3 y §8).';
COMMENT ON COLUMN pagaya.usuario.codigo IS
  'Código del personal dentro del local (RF-A-03) y clave natural del mesero en el archivo de carga (F1-05). Nulo en el cliente. Supuesto S-18.';

ALTER TABLE pagaya.usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagaya.usuario FORCE ROW LEVEL SECURITY;

-- La política escrita a mano que §10.1 dejó pedida, con sus tres ramas:
--
--   entre_locales()        el cruce explícito y con motivo: el alta de un local
--                          y la carga inicial (F1-05).
--   local_id IS NULL       el cliente. **No se le compara el local**, porque no
--                          tiene uno: lo que lo ata a un local es estar sentado
--                          en una comanda de ese local, que es un hecho más
--                          fuerte que un campo (§9.2).
--   local_id = local_actual()  el personal, el de su local y nadie más.
--
-- Lo que esta política **no** responde es quién, dentro del local, tiene
-- derecho a leer o escribir esta fila: eso son roles y sesiones (F1-03), y que
-- el mesero vea solo el nombre de pila del cliente y nunca sus datos de
-- contacto es F1-64 (PRD-001 §14). La row level security responde "de qué local
-- es esta fila", no "quién es esta persona"; confundirlas es cómo se termina con
-- una autorización que vive en dos lugares y difiere en uno.
CREATE POLICY aislamiento_de_identidad ON pagaya.usuario
  FOR ALL TO pagaya_app
  USING (pagaya.entre_locales() OR local_id IS NULL OR local_id = pagaya.local_actual())
  WITH CHECK (pagaya.entre_locales() OR local_id IS NULL OR local_id = pagaya.local_actual());

GRANT SELECT, INSERT, UPDATE, DELETE ON pagaya.usuario TO pagaya_app;

-- La rama `local_id IS NULL` de la política de arriba deja una puerta que el
-- esquema sí puede cerrar: una transacción fijada en un local ve las filas de
-- cliente —tiene que verlas, es cómo se autentica a quien no pertenece a ningún
-- local— y por lo tanto podría convertir un cliente en mesero suyo con un
-- UPDATE. Eso no es un requisito de nadie y es un ascenso de privilegio: el
-- mesero de un local ve las comandas de sus mesas (S-9).
--
-- docs/arquitectura.md §9.4 ya decidió lo que hace falta para prohibirlo: "un
-- titular tiene un rol", y si el piloto encuentra el caso de la persona que es
-- mesero y cliente a la vez, "se cierra con un PRD, no con un campo". Así que
-- el lado cliente y el lado personal no se cruzan, y cambiar de mesero a
-- administrador —que es lo que RF-A-03 pide poder hacer— sigue permitido.
CREATE FUNCTION pagaya.identidad_no_cruza_de_lado() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  IF (OLD.rol = 'cliente') <> (NEW.rol = 'cliente') THEN
    RAISE EXCEPTION
      'usuario %: un cliente no se convierte en personal del local ni al revés (docs/arquitectura.md §9.4); un rol nuevo es una cuenta nueva',
      OLD.id;
  END IF;
  RETURN NEW;
END
$$;

COMMENT ON FUNCTION pagaya.identidad_no_cruza_de_lado() IS
  'Impide que un UPDATE convierta un cliente en personal del local o al revés (PRD-001 §12, docs/arquitectura.md §9.4). Cambiar entre mesero y administrador sí se permite (RF-A-03).';

CREATE TRIGGER identidad_no_cruza_de_lado
  BEFORE UPDATE OF rol, local_id ON pagaya.usuario
  FOR EACH ROW EXECUTE FUNCTION pagaya.identidad_no_cruza_de_lado();

-- La excepción, escrita donde se revisa. Sin esta fila,
-- `pagaya.tablas_sin_aislamiento()` reportaría `usuario` y `make verify`
-- fallaría, que es exactamente lo que tiene que pasar con una excepción que
-- nadie firmó.
INSERT INTO pagaya.tabla_sin_local (tabla, motivo) VALUES
  ('usuario',
   'Identidad: una cuenta de cliente es una persona (PRD-004 §3) y una persona no pertenece a un local; el "local al que pertenece" es solo del personal (PRD-001 §12). local_id es nulo para el cliente, así que activar_aislamiento no aplica: su política está escrita a mano en la migración 0003 (docs/arquitectura.md §9.3).');

-- ---------------------------------------------------------------------------
-- La zona. RF-A-02: "gestionar mesas y zonas".
--
-- De acá en adelante todas las tablas son de negocio y por lo tanto todas
-- terminan en `pagaya.activar_aislamiento`, que es lo que les enciende la row
-- level security, la fuerza, les crea la política y les da los permisos
-- (migración 0002).
--
-- Dos cosas se repiten en todas y conviene leerlas una sola vez:
--
--   `UNIQUE (local_id, <clave natural>)`  la clave natural es la identidad de
--       la fila para el archivo de carga (F1-05) y para el local: el slug de la
--       zona, el sku del producto, el número de la mesa. Es única **dentro del
--       local**, no entre locales.
--   `UNIQUE (local_id, id)`  no es redundante con la clave primaria: es lo que
--       permite que la tabla que la referencia use una clave ajena compuesta
--       `(local_id, <padre>_id)` y, con ella, que una fila **no pueda apuntar a
--       un padre de otro local**. La row level security no alcanza para eso:
--       `entreLocales` la apaga, y es justo el camino por el que entra la carga.
-- ---------------------------------------------------------------------------

CREATE TABLE pagaya.zona (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id       uuid        NOT NULL REFERENCES pagaya.local(id) ON DELETE CASCADE,
  slug           text        NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nombre         text        NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 80),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT zona_slug_unico UNIQUE (local_id, slug),
  CONSTRAINT zona_del_local UNIQUE (local_id, id)
);

COMMENT ON TABLE pagaya.zona IS
  'Zonas del salón: salón, terraza, barra (RF-A-02). La mesa pertenece a una.';

SELECT pagaya.activar_aislamiento('pagaya.zona');

-- ---------------------------------------------------------------------------
-- La mesa. PRD-001 §12: "número, zona, QR, estado".
--
-- El **estado** (`libre | ocupada | pago_pendiente | pagada | bloqueada`,
-- PRD-001 §15) no está acá y no es un olvido: es operación, lo maneja F1-10 y
-- el cargador no lo escribe —si lo escribiera, una segunda corrida liberaría
-- una mesa ocupada (docs/arquitectura.md §11.3)—. La columna la agrega la
-- migración de F1-10, que es la tarea que tiene la máquina de estados.
--
-- El **QR** se guarda como token y nada más: la URL se arma al imprimir (F1-11)
-- porque el host depende del ambiente (§8.4) y el dato guardado no.
--
-- `qr_token` es único **en todo el sistema**, no por local (supuesto S-19): lo
-- que el cliente escanea tiene que resolver a una sola mesa de un solo local
-- (RF-C-01, F1-11). El token identifica y no autentica (PRD-003 §3.1): el
-- control de "estoy sentado acá" es el PIN (PRD-002 §3.1, F1-12).
-- ---------------------------------------------------------------------------

CREATE TABLE pagaya.mesa (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id       uuid        NOT NULL REFERENCES pagaya.local(id) ON DELETE CASCADE,
  zona_id        uuid        NOT NULL,
  -- "B1" en la barra, "T3" en la terraza: no toda mesa es un número.
  numero         text        NOT NULL CHECK (length(btrim(numero)) BETWEEN 1 AND 16),
  capacidad      integer     NOT NULL CHECK (capacidad > 0),
  qr_token       text        NOT NULL CHECK (length(qr_token) BETWEEN 10 AND 64),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT mesa_numero_unico UNIQUE (local_id, numero),
  CONSTRAINT mesa_qr_token_unico UNIQUE (qr_token),
  CONSTRAINT mesa_del_local UNIQUE (local_id, id),
  CONSTRAINT mesa_zona_del_mismo_local
    FOREIGN KEY (local_id, zona_id) REFERENCES pagaya.zona (local_id, id)
);

COMMENT ON TABLE pagaya.mesa IS
  'Las mesas del local (RF-A-02). El estado de PRD-001 §15 lo agrega F1-10: es operación, no configuración.';
COMMENT ON COLUMN pagaya.mesa.qr_token IS
  'Lo que lleva el QR impreso. Único en todo el sistema: tiene que resolver a una sola mesa (RF-C-01, F1-11). Identifica y no autentica (PRD-003 §3.1).';

SELECT pagaya.activar_aislamiento('pagaya.mesa');

-- ---------------------------------------------------------------------------
-- La carta: categoría, producto y variante. RF-A-01 y RF-C-03.
--
-- `orden` no lleva restricción de unicidad a propósito, aunque el archivo de
-- carga sí exija que los `orden` de las categorías no se repitan: reordenar dos
-- categorías es intercambiar sus posiciones, y un UNIQUE no diferido rechazaría
-- el estado intermedio de esa misma transacción. La unicidad vive donde se puede
-- revisar sin romper el reordenamiento, que es el validador del archivo.
-- ---------------------------------------------------------------------------

CREATE TABLE pagaya.categoria (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id       uuid        NOT NULL REFERENCES pagaya.local(id) ON DELETE CASCADE,
  slug           text        NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nombre         text        NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 80),
  orden          integer     NOT NULL CHECK (orden > 0),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT categoria_slug_unico UNIQUE (local_id, slug),
  CONSTRAINT categoria_del_local UNIQUE (local_id, id)
);

COMMENT ON TABLE pagaya.categoria IS
  'Categorías de la carta (RF-A-01). La carta se muestra por categorías (RF-C-03).';

SELECT pagaya.activar_aislamiento('pagaya.categoria');

-- `precio` es `integer` y no `numeric`, y es una decisión de dinero: el peso
-- chileno no tiene decimales (PRD-002 §1), así que un precio con parte decimal
-- no existe y no hay por qué dejar que se guarde. De paso, `integer` llega a
-- TypeScript como número y no como texto, que es lo que `numeric` haría.
CREATE TABLE pagaya.producto (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id       uuid        NOT NULL REFERENCES pagaya.local(id) ON DELETE CASCADE,
  categoria_id   uuid        NOT NULL,
  sku            text        NOT NULL CHECK (sku ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nombre         text        NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 120),
  descripcion    text        NOT NULL,
  precio         integer     NOT NULL CHECK (precio >= 0),
  -- RF-M-12: el mesero marca un producto como agotado durante el servicio. El
  -- cargador la escribe solo al crear, por eso mismo (docs/arquitectura.md §11.2).
  disponible     boolean     NOT NULL DEFAULT true,
  foto           text,
  orden          integer     NOT NULL CHECK (orden > 0),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT producto_sku_unico UNIQUE (local_id, sku),
  CONSTRAINT producto_del_local UNIQUE (local_id, id),
  CONSTRAINT producto_categoria_del_mismo_local
    FOREIGN KEY (local_id, categoria_id) REFERENCES pagaya.categoria (local_id, id)
);

COMMENT ON TABLE pagaya.producto IS
  'Productos de la carta (RF-A-01, RF-C-03). Un ítem de comanda lo referencia y guarda el precio del momento (PRD-001 §12): por eso el cargador no borra productos.';
COMMENT ON COLUMN pagaya.producto.precio IS
  'Pesos chilenos, entero: el CLP no tiene decimales (PRD-002 §1).';
COMMENT ON COLUMN pagaya.producto.disponible IS
  'Disponibilidad de hoy, no configuración: la mueve el mesero (RF-M-12). El cargador la escribe solo al crear.';

CREATE INDEX producto_de_la_carta ON pagaya.producto (local_id, categoria_id, orden);

SELECT pagaya.activar_aislamiento('pagaya.producto');

-- `precio_delta` puede ser negativo ("sin huevo, −900") y no puede dejar el
-- precio del producto bajo cero. Esa segunda mitad mira dos filas, así que no
-- es un CHECK: la revisa el validador del archivo, donde está el precio al que
-- se le resta.
CREATE TABLE pagaya.variante (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id       uuid        NOT NULL REFERENCES pagaya.local(id) ON DELETE CASCADE,
  producto_id    uuid        NOT NULL,
  slug           text        NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nombre         text        NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 80),
  precio_delta   integer     NOT NULL,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT variante_slug_unico UNIQUE (local_id, producto_id, slug),
  CONSTRAINT variante_producto_del_mismo_local
    FOREIGN KEY (local_id, producto_id) REFERENCES pagaya.producto (local_id, id)
      ON DELETE CASCADE
);

COMMENT ON TABLE pagaya.variante IS
  'Variantes y opciones del producto (RF-A-01, RF-C-04): "individual / para compartir", "sin huevo". precio_delta es la diferencia en pesos sobre el precio del producto.';

SELECT pagaya.activar_aislamiento('pagaya.variante');

-- ---------------------------------------------------------------------------
-- El turno y la asignación. RF-A-04: "asignar mesas a meseros por turno y
-- reasignar en caliente".
--
-- `inicio` y `fin` son `time` del reloj del local, no instantes: un turno es
-- "19:00 a 01:00" todos los días. `fin` menor que `inicio` significa que cruza
-- medianoche, que es el caso normal de la cena, así que no hay CHECK de orden;
-- lo único que no puede ser es que empiece y termine a la misma hora.
--
-- PRD-001 §13 pide "zona horaria y turnos por local"; la zona horaria es
-- `local.zona_horaria` (migración 0002) y el día que esas horas tengan que
-- convertirse a un instante se usa `pagaya.fecha_local` (AT-15), no `::date`.
-- ---------------------------------------------------------------------------

CREATE TABLE pagaya.turno (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id       uuid        NOT NULL REFERENCES pagaya.local(id) ON DELETE CASCADE,
  slug           text        NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nombre         text        NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 80),
  inicio         time        NOT NULL,
  fin            time        NOT NULL,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT turno_no_dura_cero CHECK (inicio <> fin),
  CONSTRAINT turno_slug_unico UNIQUE (local_id, slug),
  CONSTRAINT turno_del_local UNIQUE (local_id, id)
);

COMMENT ON TABLE pagaya.turno IS
  'Turnos del local (PRD-001 §13). Las mesas se asignan a meseros por turno (RF-A-04). fin < inicio significa que el turno cruza medianoche.';

SELECT pagaya.activar_aislamiento('pagaya.turno');

-- La asignación es mesero ↔ mesa ↔ turno (PRD-001 §12), ya desarmada a una fila
-- por mesa.
--
-- `UNIQUE (local_id, turno_id, mesa_id)` es el **supuesto S-13 escrito en el
-- esquema**: una mesa tiene a lo más un mesero por turno. PRD-001 §9 manda cada
-- aviso "al mesero de la mesa", en singular, y escala al administrador cuando
-- *no hay* asignación (F1-73); dos meseros para la misma mesa duplicarían cada
-- aviso de RF-M-02 y RF-M-03 y dejarían sin definir quién atiende. Hasta ahora
-- esa regla solo la revisaba el validador del archivo; acá deja de poder
-- violarse por ningún camino.
--
-- La clave ajena compuesta a `usuario (local_id, id)` dice más de lo que
-- parece: como `usuario.local_id` solo es no nulo en el personal (§9.3), exigir
-- que coincida con el local de la asignación equivale a exigir que el asignado
-- sea **personal de este local**. Que además sea mesero y no administrador lo
-- revisa el archivo; ver §12 (AT-18) por qué no se fuerza acá.
CREATE TABLE pagaya.asignacion (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id       uuid        NOT NULL REFERENCES pagaya.local(id) ON DELETE CASCADE,
  turno_id       uuid        NOT NULL,
  mesa_id        uuid        NOT NULL,
  mesero_id      uuid        NOT NULL,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT asignacion_una_mesa_un_mesero_por_turno UNIQUE (local_id, turno_id, mesa_id),
  CONSTRAINT asignacion_turno_del_mismo_local
    FOREIGN KEY (local_id, turno_id) REFERENCES pagaya.turno (local_id, id) ON DELETE CASCADE,
  CONSTRAINT asignacion_mesa_del_mismo_local
    FOREIGN KEY (local_id, mesa_id) REFERENCES pagaya.mesa (local_id, id) ON DELETE CASCADE,
  CONSTRAINT asignacion_mesero_del_mismo_local
    FOREIGN KEY (local_id, mesero_id) REFERENCES pagaya.usuario (local_id, id)
);

COMMENT ON TABLE pagaya.asignacion IS
  'Mesero ↔ mesa ↔ turno (PRD-001 §12, RF-A-04). El UNIQUE (local_id, turno_id, mesa_id) es el supuesto S-13 de docs/arquitectura.md: una mesa tiene a lo más un mesero por turno.';

-- El índice que la app del mesero necesita: "mis mesas en este turno"
-- (RF-M-01, F1-60). Encabezado por local_id, como todo índice de este esquema
-- (docs/arquitectura.md §10.1, consecuencias).
CREATE INDEX asignacion_por_mesero ON pagaya.asignacion (local_id, mesero_id, turno_id);

SELECT pagaya.activar_aislamiento('pagaya.asignacion');
