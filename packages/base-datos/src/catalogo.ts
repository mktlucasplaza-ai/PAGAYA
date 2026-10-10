/**
 * Lectura del catálogo, sin sesión (F1-30a).
 *
 * RF-C-03 (mod. PRD-004 §2.2) deja ver la carta completa sin registro, y
 * RF-C-24 la nombra entre lo que no exige cuenta. Las tablas ya las escribió
 * la migración 0003 (docs/arquitectura.md §12): esto solo las lee, con
 * `conLocal` como cualquier otra consulta de negocio — no hay nada que
 * autenticar para mirar la carta, pero sigue habiendo que decir desde qué
 * local se mira (AT-13).
 *
 * El orden de categorías y productos es el de `orden` (AT-18): es el que el
 * archivo de carga declaró y el que RF-C-03 espera ver.
 */
import type { Acceso } from "./acceso.ts";

export type VarianteCarta = {
  readonly id: string;
  readonly slug: string;
  readonly nombre: string;
  readonly precioDelta: number;
};

export type ProductoCarta = {
  readonly id: string;
  readonly sku: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly precio: number;
  readonly disponible: boolean;
  readonly foto: string | null;
  readonly variantes: readonly VarianteCarta[];
};

export type CategoriaCarta = {
  readonly id: string;
  readonly slug: string;
  readonly nombre: string;
  readonly productos: readonly ProductoCarta[];
};

type FilaCategoria = { id: string; slug: string; nombre: string };
type FilaProducto = {
  id: string;
  categoria_id: string;
  sku: string;
  nombre: string;
  descripcion: string;
  precio: number;
  disponible: boolean;
  foto: string | null;
};
type FilaVariante = {
  id: string;
  producto_id: string;
  slug: string;
  nombre: string;
  precio_delta: number;
};

/** La carta de un local, por categoría. Vacía si el local no tiene ninguna. */
export async function leerCarta(acceso: Acceso, local: string): Promise<readonly CategoriaCarta[]> {
  return acceso.conLocal(local, async (tx) => {
    const categorias = await tx.consulta<FilaCategoria>(
      `SELECT id, slug, nombre FROM pagaya.categoria ORDER BY orden`,
    );
    const productos = await tx.consulta<FilaProducto>(
      `SELECT id, categoria_id, sku, nombre, descripcion, precio, disponible, foto
         FROM pagaya.producto ORDER BY orden`,
    );
    const variantes = await tx.consulta<FilaVariante>(
      `SELECT id, producto_id, slug, nombre, precio_delta FROM pagaya.variante ORDER BY nombre`,
    );

    const variantesPorProducto = new Map<string, VarianteCarta[]>();
    for (const v of variantes) {
      const lista = variantesPorProducto.get(v.producto_id) ?? [];
      lista.push({ id: v.id, slug: v.slug, nombre: v.nombre, precioDelta: v.precio_delta });
      variantesPorProducto.set(v.producto_id, lista);
    }

    const productosPorCategoria = new Map<string, ProductoCarta[]>();
    for (const p of productos) {
      const lista = productosPorCategoria.get(p.categoria_id) ?? [];
      lista.push({
        id: p.id,
        sku: p.sku,
        nombre: p.nombre,
        descripcion: p.descripcion,
        precio: p.precio,
        disponible: p.disponible,
        foto: p.foto,
        variantes: variantesPorProducto.get(p.id) ?? [],
      });
      productosPorCategoria.set(p.categoria_id, lista);
    }

    return categorias.map((c) => ({
      id: c.id,
      slug: c.slug,
      nombre: c.nombre,
      productos: productosPorCategoria.get(c.id) ?? [],
    }));
  });
}
