/**
 * El cargador contra PostgreSQL de verdad (F1-06).
 *
 * `plan.prueba.ts` ya prueba la planificación y la idempotencia contra el
 * repositorio en memoria, y eso corre sin base de datos. Lo que **no** puede
 * afirmar es lo que depende del esquema, que es justamente lo que esta tarea
 * agrega:
 *
 *   1. que el viaje completo —escribir el archivo y volver a leerlo— devuelva
 *      exactamente lo que el archivo dice. Un `time` que vuelve como
 *      `'19:00:00'` donde el archivo dice `'19:00'`, o un `numeric` que vuelve
 *      como texto, haría que la segunda corrida quisiera actualizar lo mismo
 *      para siempre, y el repositorio en memoria no tiene cómo verlo;
 *   2. que **cargar dos veces deje exactamente las mismas filas**, que es lo
 *      que F1-05 promete;
 *   3. que **un segundo local no vea nada del primero** (PRD-001 §13), lo que
 *      no se descubre probando con uno —y es el motivo por el que el
 *      aislamiento se hizo en F1-02 antes de que hubiera dos.
 *
 * Se omiten sin `PAGAYA_BD_URL`, diciéndolo, y la integración continua pone
 * `PAGAYA_EXIGIR_BD=1` junto a un PostgreSQL efímero (arquitectura.md §8.5).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";

import { crearAcceso, migrarAmbiente, type Acceso } from "@pagaya/base-datos";
import { cargarConfiguracion, type Configuracion } from "@pagaya/config";

import type { LocalPiloto } from "./contrato.ts";
import { cargar, filasDeseadas, type FilaIdentificada } from "./plan.ts";
import { repositorioPostgres } from "./repositorio-postgres.ts";
import { archivoEjemplo, validar } from "./validacion.ts";

const hayBaseDatos = (process.env["PAGAYA_BD_URL"] ?? "").length > 0;

/**
 * Dos locales ficticios y distintos del ejemplo del repositorio: la base de
 * desarrollo puede tener cargado el ejemplo de verdad, y una prueba que se
 * pisara con él estaría probando otra cosa.
 */
const NORTE = "ensayo-f106-norte";
const SUR = "ensayo-f106-sur";

/** Rangos de teléfono propios de esta prueba, distintos de los del ejemplo. */
const TELEFONOS_NORTE = 1_060_001;
const TELEFONOS_SUR = 2_060_001;

type Json = Record<string, unknown>;

function configuracion(): Configuracion {
  return cargarConfiguracion({ ambiente: process.env["PAGAYA_AMBIENTE"] ?? "dev" });
}

/**
 * El ejemplo, con otro slug y otros teléfonos. El teléfono es único en todo el
 * sistema —una cuenta por número (PRD-004 §3)—, así que dos locales no pueden
 * declarar el mismo mesero: es la última prueba de este archivo. Y por eso los
 * números de acá no pueden ser los del ejemplo versionado: una base de
 * desarrollo donde alguien corrió `make cargar-piloto` ya los tiene tomados.
 */
function piloto(slug: string, desdeTelefono: number, recortar = false): LocalPiloto {
  const crudo = JSON.parse(readFileSync(archivoEjemplo(), "utf8")) as Json;
  const local = crudo["local"] as Json;
  local["slug"] = slug;
  local["nombre"] = `Ensayo ${slug}`;
  (crudo["meseros"] as Json[]).forEach((mesero, i) => {
    mesero["telefono"] = `+569${String(desdeTelefono + i).padStart(8, "0")}`;
  });

  if (recortar) {
    // El local del sur tiene otra carta y un mesero menos: así "no ve nada del
    // primero" se puede afirmar contando, y no solo mirando identificadores.
    const carta = crudo["carta"] as Json;
    carta["categorias"] = (carta["categorias"] as Json[]).filter((c) => c["slug"] !== "postres");
    carta["productos"] = (carta["productos"] as Json[]).filter((p) => p["categoria"] !== "postres");
    crudo["meseros"] = (crudo["meseros"] as Json[]).filter((m) => m["codigo"] !== "m-03");
    crudo["asignaciones"] = (crudo["asignaciones"] as Json[]).filter((a) => a["mesero"] !== "m-03");
  }

  const resultado = validar(crudo);
  assert.ok(resultado.ok, `el archivo de la prueba tiene que ser válido: ${slug}`);
  return resultado.local;
}

/**
 * Huella canónica de un conjunto de filas: ordenada y con las claves de cada
 * fila ordenadas, para que la comparación no dependa del orden en que vinieron
 * de la base ni del orden en que las armó el plan.
 */
