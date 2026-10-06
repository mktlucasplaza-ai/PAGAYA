/**
 * Pruebas de la validación del archivo de carga (F1-05).
 *
 * Ninguna necesita base de datos: el archivo se revisa antes de que exista una
 * transacción, y por eso se puede probar hoy, con las tablas de la carta y de
 * la mesa todavía sin escribir.
 *
 * Cada caso parte del ejemplo versionado y le rompe una cosa. Eso es a
 * propósito: una prueba que arma su propio archivo mínimo deja de probar el
 * archivo que el local piloto usa de verdad.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { archivoEjemplo, tokenQrDerivado, validar, validarArchivo } from "./validacion.ts";

type Json = Record<string, unknown>;

function base(): Json {
  return JSON.parse(readFileSync(archivoEjemplo(), "utf8")) as Json;
}

function listaDe(contenedor: Json, campo: string): Json[] {
  return contenedor[campo] as Json[];
}

function fila(lista: Json[], i: number): Json {
  return lista[i] as Json;
}

function productos(b: Json): Json[] {
  return listaDe(b["carta"] as Json, "productos");
}

/** Las rutas de los problemas, que es lo que el humano lee para corregir. */
function rutas(crudo: unknown): string[] {
  const resultado = validar(crudo);
  assert.equal(resultado.ok, false, "se esperaba que el archivo fuera rechazado");
  return resultado.ok ? [] : resultado.problemas.map((p) => p.ruta);
}

function mensajes(crudo: unknown): string {
  const resultado = validar(crudo);
  return resultado.ok ? "" : resultado.problemas.map((p) => `${p.ruta}: ${p.mensaje}`).join("\n");
}

describe("el ejemplo versionado", () => {
  test("es válido y no deja avisos", () => {
    const resultado = validarArchivo(archivoEjemplo());
    if (!resultado.ok) {
      assert.fail(`el ejemplo no valida:\n${resultado.problemas.map((p) => `${p.ruta}: ${p.mensaje}`).join("\n")}`);
    }
    assert.deepEqual(resultado.avisos, [], "el ejemplo debería cubrir todas sus mesas y categorías");
    assert.equal(resultado.local.mesas.length, 12);
    assert.equal(resultado.local.asignaciones.length, 24, "12 mesas en 2 turnos");
  });

  test("no trae datos reales: los teléfonos están en un rango que no se asigna", () => {
    const resultado = validarArchivo(archivoEjemplo());
    assert.ok(resultado.ok);
    for (const mesero of resultado.local.meseros) {
      assert.match(
        mesero.telefono,
        /^\+5690000\d{4}$/,
        `${mesero.codigo}: el ejemplo del repositorio no puede llevar un teléfono real`,
      );
    }
  });

  test("cada mesa queda con su token de QR", () => {
    const resultado = validarArchivo(archivoEjemplo());
    assert.ok(resultado.ok);
    for (const mesa of resultado.local.mesas) {
      assert.match(mesa.qr_token, /^[0-9a-f]{12}$/);
    }
  });
});

describe("el contrato del archivo", () => {
  test("una clave desconocida se rechaza en lugar de ignorarse", () => {
    const b = base();
    fila(productos(b), 0)["precios"] = 5900;
    assert.deepEqual(rutas(b), ["carta.productos[0].precios"]);
  });

  test("un formato que este código no conoce se rechaza sin interpretar el resto", () => {
    const b = base();
    b["formato"] = 2;
    const problemas = rutas(b);
    assert.deepEqual(problemas, ["formato"], "no tiene sentido opinar sobre otro contrato");
  });

  test("se reportan todos los problemas de la corrida, no el primero", () => {
    const b = base();
    fila(productos(b), 0)["precio"] = -1;
    fila(productos(b), 1)["nombre"] = "";
    fila(listaDe(b, "mesas"), 0)["capacidad"] = 0;
    assert.deepEqual(rutas(b), [
      "carta.productos[0].precio",
      "carta.productos[1].nombre",
      "mesas[0].capacidad",
    ]);
  });

  test("un JSON mal formado y un archivo que no existe son problemas, no excepciones", () => {
    const inexistente = validarArchivo("/tmp/no-existe-este-archivo-de-carga.json");
    assert.equal(inexistente.ok, false);
    assert.equal(validar("[]").ok, false);
    assert.equal(validar(null).ok, false);
  });
});

