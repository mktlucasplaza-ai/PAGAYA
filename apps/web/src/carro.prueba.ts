/**
 * F1-31a: armar el carro con cantidad, notas y variantes (RF-C-04), sin
 * fusionar líneas del mismo producto.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { actualizarCantidad, actualizarNotas, agregarItem, carroVacio, quitarItem } from "./carro.ts";

let contador = 0;
const idDePrueba = () => `item-${++contador}`;

describe("el carro: cantidad, notas y variantes", () => {
  test("agregar un ítem con variantes y notas", () => {
    const carro = agregarItem(
      carroVacio(),
      { productoId: "prod-empanada", varianteIds: ["var-doble"], cantidad: 2, notas: "sin cebolla" },
      idDePrueba,
    );

    assert.deepEqual(carro.items, [
      { id: "item-1", productoId: "prod-empanada", varianteIds: ["var-doble"], cantidad: 2, notas: "sin cebolla" },
    ]);
  });

  test("sin variantes ni notas, quedan vacías por defecto", () => {
    const carro = agregarItem(carroVacio(), { productoId: "prod-sopa", cantidad: 1 }, idDePrueba);
    assert.equal(carro.items[0]!.varianteIds.length, 0);
    assert.equal(carro.items[0]!.notas, "");
  });

  test("agregar el mismo producto dos veces deja dos líneas, no fusiona la cantidad", () => {
    let carro = carroVacio();
    carro = agregarItem(carro, { productoId: "prod-empanada", cantidad: 1 }, idDePrueba);
    carro = agregarItem(carro, { productoId: "prod-empanada", cantidad: 1 }, idDePrueba);
    assert.equal(carro.items.length, 2);
    assert.notEqual(carro.items[0]!.id, carro.items[1]!.id);
  });

  test("una cantidad de cero o negativa no se puede agregar", () => {
    assert.throws(() => agregarItem(carroVacio(), { productoId: "prod-sopa", cantidad: 0 }, idDePrueba));
    assert.throws(() => agregarItem(carroVacio(), { productoId: "prod-sopa", cantidad: -1 }, idDePrueba));
  });

  test("quitar un ítem lo saca del carro", () => {
    let carro = agregarItem(carroVacio(), { productoId: "prod-sopa", cantidad: 1 }, idDePrueba);
    carro = quitarItem(carro, carro.items[0]!.id);
    assert.equal(carro.items.length, 0);
  });

  test("actualizar la cantidad a cero quita la línea", () => {
    let carro = agregarItem(carroVacio(), { productoId: "prod-sopa", cantidad: 1 }, idDePrueba);
    carro = actualizarCantidad(carro, carro.items[0]!.id, 0);
    assert.equal(carro.items.length, 0);
  });

  test("actualizar las notas de un ítem deja el resto intacto", () => {
    let carro = agregarItem(
      carroVacio(),
      { productoId: "prod-sopa", cantidad: 1, notas: "normal" },
      idDePrueba,
    );
    const id = carro.items[0]!.id;
    carro = actualizarNotas(carro, id, "bien picante");
    assert.equal(carro.items[0]!.notas, "bien picante");
    assert.equal(carro.items[0]!.cantidad, 1);
  });
});
