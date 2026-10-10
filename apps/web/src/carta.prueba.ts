/**
 * F1-30b: muestra la carta completa de un local de prueba. Va de punta a
 * punta dentro de lo que esta tarea puede probar sin marco de interfaz ni
 * empaquetador (todavía no elegidos, F1-30c): pide la carta con el fetch que
 * la API de F1-30a expone (RespuestaCarta de @pagaya/contrato) y verifica que
 * la pantalla renderizada muestre categorías, foto, descripción, precio y
 * disponibilidad de cada producto (RF-C-03), tal como la devuelve la ruta sin
 * sesión (AT-90).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { RespuestaCarta } from "@pagaya/contrato";

import { obtenerCarta } from "./carta.ts";
import { formatoCLP, renderizarCarta } from "./pantallaCarta.ts";

const LOCAL = "cccccccc-0000-4000-8000-0000000030b1";

const CARTA_DE_PRUEBA: RespuestaCarta = {
  categorias: [
    {
      id: "cat-entradas",
      slug: "entradas",
      nombre: "Entradas",
      productos: [
        {
          id: "prod-empanada",
          sku: "EMP-01",
          nombre: "Empanada de pino",
          descripcion: "Masa casera, relleno de carne, cebolla, huevo y aceituna.",
          precio: 1990,
          disponible: true,
          foto: "https://cdn.pagaya.cl/locales/prueba/empanada.jpg",
          variantes: [{ id: "var-doble", slug: "doble", nombre: "Doble", precioDelta: 1500 }],
        },
        {
          id: "prod-sopa",
          sku: "SOP-01",
          nombre: "Sopa de pescado",
          descripcion: "Con <picante> & \"ajo\"",
          precio: 5200,
          disponible: false,
          foto: null,
          variantes: [],
        },
      ],
    },
    {
      id: "cat-fondos",
      slug: "fondos",
      nombre: "Fondos",
      productos: [
        {
          id: "prod-pastel",
          sku: "PAS-01",
          nombre: "Pastel de choclo",
          descripcion: "Choclo molido, pollo y carne.",
          precio: 8900,
          disponible: true,
          foto: "https://cdn.pagaya.cl/locales/prueba/pastel.jpg",
          variantes: [],
        },
      ],
    },
  ],
};

function traerDePrueba(): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(CARTA_DE_PRUEBA), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

describe("la carta, de punta a punta: pedirla y mostrarla completa", () => {
  test("muestra la carta completa de un local de prueba", async () => {
    const { categorias } = await obtenerCarta("http://localhost:3000", LOCAL, traerDePrueba());
    const html = renderizarCarta(categorias);

    // las dos categorías, en el orden en que llegaron (AT-18)
    assert.ok(html.indexOf("Entradas") < html.indexOf("Fondos"));

    // cada producto: nombre, descripción, precio y foto
    assert.match(html, /Empanada de pino/);
    assert.match(html, /Masa casera, relleno de carne/);
    assert.match(html, new RegExp(formatoCLP(1990).replace("$", "\\$")));
    assert.match(html, /src="https:\/\/cdn\.pagaya\.cl\/locales\/prueba\/empanada\.jpg"/);

    // una variante, con su delta de precio
    assert.match(html, /Doble/);
    assert.match(html, new RegExp(`\\+${formatoCLP(1500).replace("$", "\\$")}`));

    // disponibilidad: RF-C-03 la muestra, no la oculta
    assert.match(html, /Sopa de pescado/);
    assert.match(html, /Agotado/);
    assert.match(html, /producto--agotado/);

    // sin foto: no se rompe, no inventa una
    assert.match(html, /producto__foto--ausente/);

    // el producto sin agotar no lleva el aviso
    const bloquePastel = html.slice(html.indexOf("Pastel de choclo"), html.indexOf("Pastel de choclo") + 400);
    assert.doesNotMatch(bloquePastel, /Agotado/);

    // nombre o descripción con caracteres de HTML no rompe el marcado
    assert.match(html, /&lt;picante&gt; &amp; &quot;ajo&quot;/);
    assert.doesNotMatch(html, /<picante>/);
  });

  test("un local sin carta cargada no se trata como un error", () => {
    const html = renderizarCarta([]);
    assert.match(html, /todavía no tiene carta cargada/);
  });

  test("formatoCLP sigue la convención de miles del proyecto", () => {
    assert.equal(formatoCLP(58400), "$58.400");
  });
});
