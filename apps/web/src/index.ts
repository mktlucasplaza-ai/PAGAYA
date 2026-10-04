/**
 * Web app del cliente y panel del administrador: el mismo código, servido desde
 * el QR y sin instalar nada (arquitectura.md AT-1; PRD-001 §13 y §16; RF-C-01,
 * RF-A-05, RF-A-06).
 *
 * En F1-01 este paquete existe por su frontera, no por su contenido: solo puede
 * importar `@pagaya/contrato` (fronteras.json), y esa restricción es lo que
 * impide que un día algo de servidor —el pool de PostgreSQL, un secreto, una
 * regla de cálculo— termine viajando al navegador del cliente.
 *
 * El marco de interfaz y el empaquetador se eligen en F1-30, que es la tarea que
 * tiene el requisito que los decide: carta usable en gama baja y con conexión
 * pobre (PRD-001 §14). Ver docs/arquitectura.md §8.5.
 */
import { RUTA_SALUD, type RespuestaSalud } from "@pagaya/contrato";

export function urlDeSalud(base: string): string {
  return new URL(RUTA_SALUD, base).toString();
}

export async function consultarSalud(
  base: string,
  traer: typeof fetch = fetch,
): Promise<RespuestaSalud> {
  const respuesta = await traer(urlDeSalud(base));
  if (!respuesta.ok) {
    throw new Error(`la api respondió ${respuesta.status} en ${RUTA_SALUD}`);
  }
  return (await respuesta.json()) as RespuestaSalud;
}
