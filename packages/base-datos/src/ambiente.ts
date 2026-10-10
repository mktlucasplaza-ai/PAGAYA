/**
 * El acceso del ambiente: una entrada que arma `Acceso` sin que quien la llame
 * tenga que ver `@pagaya/config`.
 *
 * Qué lo exige: F1-04 pide una prueba de integración que confirme que una
 * escritura de dominio y su fila de auditoría se confirman o revierten juntas,
 * y esa prueba vive en `@pagaya/auditoria`, que por la frontera de AT-5 puede
 * importar `@pagaya/nucleo` y este paquete, y nada más. En particular **no**
 * puede importar `@pagaya/config`, que es lo que `crearAcceso` y
 * `migrarAmbiente` piden como parámetro. Sin esta función, el único lugar del
 * repositorio donde se puede escribir una prueba contra PostgreSQL sería este
 * paquete y `@pagaya/carga-inicial` — y esa limitación no la decidió nadie, es
 * un efecto de que la configuración entre por un parámetro.
 *
 * La decisión, con sus alternativas descartadas, está en docs/arquitectura.md
 * §15 (AT-32).
 *
 * Lo que esto **no** afloja: el pool sigue sin salir del paquete (AT-13) y las
 * tres miradas siguen siendo las únicas tres. Lo único que esta función agrega
 * es quién puede construir el objeto que las ofrece.
 */
import { cargarConfiguracion } from "@pagaya/config";

import { crearAcceso, type Acceso, type OpcionesAcceso } from "./acceso.ts";
import { migrarAmbiente } from "./postgres.ts";

export type OpcionesAmbiente = OpcionesAcceso & {
  /** Por defecto, `PAGAYA_AMBIENTE`; y `dev` si no está, igual que las demás pruebas. */
  readonly ambiente?: string;
  /**
   * Aplicar las migraciones pendientes antes de devolver el acceso. Por defecto
   * sí: las pruebas corren en procesos separados y en paralelo, así que ninguna
   * puede suponer que otra migró primero (ver `migrarAmbiente`).
   */
  readonly migrar?: boolean;
};

export async function accesoDelAmbiente(opciones: OpcionesAmbiente = {}): Promise<Acceso> {
  const config = cargarConfiguracion({
    ambiente: opciones.ambiente ?? process.env["PAGAYA_AMBIENTE"] ?? "dev",
  });
  if (opciones.migrar !== false) {
    await migrarAmbiente(config);
  }
  return opciones.anotarCruce === undefined
    ? crearAcceso(config)
    : crearAcceso(config, { anotarCruce: opciones.anotarCruce });
}
