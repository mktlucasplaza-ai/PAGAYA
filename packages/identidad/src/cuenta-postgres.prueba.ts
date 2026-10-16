/**
 * Lo que la fila de F1-21a exige, verificado contra PostgreSQL: **un segundo
 * registro con el mismo teléfono reutiliza la cuenta, no crea otra**
 * (RF-C-02 mod., PRD-004 §3 y §9 criterio 5).
 *
 * Por qué contra PostgreSQL y no contra `repositorioCuentasEnMemoria`: lo que
 * se afirma no es que una función devuelva lo que la prueba espera, es que la
 * restricción `usuario_telefono_unico` de la migración 0003 y una sola
 * sentencia alcanzan para que **dos registros simultáneos** no creen dos
 * cuentas ni fallen (arquitectura.md §32, AT-65). Es el mismo argumento con el
 * que §15 puso la prueba de F1-04 contra la base de verdad: un doble que
 * "reutiliza" porque alguien escribió que reutilice prueba que la prueba sabe
 * lo que quiere que pase, nada más.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { accesoDelAmbiente, type Acceso } from "@pagaya/base-datos";

import { altaDeCuenta, type AltaDeCuenta } from "./cuenta.ts";
import { repositorioCuentasEnPostgres } from "./cuenta-postgres.ts";

const hayBaseDatos = (process.env["PAGAYA_BD_URL"] ?? "").length > 0;

const LOCAL = "cccccccc-0000-4000-8000-0000000f121a";
/** Fuera del rango que se asigna en Chile, como el ejemplo del cargador y la prueba de F1-04. */
const TELEFONO_REUSO = "+56904121001";
const TELEFONO_NOMBRE = "+56904121002";
const TELEFONO_PARALELO = "+56904121003";
const TELEFONO_MESERO = "+56904121009";

const TELEFONOS = [TELEFONO_REUSO, TELEFONO_NOMBRE, TELEFONO_PARALELO];

