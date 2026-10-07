/**
 * El repositorio del cargador sobre PostgreSQL (F1-06).
 *
 * Es el adaptador del puerto `RepositorioCarga` que AT-17 dejó declarado y que
 * F1-05 no pudo escribir: lo que faltaba no era la capa de acceso —F1-02 ya
 * entregó `pagaya.local`, la row level security forzada y las tres entradas—
 * sino las tablas de la carta, las zonas, las mesas, el personal, los turnos y
 * las asignaciones, que nacen con la migración 0003.
 *
 * Tres decisiones gobiernan este archivo, y las tres están en
 * docs/arquitectura.md §12 (AT-19):
 *
 * 1. **Entra por `entreLocales`, con motivo escrito.** Dar de alta un local no
 *    puede filtrar por un `local_id` que todavía no existe, y el resto de la
 *    carga escribe sobre un local que recién se creó en la misma corrida
 *    (AT-13, §10.2). Es el único lugar del sistema, junto con el alta de un
 *    local, que legítimamente cruza.
 * 2. **Todo el plan va en una transacción.** Un archivo cargado a medias deja
 *    mesas sin zona y asignaciones sin mesero, y la corrida siguiente ya no
 *    puede distinguir eso de un archivo editado a mano (AT-17). Acá eso es
 *    gratis: la capa de acceso no tiene consulta fuera de una transacción.
 * 3. **La clave natural es del archivo; el id es de la base.** El archivo no
 *    inventa UUIDs (AT-17): este adaptador traduce `sku`, `numero`, `slug` y
 *    `codigo` a los identificadores que la base generó, y las referencias entre
 *    entidades se resuelven con el orden del plan (`ORDEN_ENTIDADES`), que pone
 *    la zona antes que la mesa y la categoría antes que su producto.
 *
 * Lo que este archivo **no** hace es decidir qué escribir: eso es `plan.ts`, y
 * es puro. Acá no hay ninguna regla de negocio, y es a propósito: si una
 * apareciera, se podría esquivar corriendo el SQL a mano.
 */
import type { Acceso, Transaccion } from "@pagaya/base-datos";
import { ErrorPagaya } from "@pagaya/nucleo";

import { ORDEN_ENTIDADES, type Entidad, type Valor } from "./contrato.ts";
import type { Cambio, Fila, FilaIdentificada, RepositorioCarga } from "./plan.ts";

/** Una parte de la clave natural: o es una columna de texto, o es una referencia. */
type ParteClave = {
  readonly columna: string;
  /** Si está, el valor es la clave natural de esa entidad y hay que resolverla a su id. */
  readonly refiere?: Entidad;
};

type Descriptor = {
  readonly tabla: string;
  /**
   * Las partes de la clave natural, en el orden en que `plan.ts` la arma
   * separándolas con "/": `${sku}/${slug}` para la variante,
   * `${turno}/${mesa}` para la asignación.
   */
  readonly clave: readonly ParteClave[];
  /** Campo del plan → columna, con la referencia a resolver si la hay. */
  readonly campos: Readonly<Record<string, ParteClave>>;
  /** Columnas que la base necesita y el archivo no declara porque las da la entidad. */
  readonly fijas?: Readonly<Record<string, Valor>>;
  /**
   * La lectura. Devuelve una columna `clave` y una columna por campo, con los
   * mismos nombres y tipos que `filasDeseadas`: si no coincidieran, la segunda
   * corrida vería cambios donde no hay ninguno. `$1` es el id del local.
   */
  readonly lectura: string;
};

/**
 * El mapa entre el contrato del archivo y el esquema. Es la única parte de este
 * adaptador que hay que tocar cuando una entidad gane un campo, y está escrito
 * una sola vez para que la lectura y la escritura no puedan discrepar sin que
 * la prueba de idempotencia lo note.
 */
