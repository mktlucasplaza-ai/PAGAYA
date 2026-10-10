/**
 * La pantalla de la carta (F1-30b): RF-C-03 pide categorías, foto, descripción,
 * precio y disponibilidad, y AT-90 ya decidió que la carta se muestra completa,
 * sin ocultar lo agotado. Esta función solo convierte lo que devuelve
 * `obtenerCarta` en el marcado de la pantalla; no hay marco de interfaz ni
 * empaquetador todavía (se eligen en F1-30c, docs/arquitectura.md §8.5 y §46),
 * así que el resultado es un string de HTML que cualquier mecanismo de montaje
 * futuro puede insertar.
 *
 * Sin identidad visual aún: los colores y la tipografía son variables CSS en
 * `estilos.css`, pensadas para cambiarse ahí y en ningún otro lugar.
 */
import type { CategoriaCarta, ProductoCarta, VarianteCarta } from "@pagaya/contrato";

const FORMATO_CLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export function formatoCLP(monto: number): string {
  return FORMATO_CLP.format(monto);
}

function formatoDelta(delta: number): string {
  if (delta === 0) return formatoCLP(0);
  const signo = delta > 0 ? "+" : "-";
  return `${signo}${formatoCLP(Math.abs(delta))}`;
}

function escaparHtml(texto: string): string {
  return texto
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderizarVariantes(variantes: readonly VarianteCarta[]): string {
  if (variantes.length === 0) return "";
  const filas = variantes
    .map(
      (v) =>
        `<li class="producto__variante"><span>${escaparHtml(v.nombre)}</span><span>${formatoDelta(v.precioDelta)}</span></li>`,
    )
    .join("");
  return `<ul class="producto__variantes">${filas}</ul>`;
}

function renderizarProducto(producto: ProductoCarta): string {
  const foto = producto.foto
    ? `<img class="producto__foto" src="${escaparHtml(producto.foto)}" alt="${escaparHtml(producto.nombre)}" loading="lazy" />`
    : `<div class="producto__foto producto__foto--ausente" aria-hidden="true"></div>`;
  const agotado = producto.disponible
    ? ""
    : `<span class="producto__agotado">Agotado</span>`;

  return `
    <li class="producto${producto.disponible ? "" : " producto--agotado"}">
      ${foto}
      <div class="producto__info">
        <h3 class="producto__nombre">${escaparHtml(producto.nombre)}${agotado}</h3>
        <p class="producto__descripcion">${escaparHtml(producto.descripcion)}</p>
        <p class="producto__precio">${formatoCLP(producto.precio)}</p>
        ${renderizarVariantes(producto.variantes)}
      </div>
    </li>`;
}

function renderizarCategoria(categoria: CategoriaCarta): string {
  return `
    <section class="categoria" aria-labelledby="categoria-${escaparHtml(categoria.id)}">
      <h2 class="categoria__nombre" id="categoria-${escaparHtml(categoria.id)}">${escaparHtml(categoria.nombre)}</h2>
      <ul class="productos">${categoria.productos.map(renderizarProducto).join("")}</ul>
    </section>`;
}

/** La carta completa, por categoría, en el orden en que llega (AT-18). */
export function renderizarCarta(categorias: readonly CategoriaCarta[]): string {
  if (categorias.length === 0) {
    return `<div class="carta carta--vacia">Este local todavía no tiene carta cargada.</div>`;
  }
  return `<div class="carta">${categorias.map(renderizarCategoria).join("")}</div>`;
}
