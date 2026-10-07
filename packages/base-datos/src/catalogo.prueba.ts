/**
 * Lo que la migración 0003 promete, verificado contra PostgreSQL (F1-06).
 *
 * El cargador tiene su propia prueba de integración
 * (`packages/carga-inicial/src/repositorio-postgres.prueba.ts`): ahí se verifica
 * el viaje completo del archivo y que cargarlo dos veces deje las mismas filas.
 * Acá se verifica lo otro, que ningún camino de escritura puede violar y que
 * por eso no se prueba con el cargador delante:
 *
 *   - la excepción de identidad de docs/arquitectura.md §9.3 escrita como
 *     restricción: `usuario.local_id` **nulo para el cliente, obligatorio para
 *     el personal**, y ningún UPDATE que cruce de un lado al otro;
 *   - la política escrita a mano de esa misma tabla: el personal de otro local
 *     no se ve, y al cliente no se le compara el local.
 *
 * La guardia `pagaya.tablas_sin_aislamiento()` ya cubre el resto —que las siete
 * tablas de negocio que 0003 crea tengan su row level security forzada— desde
 * `acceso.prueba.ts`, sin que haya que nombrarlas una por una: si una naciera
 * sin aislamiento, esa prueba falla.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { cargarConfiguracion } from "@pagaya/config";

import { crearAcceso, type Acceso } from "./acceso.ts";
import { migrarAmbiente } from "./postgres.ts";

const hayBaseDatos = (process.env["PAGAYA_BD_URL"] ?? "").length > 0;

const UNO = "aaaaaaaa-0000-4000-8000-00000000f106";
const OTRO = "bbbbbbbb-0000-4000-8000-00000000f106";

/** Fuera del rango que se asigna en Chile, como el ejemplo del cargador. */
const TELEFONO_MESERO = "+56903060001";
const TELEFONO_MESERO_OTRO = "+56903060002";
const TELEFONO_CLIENTE = "+56903060003";

