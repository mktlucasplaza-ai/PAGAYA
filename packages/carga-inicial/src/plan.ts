/**
 * El plan de carga: qué habría que escribir, calculado sin escribir nada.
 *
 * La idempotencia no se promete, se calcula. El cargador lee el estado que ya
 * existe, lo compara contra el archivo por **clave natural** —el slug del
 * producto, el número de la mesa— y produce la lista de cambios. Correrlo dos
 * veces da una lista vacía la segunda vez, y eso es exactamente lo que prueba
 * `plan.prueba.ts`, sin una base de datos encendida.
 *
 * Es la misma forma que `@pagaya/base-datos` usa para las migraciones (AT-7):
 * la mecánica no sabe SQL y trabaja contra un puerto, que es lo que permite
 * probarla hoy y conectarla a PostgreSQL cuando existan las tablas.
 */
import { ORDEN_ENTIDADES, type Entidad, type LocalPiloto, type Valor } from "./contrato.ts";

export type Fila = Readonly<Record<string, Valor>>;

/** Una fila identificada por su clave natural dentro del local. */
export type FilaIdentificada = {
  readonly entidad: Entidad;
  readonly clave: string;
  readonly campos: Fila;
};

export type Accion = "crear" | "actualizar" | "baja";

export type Cambio = {
  readonly entidad: Entidad;
  readonly accion: Accion;
  readonly clave: string;
  /** Los campos a escribir. Vacío en una baja. */
  readonly campos: Fila;
  /** Qué campos difieren del estado actual. Vacío al crear y al dar de baja. */
  readonly cambiados: readonly string[];
};

export type Plan = {
  readonly local: string;
  readonly cambios: readonly Cambio[];
  readonly sinCambios: readonly FilaIdentificada[];
  /**
   * Lo que existe en la base y el archivo ya no nombra. El cargador **no lo
   * borra**: un producto retirado de la carta sigue referenciado por los ítems
   * de comandas viejas (PRD-001 §12) y una mesa borrada se lleva su historia.
   * Se reportan para que alguien decida, que es distinto de ignorarlos.
   */
  readonly huerfanos: readonly FilaIdentificada[];
};

/**
 * Lo único que el plan necesita de la base de datos.
 *
 * `escribir` tiene que aplicar **todos** los cambios en una transacción: un
 * archivo cargado a medias deja un local con mesas sin zona y asignaciones sin
 * mesero, y la segunda corrida ya no sabría distinguir eso de un archivo
 * cambiado a mano.
 */
export type RepositorioCarga = {
  leerEstado(localSlug: string): Promise<readonly FilaIdentificada[]>;
  escribir(localSlug: string, cambios: readonly Cambio[]): Promise<void>;
};

/**
 * Campos que se escriben al crear y no se vuelven a tocar.
 *
 * `producto.disponible` es el caso que importa: RF-M-12 deja que el mesero
 * marque un producto como agotado durante el servicio. Si el cargador
 * reescribiera la disponibilidad, correrlo un martes a las nueve de la noche
 * volvería a poner en la carta el pescado que se acabó a las ocho.
 */
const SOLO_AL_CREAR: Partial<Record<Entidad, readonly string[]>> = {
  producto: ["disponible"],
};

/** El archivo, desarmado en filas con su clave natural. El orden es el de escritura. */
export function filasDeseadas(piloto: LocalPiloto): readonly FilaIdentificada[] {
  const filas: FilaIdentificada[] = [
    {
      entidad: "local",
      clave: piloto.local.slug,
      campos: {
        nombre: piloto.local.nombre,
        zona_horaria: piloto.local.zona_horaria,
        moneda: piloto.local.moneda,
      },
    },
  ];
  for (const zona of piloto.zonas) {
    filas.push({ entidad: "zona", clave: zona.slug, campos: { nombre: zona.nombre } });
  }
  for (const categoria of piloto.categorias) {
    filas.push({
      entidad: "categoria",
      clave: categoria.slug,
      campos: { nombre: categoria.nombre, orden: categoria.orden },
    });
  }
  for (const producto of piloto.productos) {
    filas.push({
      entidad: "producto",
      clave: producto.sku,
      campos: {
        categoria: producto.categoria,
        nombre: producto.nombre,
        descripcion: producto.descripcion,
        precio: producto.precio,
        foto: producto.foto,
        orden: producto.orden,
        disponible: producto.disponible,
      },
    });
  }
  for (const producto of piloto.productos) {
    for (const variante of producto.variantes) {
      filas.push({
        entidad: "variante",
        clave: `${producto.sku}/${variante.slug}`,
        campos: {
          producto: producto.sku,
          nombre: variante.nombre,
          precio_delta: variante.precio_delta,
        },
      });
    }
  }
  for (const mesa of piloto.mesas) {
    filas.push({
      entidad: "mesa",
      clave: mesa.numero,
      campos: { zona: mesa.zona, capacidad: mesa.capacidad, qr_token: mesa.qr_token },
    });
  }
  for (const mesero of piloto.meseros) {
    filas.push({
      entidad: "mesero",
      clave: mesero.codigo,
      campos: { nombre_pila: mesero.nombre_pila, telefono: mesero.telefono },
    });
  }
  for (const turno of piloto.turnos) {
    filas.push({
      entidad: "turno",
      clave: turno.slug,
      campos: { nombre: turno.nombre, inicio: turno.inicio, fin: turno.fin },
    });
  }
  for (const asignacion of piloto.asignaciones) {
    filas.push({
      entidad: "asignacion",
      clave: `${asignacion.turno}/${asignacion.mesa}`,
      campos: { turno: asignacion.turno, mesa: asignacion.mesa, mesero: asignacion.mesero },
    });
  }
  return filas;
}

