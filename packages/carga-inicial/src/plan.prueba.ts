/**
 * Pruebas del plan y de la idempotencia (F1-05).
 *
 * "Correrlo dos veces no duplica nada" es la exigencia del backlog, y acá se
 * verifica como propiedad: se aplica el plan, se vuelve a planificar sobre el
 * estado resultante y la segunda lista tiene que venir vacía. Todo sin
 * PostgreSQL: la mecánica trabaja contra el puerto `RepositorioCarga`, igual
 * que las migraciones de AT-7 contra el suyo.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { ORDEN_ENTIDADES, type Entidad, type LocalPiloto } from "./contrato.ts";
import { cargar, planificar, resumir, type Accion, type Cambio } from "./plan.ts";
import { repositorioMemoria } from "./repositorio-memoria.ts";
import { archivoEjemplo, validar } from "./validacion.ts";

type Json = Record<string, unknown>;

function base(): Json {
  return JSON.parse(readFileSync(archivoEjemplo(), "utf8")) as Json;
}

/** El ejemplo, validado. Si el ejemplo dejara de valer, estas pruebas no corren a ciegas. */
function piloto(crudo: Json = base()): LocalPiloto {
  const resultado = validar(crudo);
  assert.ok(resultado.ok, "el archivo de la prueba tiene que ser válido");
  return resultado.local;
}

function de(cambios: readonly Cambio[], entidad: Entidad, accion?: Accion): Cambio[] {
  return cambios.filter((c) => c.entidad === entidad && (accion === undefined || c.accion === accion));
}

describe("la primera carga", () => {
  test("crea todo lo que el archivo declara, y nada más", async () => {
    const repositorio = repositorioMemoria();
    const plan = await cargar(repositorio, piloto());

    assert.equal(de(plan.cambios, "local").length, 1);
    assert.equal(de(plan.cambios, "categoria").length, 5);
    assert.equal(de(plan.cambios, "producto").length, 15);
    assert.equal(de(plan.cambios, "variante").length, 14);
    assert.equal(de(plan.cambios, "zona").length, 3);
    assert.equal(de(plan.cambios, "mesa").length, 12);
    assert.equal(de(plan.cambios, "mesero").length, 3);
    assert.equal(de(plan.cambios, "turno").length, 2);
    assert.equal(de(plan.cambios, "asignacion").length, 24);
    assert.ok(plan.cambios.every((c) => c.accion === "crear"));
    assert.deepEqual(plan.sinCambios, []);
    assert.deepEqual(plan.huerfanos, []);
    assert.equal(repositorio.escrituras.length, 1, "todo el plan va en una sola escritura");
  });

  test("el orden del plan permite escribirlo tal cual: la zona antes que la mesa", async () => {
    const plan = await cargar(repositorioMemoria(), piloto());
    const posiciones = plan.cambios.map((c) => ORDEN_ENTIDADES.indexOf(c.entidad));
    assert.deepEqual(
      posiciones,
      [...posiciones].sort((a, b) => a - b),
      "el plan tiene que venir agrupado en el orden de ORDEN_ENTIDADES",
    );
  });
});

describe("la idempotencia", () => {
  test("la segunda corrida no produce cambios ni abre una escritura", async () => {
    const repositorio = repositorioMemoria();
    const local = piloto();

    const primera = await cargar(repositorio, local);
    assert.ok(primera.cambios.length > 0);

    const segunda = await cargar(repositorio, local);
    assert.deepEqual(segunda.cambios, [], "correrlo dos veces no debe escribir nada");
    assert.equal(segunda.sinCambios.length, primera.cambios.length);
    assert.equal(repositorio.escrituras.length, 1, "la segunda corrida no abre transacción");
  });

  test("tres corridas dejan exactamente el mismo estado", async () => {
    const repositorio = repositorioMemoria();
    const local = piloto();
    await cargar(repositorio, local);
    const despuesDeUna = JSON.stringify(repositorio.estado());
    await cargar(repositorio, local);
    await cargar(repositorio, local);
    assert.equal(JSON.stringify(repositorio.estado()), despuesDeUna);
  });
});