describe("el usuario, la excepción al local_id", { skip: hayBaseDatos ? false : "sin PAGAYA_BD_URL" }, () => {
  let acceso: Acceso;

  async function limpiar(): Promise<void> {
    await acceso.entreLocales("limpiar lo que montó esta prueba", async (tx) => {
      await tx.consulta(`DELETE FROM pagaya.usuario WHERE telefono = ANY($1::text[])`, [
        [TELEFONO_MESERO, TELEFONO_MESERO_OTRO, TELEFONO_CLIENTE],
      ]);
      await tx.consulta(`DELETE FROM pagaya.local WHERE id IN ($1, $2)`, [UNO, OTRO]);
    });
  }

  before(async () => {
    const config = cargarConfiguracion({ ambiente: process.env["PAGAYA_AMBIENTE"] ?? "dev" });
    await migrarAmbiente(config);
    acceso = crearAcceso(config);
    await limpiar();
    await acceso.entreLocales("sembrar los dos locales de esta prueba", async (tx) => {
      await tx.consulta(
        `INSERT INTO pagaya.local (id, slug, nombre, zona_horaria)
         VALUES ($1, 'ensayo-f106-uno', 'Ensayo Uno', 'America/Santiago'),
                ($2, 'ensayo-f106-otro', 'Ensayo Otro', 'Pacific/Easter')`,
        [UNO, OTRO],
      );
      await tx.consulta(
        `INSERT INTO pagaya.usuario (local_id, rol, codigo, nombre_pila, telefono)
         VALUES ($1, 'mesero', 'ensayo-uno', 'Ana', $3),
                ($2, 'mesero', 'ensayo-otro', 'Bastián', $4)`,
        [UNO, OTRO, TELEFONO_MESERO, TELEFONO_MESERO_OTRO],
      );
      // Un cliente: sin local y sin código, que es lo que PRD-004 §3 y
      // PRD-001 §12 dicen de una cuenta de cliente.
      await tx.consulta(
        `INSERT INTO pagaya.usuario (rol, nombre_pila, telefono) VALUES ('cliente', 'Camila', $1)`,
        [TELEFONO_CLIENTE],
      );
    });
  });

  after(async () => {
    if (acceso === undefined) return;
    await limpiar();
    await acceso.cerrar();
  });

  test("un mesero sin local no existe, y un cliente con local tampoco", async () => {
    // docs/arquitectura.md §9.3, literal: nulo para el cliente, obligatorio
    // para el personal. Escrito como equivalencia, las dos mitades fallan.
    await assert.rejects(
      () =>
        acceso.entreLocales("mesero sin local", (tx) =>
          tx.consulta(
            `INSERT INTO pagaya.usuario (rol, codigo, nombre_pila, telefono)
             VALUES ('mesero', 'sin-local', 'Nadie', '+56903069001')`,
          ),
        ),
      /usuario_local_segun_rol/,
    );

    await assert.rejects(
      () =>
        acceso.entreLocales("cliente con local", (tx) =>
          tx.consulta(
            `INSERT INTO pagaya.usuario (local_id, rol, nombre_pila, telefono)
             VALUES ($1, 'cliente', 'Nadie', '+56903069002')`,
            [UNO],
          ),
        ),
      /usuario_local_segun_rol/,
    );
  });

  test("el código es del personal: el cliente no tiene uno", async () => {
    await assert.rejects(
      () =>
        acceso.entreLocales("cliente con código del local", (tx) =>
          tx.consulta(
            `INSERT INTO pagaya.usuario (rol, codigo, nombre_pila, telefono)
             VALUES ('cliente', 'no-corresponde', 'Nadie', '+56903069003')`,
          ),
        ),
      /usuario_codigo_segun_rol/,
    );
  });

  test("un cliente no se convierte en personal del local", async () => {
    // La política de identidad tiene que dejar ver las filas de cliente desde
    // cualquier local —son de quien no pertenece a ninguno—, y eso abriría la
    // puerta a ascender un cliente a mesero propio con un UPDATE. Lo cierra el
    // disparador, con el argumento de §9.4: un titular tiene un rol.
    await assert.rejects(
      () =>
        acceso.conLocal(UNO, (tx) =>
          tx.consulta(
            `UPDATE pagaya.usuario SET rol = 'mesero', local_id = $1, codigo = 'colado'
              WHERE telefono = $2`,
            [UNO, TELEFONO_CLIENTE],
          ),
        ),
      /no se convierte en personal del local/,
    );
  });

  test("un mesero sí puede pasar a administrador (RF-A-03)", async () => {
    const filas = await acceso.conLocal(UNO, (tx) =>
      tx.consulta<{ rol: string }>(
        `UPDATE pagaya.usuario SET rol = 'admin' WHERE telefono = $1 RETURNING rol`,
        [TELEFONO_MESERO],
      ),
    );
    assert.deepEqual(filas, [{ rol: "admin" }]);
    await acceso.conLocal(UNO, (tx) =>
      tx.consulta(`UPDATE pagaya.usuario SET rol = 'mesero' WHERE telefono = $1`, [
        TELEFONO_MESERO,
      ]),
    );
  });

  test("el personal es de su local; al cliente no se le compara el local", async () => {
    const desdeUno = await acceso.conLocal(UNO, (tx) =>
      tx.consulta<{ telefono: string }>(
        `SELECT telefono FROM pagaya.usuario
          WHERE telefono = ANY($1::text[]) ORDER BY telefono`,
        [[TELEFONO_MESERO, TELEFONO_MESERO_OTRO, TELEFONO_CLIENTE]],
      ),
    );
    assert.deepEqual(
      desdeUno.map((f) => f.telefono),
      [TELEFONO_MESERO, TELEFONO_CLIENTE],
      "el mesero del otro local no se ve; el cliente sí, porque no es de ningún local",
    );

    // Sin local fijado solo se ven las cuentas de cliente. Es lo que hace
    // posible `porHuellaDeToken` (§9.3), la única búsqueda que no filtra por
    // local porque es la que establece de qué local es la petición: para el
    // personal, esa búsqueda va a tener que resolverse con la tabla de sesiones
    // —que no es de esta tarea (§9.4)—, no con esta.
    const sinLocal = await acceso.sinLocal((tx) =>
      tx.consulta<{ telefono: string }>(
        `SELECT telefono FROM pagaya.usuario WHERE telefono = ANY($1::text[])`,
        [[TELEFONO_MESERO, TELEFONO_MESERO_OTRO, TELEFONO_CLIENTE]],
      ),
    );
    assert.deepEqual(sinLocal.map((f) => f.telefono), [TELEFONO_CLIENTE]);
  });
});
