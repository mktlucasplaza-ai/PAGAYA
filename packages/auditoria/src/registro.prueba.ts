/**
 * Lo que F1-04 promete, verificado contra PostgreSQL: el cambio de dominio y su
 * fila de auditoría **se confirman o se revierten juntos**.
 *
 * Esto no se puede probar con un doble en memoria, y no por comodidad: lo que
 * se afirma es una propiedad de la transacción de PostgreSQL (docs/arquitectura.md
 * §15, AT-31). Un repositorio falso que "revierte" porque alguien escribió que
 * revierta probaría que la prueba sabe lo que quiere que pase, nada más.
 *
 * Por qué esta prueba no borra su local al terminar, al revés que las demás: la
 * tabla es append-only (AT-30) y `auditoria.local_id` no tiene cascada, así que
 * una vez que el local tiene auditoría no se puede borrar. Eso **es** la
 * decisión, no un estorbo de la prueba: el local se desactiva, no se borra. Las
 * filas de esta prueba se vuelven a usar en la corrida siguiente, y cada caso
 * mira solo las suyas —filtradas por su `entidad_id`, que es una comanda nueva
 * cada vez—, así que acumular no cambia ningún resultado.
 */
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { accesoDelAmbiente, type Acceso, type Transaccion } from "@pagaya/base-datos";
import { ErrorPagaya } from "@pagaya/nucleo";

import { registrar, SISTEMA, type Actor } from "./registro.ts";

const hayBaseDatos = (process.env["PAGAYA_BD_URL"] ?? "").length > 0;

const LOCAL = "cccccccc-0000-4000-8000-00000000f104";
/** Fuera del rango que se asigna en Chile, como el ejemplo del cargador. */
const TELEFONO_MESERO = "+56904100001";