describe("un archivo que cambió", () => {
  test("cambiar un precio produce un solo actualizar, con el campo nombrado", async () => {
    const repositorio = repositorioMemoria();
    await cargar(repositorio, piloto());

    const b = base();
    const productos = (b["carta"] as Json)["productos"] as Json[];
    (productos[0] as Json)["precio"] = 5200;

    const plan = planificar(piloto(b), repositorio.estado());
    assert.equal(plan.cambios.length, 1);
    assert.equal(de(plan.cambios, "producto", "actualizar").length, 1);
    assert.equal(plan.cambios[0]?.clave, "empanada-queso");
    assert.deepEqual(plan.cambios[0]?.cambiados, ["precio"]);
  });

  test("un producto agotado por el mesero sobrevive a la carga (RF-M-12)", async () => {
    const repositorio = repositorioMemoria();
    const local = piloto();
    await cargar(repositorio, local);

    // Lo que pasa un martes a las ocho: el mesero marca el pescado como agotado.
    repositorio.tocar("producto", "pescado-del-dia", { disponible: false });

    const plan = planificar(local, repositorio.estado());
    assert.deepEqual(
      plan.cambios,
      [],
      "la disponibilidad se escribe al crear y no se vuelve a tocar",
    );
  });

  test("cambiar el precio de un producto agotado no lo repone", async () => {
    const repositorio = repositorioMemoria();
    await cargar(repositorio, piloto());
    repositorio.tocar("producto", "pescado-del-dia", { disponible: false });

    const b = base();
    const productos = (b["carta"] as Json)["productos"] as Json[];
    const pescado = productos.find((p) => p["sku"] === "pescado-del-dia") as Json;
    pescado["precio"] = 15900;

    const plan = planificar(piloto(b), repositorio.estado());
    assert.equal(plan.cambios.length, 1);
    assert.deepEqual(plan.cambios[0]?.cambiados, ["precio"]);
    assert.equal(
      plan.cambios[0]?.campos["disponible"],
      undefined,
      "un actualizar no puede llevar la disponibilidad",
    );

    await repositorio.escribir("demo-nunoa", plan.cambios);
    const despues = repositorio.estado().find((f) => f.clave === "pescado-del-dia");
    assert.equal(despues?.campos["disponible"], false);
    assert.equal(despues?.campos["precio"], 15900);
  });

  test("reasignar una mesa a otro mesero es un actualizar, no una mesa con dos meseros", async () => {
    const repositorio = repositorioMemoria();
    await cargar(repositorio, piloto());

    const b = base();
    const asignaciones = b["asignaciones"] as Json[];
    (asignaciones[2] as Json)["mesas"] = ["2", "3", "T1"];
    (asignaciones[3] as Json)["mesas"] = ["1", "4", "5", "6", "T2"];

    const plan = planificar(piloto(b), repositorio.estado());
    assert.equal(de(plan.cambios, "asignacion", "actualizar").length, 1);
    assert.equal(plan.cambios[0]?.clave, "cena/1");
    assert.equal(plan.cambios[0]?.campos["mesero"], "m-02");
    assert.deepEqual(plan.huerfanos, []);
  });

  test("quitar una mesa de un turno da de baja esa asignación (RF-A-04)", async () => {
    const repositorio = repositorioMemoria();
    await cargar(repositorio, piloto());

    const b = base();
    const asignaciones = b["asignaciones"] as Json[];
    (asignaciones[2] as Json)["mesas"] = ["1", "2", "3"];

    const plan = planificar(piloto(b), repositorio.estado());
    assert.equal(plan.cambios.length, 1);
    assert.equal(plan.cambios[0]?.accion, "baja");
    assert.equal(plan.cambios[0]?.clave, "cena/T1");

    await repositorio.escribir("demo-nunoa", plan.cambios);
    assert.equal(
      repositorio.estado().some((f) => f.entidad === "asignacion" && f.clave === "cena/T1"),
      false,
    );
  });
});

describe("lo que el archivo ya no nombra", () => {
  test("un producto retirado de la carta queda huérfano y no se borra", async () => {
    const repositorio = repositorioMemoria();
    await cargar(repositorio, piloto());

    const b = base();
    const carta = b["carta"] as Json;
    carta["productos"] = (carta["productos"] as Json[]).filter((p) => p["sku"] !== "piscola");

    const plan = planificar(piloto(b), repositorio.estado());
    assert.deepEqual(plan.cambios, [], "borrar un producto se llevaría los ítems que lo citan");
    assert.deepEqual(
      plan.huerfanos.map((h) => `${h.entidad}/${h.clave}`),
      ["producto/piscola"],
    );
  });

  test("las asignaciones de un turno que ya no se declara quedan huérfanas, no de baja", async () => {
    const repositorio = repositorioMemoria();
    await cargar(repositorio, piloto());

    const b = base();
    b["turnos"] = (b["turnos"] as Json[]).filter((t) => t["slug"] !== "almuerzo");
    b["asignaciones"] = (b["asignaciones"] as Json[]).filter((a) => a["turno"] !== "almuerzo");

    const plan = planificar(piloto(b), repositorio.estado());
    assert.deepEqual(plan.cambios, [], "de un turno que el archivo no nombra no se afirma nada");
    assert.equal(plan.huerfanos.length, 13, "el turno almuerzo y sus 12 asignaciones");
    assert.ok(plan.huerfanos.some((h) => h.entidad === "turno" && h.clave === "almuerzo"));
  });
});

describe("el resumen", () => {
  test("nombra cada acción y cierra con el total", async () => {
    const plan = await cargar(repositorioMemoria(), piloto());
    const lineas = resumir(plan);
    assert.match(lineas[0] ?? "", /^ {2}crear\s+local\s+demo-nunoa$/);
    assert.match(lineas[lineas.length - 1] ?? "", /^79 por crear, 0 por actualizar, 0 por dar de baja/);
  });
});
