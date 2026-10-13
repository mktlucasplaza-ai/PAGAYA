/**
 * F1-31a, "Terminada cuando": recargar la página con el carro armado lo
 * encuentra intacto. Sin navegador ni `jsdom` (AT-95, §46): un `Almacen` falso
 * que guarda en un `Map` hace de `localStorage`, y dos llamadas independientes
 * a `leerCarro` sobre el mismo almacén simulan la página antes y después de
 * recargar.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { agregarItem, carroVacio } from "./carro.ts";
import { claveCarro, leerCarro, persistirCarro, vaciarCarro, type Almacen } from "./carroAlmacenado.ts";

function almacenDePrueba(): Almacen {
  const datos = new Map<string, string>();
  return {
    getItem: (clave) => datos.get(clave) ?? null,
    setItem: (clave, valor) => void datos.set(clave, valor),
    removeItem: (clave) => void datos.delete(clave),
  };
}

const LOCAL = "cccccccc-0000-4000-8000-0000000030b1";

describe("el carro sobrevive a recargar la página", () => {
  test("lo que se persiste antes de recargar es lo que se lee después", () => {
    const almacen = almacenDePrueba();
    const carroArmado = agregarItem(
      carroVacio(),
      { productoId: "prod-empanada", varianteIds: ["var-doble"], cantidad: 2, notas: "sin cebolla" },
      () => "item-1",
    );

    persistirCarro(carroArmado, LOCAL, almacen);
    // "recargar la página": una lectura nueva, sin ningún estado en memoria.
    const carroTrasRecargar = leerCarro(LOCAL, almacen);

    assert.deepEqual(carroTrasRecargar, carroArmado);
  });

  test("sin nada guardado, el carro es uno vacío, no un error", () => {
    const almacen = almacenDePrueba();
    assert.deepEqual(leerCarro(LOCAL, almacen), carroVacio());
  });

  test("un dato corrupto en el almacén no rompe la lectura", () => {
    const almacen = almacenDePrueba();
    almacen.setItem(claveCarro(LOCAL), "{ no es json válido");
    assert.deepEqual(leerCarro(LOCAL, almacen), carroVacio());
  });

  test("cada local tiene su propia clave: el carro de uno no se mezcla con el de otro", () => {
    const almacen = almacenDePrueba();
    const otroLocal = "dddddddd-0000-4000-8000-0000000030b2";
    persistirCarro(
      agregarItem(carroVacio(), { productoId: "prod-sopa", cantidad: 1 }, () => "item-1"),
      LOCAL,
      almacen,
    );

    assert.deepEqual(leerCarro(otroLocal, almacen), carroVacio());
  });

  test("vaciar el carro lo deja como si nunca se hubiera guardado nada", () => {
    const almacen = almacenDePrueba();
    persistirCarro(
      agregarItem(carroVacio(), { productoId: "prod-sopa", cantidad: 1 }, () => "item-1"),
      LOCAL,
      almacen,
    );
    vaciarCarro(LOCAL, almacen);
    assert.deepEqual(leerCarro(LOCAL, almacen), carroVacio());
  });
});
