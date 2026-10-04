/**
 * Lint. Dos trabajos distintos en un archivo:
 *
 * 1. Las reglas de siempre (TypeScript sin `any` silencioso, imports ordenados
 *    por consistencia, nada de `console` en los paquetes de biblioteca).
 * 2. La **frontera entre módulos** de arquitectura.md AT-1, traducida desde
 *    fronteras.json a `no-restricted-imports` por paquete. Para cada paquete se
 *    prohíbe explícitamente todo `@pagaya/*` que su `puede_importar` no nombre:
 *    así la violación aparece en el editor, donde corregirla cuesta un minuto,
 *    y no solo en `make verify`.
 *
 * La verificación autoritativa de la frontera es scripts/fronteras.prueba.ts,
 * que resuelve rutas de verdad y también atrapa un `../../otro-modulo`.
 */
import { readFileSync } from "node:fs";

import tseslint from "typescript-eslint";

const fronteras = JSON.parse(readFileSync(new URL("./fronteras.json", import.meta.url), "utf8"));
const paquetes = Object.entries(fronteras.paquetes);
const todos = paquetes.map(([nombre]) => nombre);

const externasRestringidas = Object.entries(fronteras.dependencias_externas).filter(([, v]) =>
  Array.isArray(v),
);

/** Un bloque de configuración por paquete, con su lista de prohibidos. */
const reglasDeFrontera = paquetes.map(([nombre, paquete]) => {
  const prohibidos = todos.filter(
    (otro) => otro !== nombre && !paquete.puede_importar.includes(otro),
  );
  const externasProhibidas = externasRestringidas
    .filter(([, permitidos]) => !permitidos.includes(nombre))
    .map(([dependencia, permitidos]) => ({
      name: dependencia,
      message:
        `'${dependencia}' solo puede entrar por ${permitidos.join(", ")}: ` +
        `los proveedores externos van detrás de una interfaz (arquitectura.md AT-1).`,
    }));

  return {
    files: [`${paquete.ruta}/**/*.ts`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...prohibidos.map((otro) => ({
              name: otro,
              message:
                `${nombre} no puede importar ${otro}: no está en su puede_importar ` +
                `(fronteras.json). Si la frontera tiene que cambiar, se cambia ahí, con su motivo.`,
            })),
            ...externasProhibidas,
          ],
          patterns: [
            {
              group: ["@pagaya/*/*"],
              message:
                "Un paquete se importa por su raíz. Entrar a su interior saltea su frontera.",
            },
          ],
        },
      ],
    },
  };
});

export default tseslint.config(
  {
    ignores: ["node_modules/**", "dist/**", "**/*.d.ts"],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: { ecmaVersion: 2023, sourceType: "module" },
    },
    rules: {
      eqeqeq: ["error", "always"],
      "no-var": "error",
      "prefer-const": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // `console` es la salida de un proceso, no de una biblioteca: un paquete que
    // imprime por su cuenta es un paquete que ensucia los registros de quien lo
    // use y no se puede probar.
    files: ["packages/**/*.ts"],
    ignores: ["packages/**/*.prueba.ts", "packages/base-datos/src/cli.ts"],
    rules: { "no-console": "error" },
  },
  ...reglasDeFrontera,
);