const DESCRIPTORES: Readonly<Record<Exclude<Entidad, "local">, Descriptor>> = {
  zona: {
    tabla: "pagaya.zona",
    clave: [{ columna: "slug" }],
    campos: { nombre: { columna: "nombre" } },
    lectura: `SELECT slug AS clave, nombre FROM pagaya.zona WHERE local_id = $1`,
  },

  categoria: {
    tabla: "pagaya.categoria",
    clave: [{ columna: "slug" }],
    campos: { nombre: { columna: "nombre" }, orden: { columna: "orden" } },
    lectura: `SELECT slug AS clave, nombre, orden FROM pagaya.categoria WHERE local_id = $1`,
  },

  producto: {
    tabla: "pagaya.producto",
    clave: [{ columna: "sku" }],
    campos: {
      categoria: { columna: "categoria_id", refiere: "categoria" },
      nombre: { columna: "nombre" },
      descripcion: { columna: "descripcion" },
      precio: { columna: "precio" },
      foto: { columna: "foto" },
      orden: { columna: "orden" },
      disponible: { columna: "disponible" },
    },
    lectura: `
      SELECT p.sku AS clave, c.slug AS categoria, p.nombre, p.descripcion,
             p.precio, p.foto, p.orden, p.disponible
        FROM pagaya.producto AS p
        JOIN pagaya.categoria AS c ON c.local_id = p.local_id AND c.id = p.categoria_id
       WHERE p.local_id = $1`,
  },

  variante: {
    tabla: "pagaya.variante",
    clave: [{ columna: "producto_id", refiere: "producto" }, { columna: "slug" }],
    campos: {
      producto: { columna: "producto_id", refiere: "producto" },
      nombre: { columna: "nombre" },
      precio_delta: { columna: "precio_delta" },
    },
    lectura: `
      SELECT p.sku || '/' || v.slug AS clave, p.sku AS producto, v.nombre, v.precio_delta
        FROM pagaya.variante AS v
        JOIN pagaya.producto AS p ON p.local_id = v.local_id AND p.id = v.producto_id
       WHERE v.local_id = $1`,
  },

  mesa: {
    tabla: "pagaya.mesa",
    clave: [{ columna: "numero" }],
    campos: {
      zona: { columna: "zona_id", refiere: "zona" },
      capacidad: { columna: "capacidad" },
      qr_token: { columna: "qr_token" },
    },
    lectura: `
      SELECT m.numero AS clave, z.slug AS zona, m.capacidad, m.qr_token
        FROM pagaya.mesa AS m
        JOIN pagaya.zona AS z ON z.local_id = m.local_id AND z.id = m.zona_id
       WHERE m.local_id = $1`,
  },

  /**
   * El mesero es un `usuario` con `rol = 'mesero'` (PRD-001 §12): no hay una
   * tabla de meseros. El rol es columna fija de la entidad, y `codigo` —su
   * clave natural— es lo que la migración 0003 exige en todo el personal.
   */
  mesero: {
    tabla: "pagaya.usuario",
    clave: [{ columna: "codigo" }],
    campos: { nombre_pila: { columna: "nombre_pila" }, telefono: { columna: "telefono" } },
    fijas: { rol: "mesero" },
    lectura: `
      SELECT codigo AS clave, nombre_pila, telefono
        FROM pagaya.usuario
       WHERE local_id = $1 AND rol = 'mesero'`,
  },

  turno: {
    tabla: "pagaya.turno",
    clave: [{ columna: "slug" }],
    campos: {
      nombre: { columna: "nombre" },
      inicio: { columna: "inicio" },
      fin: { columna: "fin" },
    },
    // `time` vuelve como '19:00:00' y el archivo dice '19:00': sin este
    // `to_char` la segunda corrida querría actualizar todos los turnos para
    // siempre. Es el caso que la prueba de idempotencia contra PostgreSQL
    // atrapa y la prueba en memoria no puede ver.
    lectura: `
      SELECT slug AS clave, nombre,
             to_char(inicio, 'HH24:MI') AS inicio,
             to_char(fin, 'HH24:MI') AS fin
        FROM pagaya.turno WHERE local_id = $1`,
  },

  asignacion: {
    tabla: "pagaya.asignacion",
    clave: [
      { columna: "turno_id", refiere: "turno" },
      { columna: "mesa_id", refiere: "mesa" },
    ],
    campos: {
      turno: { columna: "turno_id", refiere: "turno" },
      mesa: { columna: "mesa_id", refiere: "mesa" },
      mesero: { columna: "mesero_id", refiere: "mesero" },
    },
    lectura: `
      SELECT t.slug || '/' || m.numero AS clave, t.slug AS turno, m.numero AS mesa,
             u.codigo AS mesero
        FROM pagaya.asignacion AS a
        JOIN pagaya.turno AS t ON t.local_id = a.local_id AND t.id = a.turno_id
        JOIN pagaya.mesa AS m ON m.local_id = a.local_id AND m.id = a.mesa_id
        JOIN pagaya.usuario AS u ON u.local_id = a.local_id AND u.id = a.mesero_id
       WHERE a.local_id = $1`,
  },
};