function diferencias(deseada: Fila, actual: Fila, soloAlCrear: readonly string[]): string[] {
  const cambiados: string[] = [];
  for (const [campo, valor] of Object.entries(deseada)) {
    if (soloAlCrear.includes(campo)) continue;
    if (actual[campo] !== valor) cambiados.push(campo);
  }
  return cambiados;
}

function sinLosDeCreacion(campos: Fila, soloAlCrear: readonly string[]): Fila {
  if (soloAlCrear.length === 0) return campos;
  return Object.fromEntries(
    Object.entries(campos).filter(([campo]) => !soloAlCrear.includes(campo)),
  );
}

/**
 * Compara el archivo con lo que ya existe y devuelve qué hacer.
 *
 * Función pura: no toca la base ni el reloj. El estado entra como dato, así que
 * la prueba de idempotencia es "aplicar el plan y volver a planificar da cero
 * cambios", sin PostgreSQL.
 */
export function planificar(
  piloto: LocalPiloto,
  estado: readonly FilaIdentificada[],
): Plan {
  const actuales = new Map(estado.map((f) => [`${f.entidad}|${f.clave}`, f]));
  const deseadas = filasDeseadas(piloto);
  const clavesDeseadas = new Set(deseadas.map((f) => `${f.entidad}|${f.clave}`));
  const turnosDeclarados = new Set(piloto.turnos.map((t) => t.slug));

  const cambios: Cambio[] = [];
  const sinCambios: FilaIdentificada[] = [];
  const huerfanos: FilaIdentificada[] = [];

  for (const entidad of ORDEN_ENTIDADES) {
    for (const fila of deseadas.filter((f) => f.entidad === entidad)) {
      const actual = actuales.get(`${entidad}|${fila.clave}`);
      const soloAlCrear = SOLO_AL_CREAR[entidad] ?? [];
      if (actual === undefined) {
        cambios.push({ ...fila, accion: "crear", cambiados: [] });
        continue;
      }
      const cambiados = diferencias(fila.campos, actual.campos, soloAlCrear);
      if (cambiados.length === 0) {
        sinCambios.push(fila);
        continue;
      }
      cambios.push({
        entidad,
        clave: fila.clave,
        accion: "actualizar",
        campos: sinLosDeCreacion(fila.campos, soloAlCrear),
        cambiados,
      });
    }

    for (const fila of estado.filter((f) => f.entidad === entidad)) {
      if (clavesDeseadas.has(`${entidad}|${fila.clave}`)) continue;
      // La asignación es el único dato declarativo: el archivo es la verdad de
      // los turnos que nombra, porque reasignar mesas es justo lo que RF-A-04
      // pide poder hacer. De un turno que el archivo ya no declara no se dice
      // nada, así que sus asignaciones quedan como huérfanas.
      const turno = typeof fila.campos["turno"] === "string" ? fila.campos["turno"] : "";
      if (entidad === "asignacion" && turnosDeclarados.has(turno)) {
        cambios.push({ entidad, clave: fila.clave, accion: "baja", campos: {}, cambiados: [] });
        continue;
      }
      huerfanos.push(fila);
    }
  }

  return { local: piloto.local.slug, cambios, sinCambios, huerfanos };
}

/**
 * Calcula el plan contra el repositorio y lo escribe si hay algo que escribir.
 *
 * Con cero cambios no se abre ninguna transacción: la segunda corrida no toca
 * la base, que es la forma fuerte de "correrlo dos veces no duplica nada".
 */
export async function cargar(
  repositorio: RepositorioCarga,
  piloto: LocalPiloto,
): Promise<Plan> {
  const estado = await repositorio.leerEstado(piloto.local.slug);
  const plan = planificar(piloto, estado);
  if (plan.cambios.length > 0) await repositorio.escribir(piloto.local.slug, plan.cambios);
  return plan;
}

/** El plan en texto, para la salida del comando. Separado de la impresión para poder probarlo. */
export function resumir(plan: Plan): readonly string[] {
  const lineas: string[] = [];
  for (const cambio of plan.cambios) {
    const detalle =
      cambio.accion === "actualizar" ? ` (${cambio.cambiados.join(", ")})` : "";
    lineas.push(`  ${cambio.accion.padEnd(10)} ${cambio.entidad.padEnd(11)} ${cambio.clave}${detalle}`);
  }
  for (const huerfano of plan.huerfanos) {
    lineas.push(
      `  huérfano   ${huerfano.entidad.padEnd(11)} ${huerfano.clave} ` +
        `(está en la base y no en el archivo; el cargador no lo borra)`,
    );
  }
  const porAccion = (accion: Accion): number =>
    plan.cambios.filter((c) => c.accion === accion).length;
  lineas.push(
    `${porAccion("crear")} por crear, ${porAccion("actualizar")} por actualizar, ` +
      `${porAccion("baja")} por dar de baja, ${plan.sinCambios.length} sin cambios, ` +
      `${plan.huerfanos.length} huérfano(s)`,
  );
  return lineas;
}
