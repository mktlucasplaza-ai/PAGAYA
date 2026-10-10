/**
 * Pide la carta de un local sin sesión (F1-30b, consume la ruta de F1-30a:
 * arquitectura.md AT-90). `@pagaya/web` solo puede importar `@pagaya/contrato`
 * (fronteras.json), así que esta función es el único lugar donde el navegador
 * sabe qué forma tiene la respuesta.
 */
import { rutaCarta, type RespuestaCarta } from "@pagaya/contrato";

export async function obtenerCarta(
  base: string,
  local: string,
  traer: typeof fetch = fetch,
): Promise<RespuestaCarta> {
  const respuesta = await traer(new URL(rutaCarta(local), base));
  if (!respuesta.ok) {
    throw new Error(`la api respondió ${respuesta.status} pidiendo la carta de ${local}`);
  }
  return (await respuesta.json()) as RespuestaCarta;
}