/** Las columnas del local que el archivo escribe, en el mismo orden que `filasDeseadas`. */
const CAMPOS_LOCAL: readonly string[] = ["nombre", "zona_horaria", "moneda"];

function invalida(detalle: string): ErrorPagaya {
  return new ErrorPagaya("carga_invalida", detalle);
}

/**
 * Lo que vuelve de la base tiene que ser comparable con lo que dice el archivo.
 * Un `numeric` que llegara como texto, o un `jsonb`, daría un cambio eterno en
 * cada corrida: mejor que falle acá, con el nombre de la columna.
 */
function comoValor(columna: string, crudo: unknown): Valor {
  if (crudo === null) return null;
  const tipo = typeof crudo;
  if (tipo === "string" || tipo === "number" || tipo === "boolean") return crudo as Valor;
  throw invalida(
    `la columna '${columna}' volvió como ${tipo}: el plan compara valores simples, ` +
      `así que la lectura tiene que convertirla en la consulta`,
  );
}

type Contexto = {
  readonly tx: Transaccion;
  readonly localSlug: string;
  /** El id del local, resuelto o recién creado. */
  localId: string;
  /** Caché de `entidad|clave` → id, para no consultar lo mismo en cada referencia. */
  readonly ids: Map<string, string>;
};

async function idDelLocal(tx: Transaccion, localSlug: string): Promise<string | null> {
  const fila = await tx.una<{ id: string }>(`SELECT id FROM pagaya.local WHERE slug = $1`, [
    localSlug,
  ]);
  return fila?.id ?? null;
}

/** La clave natural de otra entidad → su id. Consulta solo lo que no está en la caché. */
async function resolver(ctx: Contexto, entidad: Entidad, clave: Valor): Promise<string> {
  if (typeof clave !== "string" || clave === "") {
    throw invalida(`se esperaba la clave natural de '${entidad}' y vino ${JSON.stringify(clave)}`);
  }
  const enCache = ctx.ids.get(`${entidad}|${clave}`);
  if (enCache !== undefined) return enCache;

  if (entidad === "local") {
    throw invalida("el local no se referencia por clave natural desde otra entidad");
  }
  const descriptor = DESCRIPTORES[entidad as Exclude<Entidad, "local">];
  const unica = descriptor.clave.length === 1 ? descriptor.clave[0] : undefined;
  if (unica === undefined || unica.refiere !== undefined) {
    throw invalida(
      `'${entidad}' tiene clave natural compuesta: nadie la referencia y no se resuelve`,
    );
  }
  const rol = entidad === "mesero" ? ` AND rol = 'mesero'` : "";
  const fila = await ctx.tx.una<{ id: string }>(
    `SELECT id FROM ${descriptor.tabla} WHERE local_id = $1 AND ${unica.columna} = $2${rol}`,
    [ctx.localId, clave],
  );
  if (fila === null) {
    throw invalida(
      `no existe ${entidad} '${clave}' en el local '${ctx.localSlug}': el plan la nombra ` +
        `como referencia y el orden de ORDEN_ENTIDADES tendría que haberla creado antes`,
    );
  }
  ctx.ids.set(`${entidad}|${clave}`, fila.id);
  return fila.id;
}

/** Resuelve un valor del plan a lo que va en la columna. */
async function valorDeColumna(ctx: Contexto, parte: ParteClave, valor: Valor): Promise<unknown> {
  return parte.refiere === undefined ? valor : await resolver(ctx, parte.refiere, valor);
}

/**
 * Las columnas de la clave natural, con sus valores. El plan la entrega como un
 * texto con "/" entre partes, que es la forma en que `filasDeseadas` la armó.
 */
async function columnasDeClave(
  ctx: Contexto,
  descriptor: Descriptor,
  clave: string,
): Promise<Map<string, unknown>> {
  const partes = clave.split("/");
  if (partes.length !== descriptor.clave.length) {
    throw invalida(
      `la clave '${clave}' no tiene las ${descriptor.clave.length} parte(s) que ` +
        `${descriptor.tabla} espera`,
    );
  }
  const columnas = new Map<string, unknown>();
  for (const [i, parte] of descriptor.clave.entries()) {
    columnas.set(parte.columna, await valorDeColumna(ctx, parte, partes[i] ?? null));
  }
  return columnas;
}

