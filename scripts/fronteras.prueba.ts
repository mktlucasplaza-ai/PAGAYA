/**
 * La frontera entre módulos, verificada.
 *
 * arquitectura.md AT-1 decide módulos "con frontera explícita […] verificada por
 * reglas de importación, no por despliegue separado". Esta prueba es esa
 * verificación: el grafo de fronteras.json tiene que ser coherente, los
 * `package.json` tienen que decir lo mismo que el grafo, y el código real no
 * puede tener una importación que el grafo no permita.
 *
 * Sin esto, "frontera explícita" sería una frase en un documento, y el monolito
 * modular se convierte en un monolito a secas en la tercera tarea.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, test } from "node:test";

import {
  RAIZ,
  archivosTs,
  esDirectorio,
  importacionesDe,
  leerFronteras,
  paqueteDe,
  type Capa,
} from "./fronteras.ts";

const fronteras = leerFronteras();
const paquetes = Object.entries(fronteras.paquetes);
const nombres = new Set(paquetes.map(([n]) => n));

function paquetesEnDisco(): string[] {
  const raizPkg = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8")) as {
    workspaces: string[];
  };
  const encontrados: string[] = [];
  for (const patron of raizPkg.workspaces) {
    const base = join(RAIZ, patron.replace(/\/\*$/, ""));
    for (const entrada of readdirSync(base, { withFileTypes: true })) {
      if (!entrada.isDirectory()) continue;
      encontrados.push(relative(RAIZ, join(base, entrada.name)));
    }
  }
  return encontrados.sort();
}

describe("el grafo de fronteras es coherente", () => {
  test("cada paquete declarado existe en disco y su package.json coincide", () => {
    for (const [nombre, paquete] of paquetes) {
      const ruta = join(RAIZ, paquete.ruta);
      assert.ok(esDirectorio(ruta), `${nombre}: no existe el directorio ${paquete.ruta}`);
      const pkg = JSON.parse(readFileSync(join(ruta, "package.json"), "utf8")) as {
        name: string;
      };
      assert.equal(pkg.name, nombre, `${paquete.ruta}/package.json se llama distinto`);
    }
  });

  test("todo paquete del monorepo está declarado en el grafo", () => {
    const declarados = new Set(paquetes.map(([, p]) => p.ruta));
    for (const ruta of paquetesEnDisco()) {
      assert.ok(
        declarados.has(ruta),
        `${ruta} es un paquete del monorepo y no está en fronteras.json. ` +
          `Un paquete sin frontera declarada puede importar lo que quiera.`,
      );
    }
  });

  test("nadie se importa a sí mismo ni importa algo que no existe", () => {
    for (const [nombre, paquete] of paquetes) {
      for (const permitido of paquete.puede_importar) {
        assert.notEqual(permitido, nombre, `${nombre} se declara importándose a sí mismo`);
        assert.ok(nombres.has(permitido), `${nombre} declara importar ${permitido}, que no existe`);
      }
    }
  });

  test("el grafo no tiene ciclos", () => {
    const visitando = new Set<string>();
    const listo = new Set<string>();
    const recorrer = (nombre: string, camino: string[]): void => {
      if (listo.has(nombre)) return;
      assert.ok(!visitando.has(nombre), `ciclo en el grafo: ${[...camino, nombre].join(" -> ")}`);
      visitando.add(nombre);
      for (const siguiente of fronteras.paquetes[nombre]?.puede_importar ?? []) {
        recorrer(siguiente, [...camino, nombre]);
      }
      visitando.delete(nombre);
      listo.add(nombre);
    };
    for (const [nombre] of paquetes) recorrer(nombre, []);
  });

  test("nadie importa una capa más alta que la suya", () => {
    const orden = (capa: Capa): number => fronteras.orden_de_capas.indexOf(capa);
    for (const [nombre, paquete] of paquetes) {
      assert.ok(orden(paquete.capa) >= 0, `${nombre}: capa desconocida ${paquete.capa}`);
      for (const permitido of paquete.puede_importar) {
        const otra = fronteras.paquetes[permitido];
        assert.ok(otra !== undefined);
        assert.ok(
          orden(otra.capa) <= orden(paquete.capa),
          `${nombre} (${paquete.capa}) no puede importar ${permitido} (${otra.capa}): ` +
            `una capa nunca depende de una más alta`,
        );
      }
    }
  });

  test("cada arista tiene su motivo escrito", () => {
    for (const [nombre, paquete] of paquetes) {
      assert.ok(
        paquete.porque.trim().length > 40,
        `${nombre}: el campo "porque" tiene que decir qué justifica esa frontera`,
      );
    }
  });

  test("el package.json de cada paquete declara exactamente sus dependencias internas", () => {
    for (const [nombre, paquete] of paquetes) {
      const pkg = JSON.parse(readFileSync(join(RAIZ, paquete.ruta, "package.json"), "utf8")) as {
        dependencies?: Record<string, string>;
      };
      const internas = Object.keys(pkg.dependencies ?? {})
        .filter((d) => d.startsWith("@pagaya/"))
        .sort();
      assert.deepEqual(
        internas,
        [...paquete.puede_importar].sort(),
        `${nombre}: package.json y fronteras.json no dicen lo mismo. ` +
          `npm resuelve por package.json y el lint por fronteras.json: si difieren, ` +
          `uno de los dos miente.`,
      );
    }
  });
});

describe("el código respeta la frontera", () => {
  const archivos = paquetes.flatMap(([, p]) => archivosTs(join(RAIZ, p.ruta)));

  test("hay código que verificar", () => {
    assert.ok(archivos.length >= paquetes.length, "falta código en algún paquete");
  });

  test("ninguna importación interna sale de lo declarado", () => {
    const problemas: string[] = [];
    for (const archivo of archivos) {
      const dueño = paqueteDe(archivo, fronteras);
      assert.ok(dueño !== undefined, `${archivo}: no pertenece a ningún paquete declarado`);
      for (const { especificador } of importacionesDe(archivo)) {
        if (!especificador.startsWith("@pagaya/")) continue;
        const partes = especificador.split("/");
        const objetivo = `${partes[0]}/${partes[1]}`;
        if (partes.length > 2) {
          problemas.push(
            `${relative(RAIZ, archivo)}: importa ${especificador}. ` +
              `Un paquete se importa por su raíz; entrar a su interior saltea su frontera.`,
          );
          continue;
        }
        if (objetivo === dueño.nombre) continue;
        if (!dueño.paquete.puede_importar.includes(objetivo)) {
          problemas.push(
            `${relative(RAIZ, archivo)}: ${dueño.nombre} importa ${objetivo}, ` +
              `que no está en su puede_importar. Si la frontera tiene que cambiar, ` +
              `se cambia en fronteras.json con su motivo.`,
          );
        }
      }
    }
    assert.deepEqual(problemas, []);
  });

  test("ninguna importación relativa se escapa de su paquete", () => {
    const problemas: string[] = [];
    for (const archivo of archivos) {
      const dueño = paqueteDe(archivo, fronteras);
      assert.ok(dueño !== undefined);
      const raizPaquete = resolve(RAIZ, dueño.paquete.ruta);
      for (const { especificador } of importacionesDe(archivo)) {
        if (!especificador.startsWith(".")) continue;
        const destino = resolve(dirname(archivo), especificador);
        if (destino !== raizPaquete && !destino.startsWith(raizPaquete + sep)) {
          problemas.push(
            `${relative(RAIZ, archivo)}: importa ${especificador}, que cae fuera de ` +
              `${dueño.paquete.ruta}. Una ruta relativa no es una puerta de atrás a otro módulo.`,
          );
        }
      }
    }
    assert.deepEqual(problemas, []);
  });

  test("una dependencia de terceros solo entra por el paquete que la encapsula", () => {
    const restringidas = Object.entries(fronteras.dependencias_externas).filter(
      (entrada): entrada is [string, string[]] => Array.isArray(entrada[1]),
    );
    const problemas: string[] = [];
    for (const archivo of archivos) {
      const dueño = paqueteDe(archivo, fronteras);
      assert.ok(dueño !== undefined);
      for (const { especificador } of importacionesDe(archivo)) {
        for (const [dependencia, permitidos] of restringidas) {
          const esEsa =
            especificador === dependencia || especificador.startsWith(`${dependencia}/`);
          if (esEsa && !permitidos.includes(dueño.nombre)) {
            problemas.push(
              `${relative(RAIZ, archivo)}: importa '${dependencia}', que solo puede entrar ` +
                `por ${permitidos.join(", ")}. Los proveedores externos van detrás de una ` +
                `interfaz (arquitectura.md AT-1; PRD-002 §5.2).`,
            );
          }
        }
      }
    }
    assert.deepEqual(problemas, []);
  });
});
