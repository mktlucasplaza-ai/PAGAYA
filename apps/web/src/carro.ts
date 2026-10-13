/**
 * El carro del cliente (F1-31a): RF-C-04 pide armar el pedido con cantidad,
 * notas al ítem y variantes, y la fila exige que sobreviva a recargar la
 * página. `@pagaya/web` solo puede importar `@pagaya/contrato` (fronteras.json),
 * así que un ítem solo guarda los ids de `ProductoCarta` y `VarianteCarta` que
 * ya sirvió F1-30a, no una copia de sus datos: el precio y el nombre se leen
 * de la carta cuando hace falta mostrarlos, nunca del carro (arquitectura.md
 * §47, AT-97).
 *
 * Son funciones puras: nada de `localStorage` ni `document` acá (sigue AT-95,
 * §46). `persistirCarro` y `leerCarro`, en `carroAlmacenado.ts`, son el único
 * lugar que toca el navegador.
 */

export type ItemCarro = {
  readonly id: string;
  readonly productoId: string;
  readonly varianteIds: readonly string[];
  readonly cantidad: number;
  readonly notas: string;
};

export type Carro = {
  readonly items: readonly ItemCarro[];
};

export function carroVacio(): Carro {
  return { items: [] };
}

/** Siempre agrega una línea nueva: dos líneas del mismo producto no se fusionan (AT-97). */
export function agregarItem(
  carro: Carro,
  datos: { productoId: string; varianteIds?: readonly string[]; cantidad: number; notas?: string },
  generarId: () => string = () => crypto.randomUUID(),
): Carro {
  if (datos.cantidad <= 0) {
    throw new Error(`la cantidad debe ser mayor que cero, llegó ${datos.cantidad}`);
  }
  const item: ItemCarro = {
    id: generarId(),
    productoId: datos.productoId,
    varianteIds: datos.varianteIds ?? [],
    cantidad: datos.cantidad,
    notas: datos.notas ?? "",
  };
  return { items: [...carro.items, item] };
}

export function quitarItem(carro: Carro, itemId: string): Carro {
  return { items: carro.items.filter((item) => item.id !== itemId) };
}

/** Cantidad menor o igual a cero quita la línea: no hay un ítem con cantidad cero. */
export function actualizarCantidad(carro: Carro, itemId: string, cantidad: number): Carro {
  if (cantidad <= 0) return quitarItem(carro, itemId);
  return {
    items: carro.items.map((item) => (item.id === itemId ? { ...item, cantidad } : item)),
  };
}

export function actualizarNotas(carro: Carro, itemId: string, notas: string): Carro {
  return {
    items: carro.items.map((item) => (item.id === itemId ? { ...item, notas } : item)),
  };
}