async function columnasDeCampos(
  ctx: Contexto,
  descriptor: Descriptor,
  campos: Fila,
): Promise<Map<string, unknown>> {
  const columnas = new Map<string, unknown>();
  for (const [campo, valor] of Object.entries(campos)) {
    const parte = descriptor.campos[campo];
    if (parte === undefined) {
      throw invalida(`${descriptor.tabla} no tiene dónde escribir el campo '${campo}'`);
    }
    columnas.set(parte.columna, await valorDeColumna(ctx, parte, valor));
  }
  return columnas;
}

function marcadores(desde: number, cantidad: number): string {
  return Array.from({ length: cantidad }, (_, i) => `$${desde + i}`).join(", ");
}

async function crearLocal(ctx: Contexto, campos: Fila): Promise<void> {
  const valores = CAMPOS_LOCAL.map((campo) => campos[campo] ?? null);
  const fila = await ctx.tx.una<{ id: string }>(
    `INSERT INTO pagaya.local (slug, ${CAMPOS_LOCAL.join(", ")})
     VALUES ($1, ${marcadores(2, CAMPOS_LOCAL.length)}) RETURNING id`,
    [ctx.localSlug, ...valores],
  );
  if (fila === null) throw invalida(`no se pudo crear el local '${ctx.localSlug}'`);
  ctx.localId = fila.id;
}

async function actualizarLocal(ctx: Contexto, campos: Fila): Promise<void> {
  const entradas = Object.entries(campos);
  if (entradas.length === 0) return;
  const asignaciones = entradas.map(([campo], i) => {
    if (!CAMPOS_LOCAL.includes(campo)) {
      throw invalida(`pagaya.local no tiene dónde escribir el campo '${campo}'`);
    }
    return `${campo} = $${i + 2}`;
  });
  await ctx.tx.consulta(
    `UPDATE pagaya.local SET ${asignaciones.join(", ")}, actualizado_en = now()
      WHERE slug = $1`,
    [ctx.localSlug, ...entradas.map(([, valor]) => valor)],
  );
}

async function aplicar(ctx: Contexto, cambio: Cambio): Promise<void> {
  if (cambio.entidad === "local") {
    if (cambio.accion === "crear") return crearLocal(ctx, cambio.campos);
    if (cambio.accion === "actualizar") return actualizarLocal(ctx, cambio.campos);
    throw invalida("dar de baja un local no es parte de la carga inicial");
  }

  if (ctx.localId === "") {
    throw invalida(
      `'${cambio.entidad}/${cambio.clave}' se aplicaría antes que el local: el orden del ` +
        `plan (ORDEN_ENTIDADES) es parte del contrato del puerto`,
    );
  }

  const descriptor = DESCRIPTORES[cambio.entidad];
  const clave = await columnasDeClave(ctx, descriptor, cambio.clave);

  if (cambio.accion === "baja") {
    // El cargador no borra: lo que el archivo ya no nombra se reporta como
    // huérfano (AT-17, supuesto S-15). La única excepción son las asignaciones
    // de los turnos que el archivo sí declara, porque reasignar mesas es
    // exactamente lo que RF-A-04 pide poder hacer.
    if (cambio.entidad !== "asignacion") {
      throw invalida(
        `el cargador no borra ${cambio.entidad}: un producto o una mesa que sale del ` +
          `archivo sigue referenciada por las comandas viejas (PRD-001 §12) y se reporta ` +
          `como huérfana`,
      );
    }
    const condiciones = [...clave.keys()].map((columna, i) => `${columna} = $${i + 2}`);
    await ctx.tx.consulta(
      `DELETE FROM ${descriptor.tabla} WHERE local_id = $1 AND ${condiciones.join(" AND ")}`,
      [ctx.localId, ...clave.values()],
    );
    return;
  }

  const campos = await columnasDeCampos(ctx, descriptor, cambio.campos);

  if (cambio.accion === "crear") {
    // El orden importa: la clave natural primero, después los campos, y las
    // columnas fijas de la entidad al final. El Map colapsa las repetidas —la
    // variante nombra su producto en la clave y en los campos—, que es lo que
    // evita un INSERT con la misma columna dos veces.
    const columnas = new Map<string, unknown>([
      ["local_id", ctx.localId],
      ...clave,
      ...campos,
      ...Object.entries(descriptor.fijas ?? {}),
    ]);
    const nombres = [...columnas.keys()];
    const fila = await ctx.tx.una<{ id: string }>(
      `INSERT INTO ${descriptor.tabla} (${nombres.join(", ")})
       VALUES (${marcadores(1, nombres.length)}) RETURNING id`,
      [...columnas.values()],
    );
    if (fila === null) throw invalida(`no se pudo crear ${cambio.entidad} '${cambio.clave}'`);
    ctx.ids.set(`${cambio.entidad}|${cambio.clave}`, fila.id);
    return;
  }

  // Actualizar. La clave natural no se toca: cambiarla no es editar una fila,
  // es crear otra y dejar la anterior como huérfana (AT-17).
  const sinClave = [...campos].filter(([columna]) => !clave.has(columna));
  if (sinClave.length === 0) return;
  const asignaciones = sinClave.map(([columna], i) => `${columna} = $${i + 2}`);
  const condiciones = [...clave.keys()].map(
    (columna, i) => `${columna} = $${sinClave.length + i + 2}`,
  );
  await ctx.tx.consulta(
    `UPDATE ${descriptor.tabla}
        SET ${asignaciones.join(", ")}, actualizado_en = now()
      WHERE local_id = $1 AND ${condiciones.join(" AND ")}`,
    [ctx.localId, ...sinClave.map(([, valor]) => valor), ...clave.values()],
  );
}