function huella(filas: readonly FilaIdentificada[]): string[] {
  return filas
    .map((fila) => {
      const campos = Object.keys(fila.campos)
        .sort()
        .map((campo) => `${campo}=${JSON.stringify(fila.campos[campo])}`)
        .join(" ");
      return `${fila.entidad}|${fila.clave}|${campos}`;
    })
    .sort();
}

describe("el cargador sobre PostgreSQL", { skip: hayBaseDatos ? false : "sin PAGAYA_BD_URL" }, () => {
  let acceso: Acceso;

  async function idDe(slug: string): Promise<string | null> {
    const fila = await acceso.entreLocales(`buscar el local '${slug}' de la prueba`, (tx) =>
      tx.una<{ id: string }>(`SELECT id FROM pagaya.local WHERE slug = $1`, [slug]),
    );
    return fila?.id ?? null;
  }

  async function borrarLocales(): Promise<void> {
    await acceso.entreLocales("limpiar los locales de esta prueba", (tx) =>
      tx.consulta(`DELETE FROM pagaya.local WHERE slug = ANY($1::text[])`, [
        [NORTE, SUR, "ensayo-f106-telefono-repetido"],
      ]),
    );
  }

  before(async () => {
    const config = configuracion();
    // Las pruebas corren en procesos separados: ninguna puede suponer que otra
    // migró primero. El cerrojo de asesoría de la migración serializa a las que
    // arranquen juntas.
    await migrarAmbiente(config);
    acceso = crearAcceso(config);
    await borrarLocales();
  });

  after(async () => {
    if (acceso === undefined) return;
    await borrarLocales();
    await acceso.cerrar();
  });

  test("la primera carga escribe el archivo completo y lo devuelve igual", async () => {
    const repositorio = repositorioPostgres(acceso);
    const local = piloto(NORTE, TELEFONOS_NORTE);

    const plan = await cargar(repositorio, local);
    assert.ok(
      plan.cambios.every((c) => c.accion === "crear"),
      "sobre un local que no existe todo es creación",
    );
    assert.equal(plan.cambios.length, filasDeseadas(local).length);

    // Lo que volvió de la base es, campo por campo, lo que dice el archivo. Es
    // la afirmación que el repositorio en memoria no puede hacer: ahí la lectura
    // devuelve lo que la escritura guardó, sin pasar por ningún tipo de SQL.
    assert.deepEqual(huella(await repositorio.leerEstado(NORTE)), huella(filasDeseadas(local)));
  });

  test("cargar el archivo dos veces deja exactamente las mismas filas", async () => {
    const repositorio = repositorioPostgres(acceso);
    const local = piloto(NORTE, TELEFONOS_NORTE);

    const antes = huella(await repositorio.leerEstado(NORTE));
    const segunda = await cargar(repositorio, local);

    assert.deepEqual(segunda.cambios, [], "la segunda corrida no escribe nada");
    assert.deepEqual(segunda.huerfanos, []);
    assert.equal(segunda.sinCambios.length, antes.length);
    assert.deepEqual(huella(await repositorio.leerEstado(NORTE)), antes);

    // Y una tercera, porque "dos veces" podría ser casualidad del primer par.
    await cargar(repositorio, local);
    assert.deepEqual(huella(await repositorio.leerEstado(NORTE)), antes);
  });

  test("un producto agotado por el mesero sobrevive a la carga (RF-M-12)", async () => {
    const repositorio = repositorioPostgres(acceso);
    const local = piloto(NORTE, TELEFONOS_NORTE);
    const id = await idDe(NORTE);
    assert.ok(id !== null);

    // Lo que pasa un martes a las ocho, escrito como lo escribiría la app del
    // mesero: con el local fijado, no entre locales.
    await acceso.conLocal(id, (tx) =>
      tx.consulta(`UPDATE pagaya.producto SET disponible = false WHERE sku = $1`, [
        "pescado-del-dia",
      ]),
    );

    const plan = await cargar(repositorio, local);
    assert.deepEqual(plan.cambios, [], "la disponibilidad se escribe al crear y no se vuelve a tocar");

    const fila = await acceso.conLocal(id, (tx) =>
      tx.una<{ disponible: boolean }>(`SELECT disponible FROM pagaya.producto WHERE sku = $1`, [
        "pescado-del-dia",
      ]),
    );
    assert.equal(fila?.disponible, false);
  });

  test("un cambio de precio es un UPDATE de una fila y nada más", async () => {
    const repositorio = repositorioPostgres(acceso);
    const conOtroPrecio = piloto(NORTE, TELEFONOS_NORTE);
    const productos = conOtroPrecio.productos.map((p) =>
      p.sku === "empanada-queso" ? { ...p, precio: 5200 } : p,
    );
    const local: LocalPiloto = { ...conOtroPrecio, productos };

    const antes = huella(await repositorio.leerEstado(NORTE));
    const plan = await cargar(repositorio, local);
    assert.equal(plan.cambios.length, 1);
    assert.equal(plan.cambios[0]?.accion, "actualizar");
    assert.deepEqual(plan.cambios[0]?.cambiados, ["precio"]);

    // El estado cambió en una sola fila y en un solo campo. Se compara contra
    // lo que había, no contra el archivo: el pescado que el mesero marcó como
    // agotado en la prueba anterior sigue agotado, y tiene que seguir.
    const despues = huella(await repositorio.leerEstado(NORTE));
    assert.deepEqual(
      antes.filter((linea) => !despues.includes(linea)),
      [
        'producto|empanada-queso|categoria="entradas" descripcion="Frita, de queso mantecoso." ' +
          'disponible=true foto="fotos/empanada-queso.webp" nombre="Empanada de queso" ' +
          "orden=1 precio=4500",
      ],
    );
    assert.deepEqual(
      despues.filter((linea) => !antes.includes(linea)),
      [
        'producto|empanada-queso|categoria="entradas" descripcion="Frita, de queso mantecoso." ' +
          'disponible=true foto="fotos/empanada-queso.webp" nombre="Empanada de queso" ' +
          "orden=1 precio=5200",
      ],
    );

    // Y queda idempotente de nuevo.
    assert.deepEqual((await cargar(repositorio, local)).cambios, []);
  });

  test("un segundo local no ve nada del primero", async () => {
    const repositorio = repositorioPostgres(acceso);
    const sur = piloto(SUR, TELEFONOS_SUR, true);
    await cargar(repositorio, sur);

    const idNorte = await idDe(NORTE);
    const idSur = await idDe(SUR);
    assert.ok(idNorte !== null && idSur !== null && idNorte !== idSur);

    // 1. El cargador, que mira por clave natural, ve solo lo del local del
    //    archivo: la carta del sur es la del sur, con una categoría menos.
    assert.deepEqual(huella(await repositorio.leerEstado(SUR)), huella(filasDeseadas(sur)));
    assert.notDeepEqual(
      huella(await repositorio.leerEstado(NORTE)),
      huella(await repositorio.leerEstado(SUR)),
    );

    // 2. La aplicación, que mira con el local fijado, cuenta solo las filas de
    //    su local. Esto es lo que ve F1-30 al pintar la carta y F1-60 al abrir
    //    la app del mesero.
    async function conteo(local: string): Promise<Record<string, number>> {
      const filas = await acceso.conLocal(local, (tx) =>
        tx.consulta<{ tabla: string; filas: string }>(`
          SELECT 'zona' AS tabla, count(*)::text AS filas FROM pagaya.zona
          UNION ALL SELECT 'categoria', count(*)::text FROM pagaya.categoria
          UNION ALL SELECT 'producto',  count(*)::text FROM pagaya.producto
          UNION ALL SELECT 'variante',  count(*)::text FROM pagaya.variante
          UNION ALL SELECT 'mesa',      count(*)::text FROM pagaya.mesa
          UNION ALL SELECT 'turno',     count(*)::text FROM pagaya.turno
          UNION ALL SELECT 'asignacion',count(*)::text FROM pagaya.asignacion
          UNION ALL SELECT 'local',     count(*)::text FROM pagaya.local`),
      );
      return Object.fromEntries(filas.map((f) => [f.tabla, Number(f.filas)]));
    }

    const esperado = (local: LocalPiloto): Record<string, number> => ({
      local: 1,
      zona: local.zonas.length,
      categoria: local.categorias.length,
      producto: local.productos.length,
      variante: local.productos.reduce((n, p) => n + p.variantes.length, 0),
      mesa: local.mesas.length,
      turno: local.turnos.length,
      asignacion: local.asignaciones.length,
    });

    assert.deepEqual(await conteo(idSur), esperado(sur));
    assert.deepEqual(await conteo(idNorte), esperado(piloto(NORTE, TELEFONOS_NORTE)));

    // 3. Y sin local fijado no se ve nada, que es el caso por defecto que
    //    AT-12 persigue: cero filas, no las de todos.
    const sinLocal = await acceso.sinLocal((tx) =>
      tx.consulta(`SELECT sku FROM pagaya.producto`),
    );
    assert.deepEqual(sinLocal, []);
  });

  test("el personal queda como usuario del local, y el QR de cada mesa es único", async () => {
    const idNorte = await idDe(NORTE);
    assert.ok(idNorte !== null);

    // RF-A-03 y PRD-001 §12: el mesero es un usuario con rol y local. La
    // excepción de §9.3 es que el **cliente** no tenga local, no que el
    // personal no lo tenga.
    const personal = await acceso.conLocal(idNorte, (tx) =>
      tx.consulta<{ codigo: string; rol: string; con_local: boolean }>(
        `SELECT codigo, rol, local_id IS NOT NULL AS con_local
           FROM pagaya.usuario ORDER BY codigo`,
      ),
    );
    assert.deepEqual(
      personal,
      [
        { codigo: "m-01", rol: "mesero", con_local: true },
        { codigo: "m-02", rol: "mesero", con_local: true },
        { codigo: "m-03", rol: "mesero", con_local: true },
      ],
      "el personal del local tiene rol mesero y local_id (PRD-001 §12)",
    );

    // El token del QR se deriva de (slug del local, número de mesa), así que
    // dos locales con la misma mesa "1" no comparten QR. Que sea único en todo
    // el sistema es lo que permite que lo escaneado resuelva a una sola mesa
    // (RF-C-01, F1-11, supuesto S-19).
    const repetidos = await acceso.entreLocales("contar tokens de QR repetidos", (tx) =>
      tx.consulta(
        `SELECT qr_token FROM pagaya.mesa GROUP BY qr_token HAVING count(*) > 1`,
      ),
    );
    assert.deepEqual(repetidos, []);
  });

  test("una mesa no puede tener dos meseros en el mismo turno (supuesto S-13)", async () => {
    const idNorte = await idDe(NORTE);
    assert.ok(idNorte !== null);

    // Hasta F1-06 esta regla solo la revisaba el validador del archivo. Acá se
    // intenta por el camino que el validador no mira: SQL directo.
    await assert.rejects(
      () =>
        acceso.conLocal(idNorte, (tx) =>
          tx.consulta(`
            INSERT INTO pagaya.asignacion (local_id, turno_id, mesa_id, mesero_id)
            SELECT a.local_id, a.turno_id, a.mesa_id, u.id
              FROM pagaya.asignacion AS a
              JOIN pagaya.usuario AS u ON u.local_id = a.local_id AND u.codigo = 'm-03'
             LIMIT 1`),
        ),
      /asignacion_una_mesa_un_mesero_por_turno/,
      "PRD-001 §9 manda cada aviso al mesero de la mesa, en singular",
    );
  });

  test("una asignación no puede cruzar de local, ni con entre_locales encendido", async () => {
    const idNorte = await idDe(NORTE);
    const idSur = await idDe(SUR);
    assert.ok(idNorte !== null && idSur !== null);

    // La row level security no alcanza para esto: `entreLocales` la apaga, y es
    // justo el camino por el que entra la carga. Lo que lo impide es la clave
    // ajena compuesta (local_id, mesa_id) → mesa (local_id, id).
    await assert.rejects(
      () =>
        acceso.entreLocales("intentar mezclar dos locales en una asignación", (tx) =>
          tx.consulta(
            `INSERT INTO pagaya.asignacion (local_id, turno_id, mesa_id, mesero_id)
             SELECT $1,
                    (SELECT id FROM pagaya.turno WHERE local_id = $1 LIMIT 1),
                    (SELECT id FROM pagaya.mesa WHERE local_id = $2 LIMIT 1),
                    (SELECT id FROM pagaya.usuario WHERE local_id = $1 LIMIT 1)`,
            [idNorte, idSur],
          ),
        ),
      /asignacion_mesa_del_mismo_local/,
    );
  });

  test("dos locales no pueden declarar el mismo mesero (PRD-004 §3)", async () => {
    const repositorio = repositorioPostgres(acceso);
    // Mismos teléfonos que el local del norte: una cuenta por número de
    // teléfono, y un mesero es una cuenta.
    const tercero = piloto("ensayo-f106-telefono-repetido", TELEFONOS_NORTE);

    await assert.rejects(
      () => cargar(repositorio, tercero),
      /usuario_telefono_unico/,
      "el teléfono es la identidad de la persona, no un dato del local",
    );

    // Y la transacción no dejó el local a medias: o entra todo o no entra nada.
    assert.equal(await idDe("ensayo-f106-telefono-repetido"), null);
  });
});