describe("la carta", () => {
  test("un precio con decimales se rechaza: el peso chileno no los tiene", () => {
    const b = base();
    fila(productos(b), 0)["precio"] = 4500.5;
    assert.match(mensajes(b), /decimales/);
  });

  test("un producto que apunta a una categoría inexistente se rechaza", () => {
    const b = base();
    fila(productos(b), 0)["categoria"] = "sandwiches";
    assert.match(mensajes(b), /'sandwiches': la categoría no existe/);
  });

  test("dos productos con el mismo sku se rechazan", () => {
    const b = base();
    fila(productos(b), 1)["sku"] = fila(productos(b), 0)["sku"];
    assert.match(mensajes(b), /'empanada-queso': el producto se repite/);
  });

  test("una variante no puede dejar el precio del producto en negativo", () => {
    const b = base();
    const producto = fila(productos(b), 0);
    producto["variantes"] = [{ slug: "gratis", nombre: "Gratis", precio_delta: -5000 }];
    assert.match(mensajes(b), /no puede hacerlo negativo/);
  });

  test("una categoría sin productos es un aviso, no un error", () => {
    const b = base();
    listaDe(b["carta"] as Json, "categorias").push({ slug: "vinos", nombre: "Vinos", orden: 9 });
    const resultado = validar(b);
    assert.ok(resultado.ok);
    assert.equal(resultado.avisos.length, 1);
    assert.match(resultado.avisos[0]?.mensaje ?? "", /'vinos' no tiene productos/);
  });
});

describe("el local", () => {
  test("una zona horaria inexistente se rechaza", () => {
    const b = base();
    (b["local"] as Json)["zona_horaria"] = "America/Santiaago";
    assert.match(mensajes(b), /no es una zona horaria IANA/);
  });

  test("un alias de zona horaria se rechaza nombrando la forma canónica", () => {
    const b = base();
    (b["local"] as Json)["zona_horaria"] = "Chile/Continental";
    assert.match(mensajes(b), /escribe la forma canónica 'America\/Santiago'/);
  });

  test("una moneda distinta de CLP se rechaza: el MVP opera en Chile", () => {
    const b = base();
    (b["local"] as Json)["moneda"] = "ARS";
    assert.match(mensajes(b), /la única moneda es CLP/);
  });
});

describe("las mesas y su QR", () => {
  test("el token del QR se deriva del local y del número, y es estable", () => {
    const primera = tokenQrDerivado("demo-nunoa", "T1");
    assert.equal(primera, tokenQrDerivado("demo-nunoa", "T1"));
    assert.notEqual(primera, tokenQrDerivado("demo-nunoa", "T2"));
    assert.notEqual(primera, tokenQrDerivado("otro-local", "T1"));
  });

  test("un token declarado en el archivo manda sobre el derivado", () => {
    const b = base();
    fila(listaDe(b, "mesas"), 0)["qr_token"] = "mesaunoqr01";
    const resultado = validar(b);
    assert.ok(resultado.ok);
    assert.equal(resultado.local.mesas[0]?.qr_token, "mesaunoqr01");
  });

  test("dos mesas con el mismo número se rechazan", () => {
    const b = base();
    fila(listaDe(b, "mesas"), 1)["numero"] = "1";
    assert.match(mensajes(b), /'1': la mesa se repite/);
  });

  test("una mesa en una zona que no existe se rechaza", () => {
    const b = base();
    fila(listaDe(b, "mesas"), 0)["zona"] = "patio";
    assert.match(mensajes(b), /'patio': la zona no existe/);
  });
});

describe("los meseros y sus asignaciones", () => {
  test("dos meseros con el mismo teléfono se rechazan: una cuenta por teléfono", () => {
    const b = base();
    fila(listaDe(b, "meseros"), 1)["telefono"] = "+56900000001";
    assert.match(mensajes(b), /'\+56900000001': el teléfono se repite/);
  });

  test("una mesa asignada a dos meseros en el mismo turno se rechaza", () => {
    const b = base();
    const asignaciones = listaDe(b, "asignaciones");
    (fila(asignaciones, 3)["mesas"] as string[]).push("1");
    assert.match(mensajes(b), /ya está asignada a 'm-01' en el turno 'cena'/);
  });

  test("la misma mesa en turnos distintos es lo normal, no un problema", () => {
    const resultado = validarArchivo(archivoEjemplo());
    assert.ok(resultado.ok);
    const mesaUno = resultado.local.asignaciones.filter((a) => a.mesa === "1");
    assert.deepEqual(
      mesaUno.map((a) => a.turno).sort(),
      ["almuerzo", "cena"],
    );
  });

  test("una mesa sin mesero en un turno es un aviso, no un error", () => {
    const b = base();
    const asignaciones = listaDe(b, "asignaciones");
    fila(asignaciones, 2)["mesas"] = ["1", "2", "3"];
    const resultado = validar(b);
    assert.ok(resultado.ok);
    assert.equal(resultado.avisos.length, 1);
    assert.match(resultado.avisos[0]?.mensaje ?? "", /'T1' no tiene mesero en el turno 'cena'/);
    assert.match(resultado.avisos[0]?.mensaje ?? "", /escalan al administrador/);
  });

  test("una asignación a un mesero o a un turno que no existe se rechaza", () => {
    const b = base();
    const asignaciones = listaDe(b, "asignaciones");
    fila(asignaciones, 0)["mesero"] = "m-99";
    fila(asignaciones, 1)["turno"] = "once";
    const salida = mensajes(b);
    assert.match(salida, /'m-99': el mesero no existe/);
    assert.match(salida, /'once': el turno no existe/);
  });
});