describe(
  "la auditoría se escribe en la transacción del cambio (F1-04)",
  { skip: hayBaseDatos ? false : "sin PAGAYA_BD_URL" },
  () => {
    let acceso: Acceso;
    let mesaId: string;
    let mesero: Actor;

    /** `tx.una` devuelve `F | null`; acá siempre hay fila y si no la hay, es un error de la prueba. */
    function soloUna<F>(fila: F | null, que: string): F {
      if (fila === null) throw new Error(`la prueba esperaba ${que} y no volvió ninguna fila`);
      return fila;
    }

    before(async () => {
      acceso = await accesoDelAmbiente();

      // Siembra idempotente: las filas de la corrida anterior siguen ahí
      // (ver el comentario de arriba).
      await acceso.entreLocales("sembrar el local de esta prueba", async (tx) => {
        await tx.consulta(
          `INSERT INTO pagaya.local (id, slug, nombre, zona_horaria)
             VALUES ($1, 'ensayo-f104', 'Ensayo F1-04', 'America/Santiago')
             ON CONFLICT (id) DO NOTHING`,
          [LOCAL],
        );
        await tx.consulta(
          `INSERT INTO pagaya.usuario (local_id, rol, codigo, nombre_pila, telefono)
             VALUES ($1, 'mesero', 'ensayo-f104', 'Ana', $2)
             ON CONFLICT (telefono) DO NOTHING`,
          [LOCAL, TELEFONO_MESERO],
        );
      });

      await acceso.conLocal(LOCAL, async (tx) => {
        await tx.consulta(
          `INSERT INTO pagaya.zona (local_id, slug, nombre) VALUES ($1, 'salon', 'Salón')
             ON CONFLICT (local_id, slug) DO NOTHING`,
          [LOCAL],
        );
        const zona = soloUna(
          await tx.una<{ id: string }>(
            `SELECT id FROM pagaya.zona WHERE local_id = $1 AND slug = 'salon'`,
            [LOCAL],
          ),
          "la zona de la prueba",
        );
        await tx.consulta(
          `INSERT INTO pagaya.mesa (local_id, zona_id, numero, capacidad, qr_token)
             VALUES ($1, $2, '1', 4, 'ensayo-f104-qr-mesa-1')
             ON CONFLICT (local_id, numero) DO NOTHING`,
          [LOCAL, zona.id],
        );
        mesaId = soloUna(
          await tx.una<{ id: string }>(
            `SELECT id FROM pagaya.mesa WHERE local_id = $1 AND numero = '1'`,
            [LOCAL],
          ),
          "la mesa de la prueba",
        ).id;
        const usuario = soloUna(
          await tx.una<{ id: string }>(`SELECT id FROM pagaya.usuario WHERE telefono = $1`, [
            TELEFONO_MESERO,
          ]),
          "el mesero de la prueba",
        );
        mesero = { tipo: "usuario", usuarioId: usuario.id, rol: "mesero" };
      });
    });

    after(async () => {
      if (acceso === undefined) return;
      // Las comandas sí se borran: `auditoria.entidad_id` no es clave foránea,
      // justamente para que la fila sobreviva a lo que describe (AT-30).
      await acceso.conLocal(LOCAL, (tx) =>
        tx.consulta(`DELETE FROM pagaya.comanda WHERE local_id = $1`, [LOCAL]),
      );
      await acceso.cerrar();
    });

    /** Una comanda abierta nueva. Borra la anterior: el índice de F1-10a deja una por mesa. */
    async function comandaAbierta(): Promise<string> {
      return acceso.conLocal(LOCAL, async (tx) => {
        await tx.consulta(`DELETE FROM pagaya.comanda WHERE local_id = $1`, [LOCAL]);
        return soloUna(
          await tx.una<{ id: string }>(
            `INSERT INTO pagaya.comanda (local_id, mesa_id) VALUES ($1, $2) RETURNING id`,
            [LOCAL, mesaId],
          ),
          "la comanda recién abierta",
        ).id;
      });
    }

    function estadoDe(comandaId: string): Promise<string> {
      return acceso.conLocal(LOCAL, async (tx) =>
        soloUna(
          await tx.una<{ estado: string }>(`SELECT estado FROM pagaya.comanda WHERE id = $1`, [
            comandaId,
          ]),
          "el estado de la comanda",
        ).estado,
      );
    }

    type FilaAuditada = {
      accion: string;
      resultado: string;
      motivo: string | null;
      actor_id: string | null;
      actor_rol: string | null;
      datos: Record<string, unknown>;
    };

    function auditoriaDe(comandaId: string): Promise<FilaAuditada[]> {
      return acceso.conLocal(LOCAL, (tx) =>
        tx.consulta<FilaAuditada>(
          `SELECT accion, resultado, motivo, actor_id, actor_rol, datos
             FROM pagaya.auditoria
             WHERE entidad = 'comanda' AND entidad_id = $1
             ORDER BY id`,
          [comandaId],
        ),
      );
    }

    test("la anulación y su fila de auditoría se confirman juntas", async () => {
      const comandaId = await comandaAbierta();

      await acceso.conLocal(LOCAL, async (tx) => {
        await tx.consulta(`UPDATE pagaya.comanda SET estado = 'anulada' WHERE id = $1`, [
          comandaId,
        ]);
        await registrar(tx, {
          accion: "comanda_anulada",
          entidad: "comanda",
          entidadId: comandaId,
          actor: mesero,
          motivo: "la mesa se fue sin consumir",
          datos: { mesa: mesaId },
        });
      });

      assert.equal(await estadoDe(comandaId), "anulada");
      const filas = await auditoriaDe(comandaId);
      assert.equal(filas.length, 1);
      assert.equal(filas[0]?.accion, "comanda_anulada");
      assert.equal(filas[0]?.resultado, "aplicado");
      assert.equal(filas[0]?.motivo, "la mesa se fue sin consumir");
      assert.equal(filas[0]?.actor_rol, "mesero");
      assert.deepEqual(filas[0]?.datos, { mesa: mesaId });
    });

    test("si el cambio falla después de auditarlo, la fila se va con él", async () => {
      const comandaId = await comandaAbierta();

      // El fallo va **después** de las dos escrituras a propósito: es el caso
      // que importa. Si la auditoría se escribiera por su cuenta —otra
      // transacción, otra conexión, un `await` suelto—, la fila quedaría
      // contando una anulación que nunca pasó.
      await assert.rejects(
        () =>
          acceso.conLocal(LOCAL, async (tx) => {
            await tx.consulta(`UPDATE pagaya.comanda SET estado = 'anulada' WHERE id = $1`, [
              comandaId,
            ]);
            await registrar(tx, {
              accion: "comanda_anulada",
              entidad: "comanda",
              entidadId: comandaId,
              actor: mesero,
              motivo: "se anula y después algo falla",
            });
            throw new Error("el paso siguiente falla");
          }),
        /el paso siguiente falla/,
      );

      assert.equal(await estadoDe(comandaId), "abierta");
      assert.deepEqual(await auditoriaDe(comandaId), []);
    });

    test("una fila escrita no se corrige ni se borra", async () => {
      const comandaId = await comandaAbierta();
      await acceso.conLocal(LOCAL, (tx) =>
        registrar(tx, {
          accion: "comanda_anulada",
          entidad: "comanda",
          entidadId: comandaId,
          actor: mesero,
          motivo: "para intentar corregirla después",
        }),
      );

      // `pagaya_app` no tiene UPDATE ni DELETE sobre la tabla: el permiso es la
      // primera de las dos piezas del append-only (migración 0005).
      await assert.rejects(
        () =>
          acceso.conLocal(LOCAL, (tx) =>
            tx.consulta(`UPDATE pagaya.auditoria SET motivo = 'otro' WHERE entidad_id = $1`, [
              comandaId,
            ]),
          ),
        /permission denied|append-only/,
      );
      await assert.rejects(
        () =>
          acceso.conLocal(LOCAL, (tx) =>
            tx.consulta(`DELETE FROM pagaya.auditoria WHERE entidad_id = $1`, [comandaId]),
          ),
        /permission denied|append-only/,
      );

      assert.equal((await auditoriaDe(comandaId)).length, 1);
    });

    test("el intento rechazado se registra, y sin motivo la base no lo acepta", async () => {
      const comandaId = await comandaAbierta();

      // AT-4, regla 5: el rechazo se registra con actor, comanda y motivo.
      await acceso.conLocal(LOCAL, (tx) =>
        registrar(tx, {
          accion: "descuento_rechazado",
          entidad: "comanda",
          entidadId: comandaId,
          actor: SISTEMA,
          resultado: "rechazado",
          motivo: "ningún participante tiene beneficio activo",
        }),
      );

      const filas = await auditoriaDe(comandaId);
      assert.equal(filas.length, 1);
      assert.equal(filas[0]?.resultado, "rechazado");
      assert.equal(filas[0]?.actor_id, null, "un rechazo del sistema no tiene usuario");

      await assert.rejects(
        () =>
          acceso.conLocal(LOCAL, (tx) =>
            registrar(tx, {
              accion: "descuento_rechazado",
              entidad: "comanda",
              entidadId: comandaId,
              actor: SISTEMA,
              resultado: "rechazado",
            }),
          ),
        /auditoria_rechazo_con_motivo/,
      );
      assert.equal((await auditoriaDe(comandaId)).length, 1);
    });

    test("dos filas de la misma transacción comparten el instante y las ordena el id", async () => {
      const comandaId = await comandaAbierta();

      const [primera, segunda] = await acceso.conLocal(LOCAL, async (tx) => [
        await registrar(tx, {
          accion: "item_corregido",
          entidad: "comanda",
          entidadId: comandaId,
          actor: mesero,
          motivo: "el cliente pidió una cantidad distinta",
        }),
        await registrar(tx, {
          accion: "item_corregido",
          entidad: "comanda",
          entidadId: comandaId,
          actor: mesero,
          motivo: "y después otra",
        }),
      ]);

      // `ocurrido_en` es `now()`, el instante de la transacción: las dos filas
      // lo comparten letra por letra. Por eso el orden de escritura es el `id`
      // y no la marca de tiempo (migración 0005).
      assert.deepEqual(primera?.ocurridoEn, segunda?.ocurridoEn);
      assert.ok(
        BigInt(segunda?.id ?? "0") > BigInt(primera?.id ?? "0"),
        "la fila escrita después tiene un id mayor",
      );
      assert.deepEqual(
        (await auditoriaDe(comandaId)).map((f) => f.motivo),
        ["el cliente pidió una cantidad distinta", "y después otra"],
      );
    });

    test("sin un local fijado, registrar se niega antes de consultar", async () => {
      const intento = (tx: Transaccion) =>
        registrar(tx, {
          accion: "comanda_anulada",
          entidad: "comanda",
          entidadId: LOCAL,
          actor: SISTEMA,
          motivo: "no debería llegar a escribirse",
        });

      const esDeAuditoria = (error: unknown) =>
        error instanceof ErrorPagaya && error.codigo === "auditoria_invalida";

      // `sin_local` escribiría la fila en ningún local; `entre_locales`, en el
      // local de nadie. Las dos se rechazan en TypeScript y no en la base,
      // porque la base solo puede decir "NULL en una columna NOT NULL".
      await assert.rejects(() => acceso.sinLocal(intento), esDeAuditoria);
      await assert.rejects(
        () => acceso.entreLocales("auditar desde fuera de un local", intento),
        esDeAuditoria,
      );
    });
  },
);