/**
 * El repositorio de verdad. Recibe la capa de acceso ya construida: quién la
 * construye —y con qué ambiente— es decisión del proceso que corre el cargador,
 * no de este archivo.
 */
export function repositorioPostgres(acceso: Acceso): RepositorioCarga {
  return {
    async leerEstado(localSlug) {
      return acceso.entreLocales(
        `leer el estado del local '${localSlug}' para la carga inicial (F1-05)`,
        async (tx) => {
          const local = await tx.una<{
            id: string;
            nombre: string;
            zona_horaria: string;
            moneda: string;
          }>(`SELECT id, nombre, zona_horaria, moneda FROM pagaya.local WHERE slug = $1`, [
            localSlug,
          ]);
          // El local todavía no existe: la primera carga es un estado vacío, no
          // un error. Es lo que hace que la primera corrida cree todo.
          if (local === null) return [];

          const filas: FilaIdentificada[] = [
            {
              entidad: "local",
              clave: localSlug,
              campos: {
                nombre: local.nombre,
                zona_horaria: local.zona_horaria,
                moneda: local.moneda,
              },
            },
          ];

          for (const entidad of ORDEN_ENTIDADES) {
            if (entidad === "local") continue;
            const leidas = await tx.consulta(DESCRIPTORES[entidad].lectura, [local.id]);
            for (const cruda of leidas) {
              const campos: Record<string, Valor> = {};
              let clave = "";
              for (const [columna, valor] of Object.entries(cruda)) {
                if (columna === "clave") {
                  clave = String(valor);
                  continue;
                }
                campos[columna] = comoValor(`${entidad}.${columna}`, valor);
              }
              filas.push({ entidad, clave, campos });
            }
          }
          return filas;
        },
      );
    },

    async escribir(localSlug, cambios) {
      if (cambios.length === 0) {
        throw invalida(
          "se pidió escribir un plan vacío: la carga no abre una transacción para nada",
        );
      }
      await acceso.entreLocales(
        `escribir la carga inicial del local '${localSlug}' (F1-05)`,
        async (tx) => {
          const ctx: Contexto = { tx, localSlug, localId: "", ids: new Map() };
          const creaElLocal = cambios.some(
            (c) => c.entidad === "local" && c.accion === "crear",
          );
          if (!creaElLocal) {
            const id = await idDelLocal(tx, localSlug);
            if (id === null) {
              throw invalida(
                `el local '${localSlug}' no existe y el plan no lo crea: ` +
                  `el estado que se planificó no es el de esta base`,
              );
            }
            ctx.localId = id;
          }
          for (const cambio of cambios) await aplicar(ctx, cambio);
        },
      );
    },
  };
}