describe(
  "una cuenta por teléfono, en una sola operación (F1-21a)",
  { skip: hayBaseDatos ? false : "sin PAGAYA_BD_URL" },
  () => {
    let acceso: Acceso;
    let alta: (nombrePila: string, telefono: string) => Promise<AltaDeCuenta>;

    /** Cuántas cuentas hay con ese teléfono. Es la pregunta que la fila del backlog hace. */
    async function cuantas(telefono: string): Promise<number> {
      const fila = await acceso.sinLocal((tx) =>
        tx.una<{ cuantas: string }>(
          `SELECT count(*)::text AS cuantas FROM pagaya.usuario WHERE telefono = $1`,
          [telefono],
        ),
      );
      return Number(fila?.cuantas ?? "-1");
    }

    async function limpiarCuentas(): Promise<void> {
      await acceso.sinLocal((tx) =>
        tx.consulta(`DELETE FROM pagaya.usuario WHERE telefono = ANY($1::text[])`, [TELEFONOS]),
      );
    }

    before(async () => {
      acceso = await accesoDelAmbiente();
      await limpiarCuentas();
      // El local y su mesero: borrar el local arrastra al mesero (ON DELETE
      // CASCADE), así que la siembra empieza por borrarlo.
      await acceso.entreLocales("sembrar el local y el mesero de esta prueba", async (tx) => {
        await tx.consulta(`DELETE FROM pagaya.local WHERE id = $1 OR slug = 'ensayo-f121a'`, [
          LOCAL,
        ]);
        await tx.consulta(
          `INSERT INTO pagaya.local (id, slug, nombre, zona_horaria)
             VALUES ($1, 'ensayo-f121a', 'Ensayo F1-21a', 'America/Santiago')`,
          [LOCAL],
        );
        await tx.consulta(
          `INSERT INTO pagaya.usuario (local_id, rol, codigo, nombre_pila, telefono)
             VALUES ($1, 'mesero', 'ensayo-f121a', 'Ana', $2)`,
          [LOCAL, TELEFONO_MESERO],
        );
      });

      const repositorio = repositorioCuentasEnPostgres(acceso);
      alta = (nombrePila, telefono) => altaDeCuenta({ repositorio, datos: { nombrePila, telefono } });
    });

    after(async () => {
      if (acceso === undefined) return;
      await limpiarCuentas();
      await acceso.entreLocales("borrar el local de esta prueba", (tx) =>
        tx.consulta(`DELETE FROM pagaya.local WHERE id = $1`, [LOCAL]),
      );
      await acceso.cerrar();
    });

    test("un segundo registro con el mismo teléfono entra a la cuenta existente", async () => {
      const primera = await alta("Lucas", TELEFONO_REUSO);
      const segunda = await alta("Lucas", TELEFONO_REUSO);

      assert.ok(primera.ok && segunda.ok);
      assert.equal(primera.reusada, false);
      assert.equal(segunda.reusada, true);
      assert.equal(segunda.cuenta.id, primera.cuenta.id);
      assert.equal(await cuantas(TELEFONO_REUSO), 1);
    });

    test("la cuenta nace cliente: sin local y sin código", async () => {
      const cuenta = await alta("Lucas", TELEFONO_NOMBRE);
      assert.ok(cuenta.ok);

      const fila = await acceso.sinLocal((tx) =>
        tx.una<{ rol: string; local_id: string | null; codigo: string | null; nombre_pila: string }>(
          `SELECT rol, local_id, codigo, nombre_pila FROM pagaya.usuario WHERE id = $1`,
          [cuenta.cuenta.id],
        ),
      );
      assert.deepEqual(fila, {
        rol: "cliente",
        local_id: null,
        codigo: null,
        nombre_pila: "Lucas",
      });
    });

    test("el reingreso no renombra la cuenta ni en la base", async () => {
      // La cuenta ya existe desde la prueba anterior; si no, este alta la crea.
      const primera = await alta("Lucas", TELEFONO_NOMBRE);
      const reingreso = await alta("Otro Nombre", TELEFONO_NOMBRE);

      assert.ok(primera.ok && reingreso.ok);
      assert.equal(reingreso.cuenta.nombrePila, "Lucas");
      const fila = await acceso.sinLocal((tx) =>
        tx.una<{ nombre_pila: string }>(`SELECT nombre_pila FROM pagaya.usuario WHERE id = $1`, [
          reingreso.cuenta.id,
        ]),
      );
      assert.deepEqual(fila, { nombre_pila: "Lucas" });
    });

    test("dos registros simultáneos con el mismo teléfono dejan una sola cuenta", async () => {
      // Lo que esta prueba separa de la de arriba: ahí los dos registros van en
      // orden, acá se cruzan. Con un `SELECT` seguido de un `INSERT`, los dos
      // leerían "no existe" y uno se caería contra `usuario_telefono_unico`;
      // con una sola sentencia, el segundo espera a que el primero confirme y
      // actualiza la fila que ya está.
      const [una, otra] = await Promise.all([
        alta("Lucas", TELEFONO_PARALELO),
        alta("Lucas", TELEFONO_PARALELO),
      ]);

      assert.ok(una.ok, `el primer registro paralelo falló: ${JSON.stringify(una)}`);
      assert.ok(otra.ok, `el segundo registro paralelo falló: ${JSON.stringify(otra)}`);
      assert.equal(una.cuenta.id, otra.cuenta.id);
      // Exactamente uno dio de alta; el otro entró a la cuenta del primero.
      assert.deepEqual([una.reusada, otra.reusada].sort(), [false, true]);
      assert.equal(await cuantas(TELEFONO_PARALELO), 1);
    });

    test("el teléfono de un mesero se rechaza y su fila queda intacta", async () => {
      const rechazo = await alta("Ana", TELEFONO_MESERO);
      assert.deepEqual(rechazo, { ok: false, motivo: "telefono_de_personal" });

      const fila = await acceso.conLocal(LOCAL, (tx) =>
        tx.una<{ rol: string; nombre_pila: string }>(
          `SELECT rol, nombre_pila FROM pagaya.usuario WHERE telefono = $1`,
          [TELEFONO_MESERO],
        ),
      );
      assert.deepEqual(fila, { rol: "mesero", nombre_pila: "Ana" });
    });
  },
);
