/**
 * Persistencia del carro (F1-31a, arquitectura.md §47 AT-97): recargar la
 * página no puede perder lo que el cliente ya armó. `localStorage` es el único
 * almacenamiento del navegador que sobrevive a una recarga sin pedir permiso
 * ni depender de una sesión (RF-C-04 no exige cuenta para armar el pedido).
 *
 * `Almacen` es el subconjunto de `Storage` que estas funciones usan; recibirlo
 * como parámetro (en vez de leer `localStorage` directo) es lo que permite
 * probarlas con `node --test`, sin navegador ni `jsdom` (sigue AT-95, §46).
 */
import type { Carro } from "./carro.ts";
import { carroVacio } from "./carro.ts";

export type Almacen = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Namespaced por local: el mismo dispositivo puede visitar más de un local (AT-97). */
export function claveCarro(local: string): string {
  return `pagaya:carro:${local}`;
}

export function persistirCarro(carro: Carro, local: string, almacen: Almacen): void {
  almacen.setItem(claveCarro(local), JSON.stringify(carro));
}

/**
 * Nunca lanza: si no hay nada guardado, o lo guardado no es un carro válido
 * (otra versión, un dato corrupto), el carro vuelve vacío en vez de romper la
 * pantalla.
 */
export function leerCarro(local: string, almacen: Almacen): Carro {
  const guardado = almacen.getItem(claveCarro(local));
  if (guardado === null) return carroVacio();
  try {
    const datos = JSON.parse(guardado);
    if (!datos || !Array.isArray(datos.items)) return carroVacio();
    return datos as Carro;
  } catch {
    return carroVacio();
  }
}

export function vaciarCarro(local: string, almacen: Almacen): void {
  almacen.removeItem(claveCarro(local));
}
