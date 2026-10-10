/**
 * El proceso API.
 *
 * arquitectura.md AT-1 lo describe como un monolito modular con dos procesos,
 * API + WebSocket por un lado y el repartidor del outbox por el otro. En F1-01
 * está el primero y solo responde `/salud`: ninguna ruta de negocio, ninguna
 * regla. Lo que esto prueba es que la fundación arranca —configuración cargada,
 * los siete módulos resueltos a través de su frontera, un puerto escuchando—,
 * que es exactamente el alcance de F1-01.
 *
 * El servidor se construye con `node:http` y nada más. El marco web y la
 * biblioteca de WebSocket no se eligen en esta tarea: ver docs/arquitectura.md
 * §8.5.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { leerCarta, type Acceso } from "@pagaya/base-datos";
import type { Configuracion } from "@pagaya/config";
import {
  RUTA_SALUD,
  VERSION_CONTRATO,
  type RespuestaCarta,
  type RespuestaSalud,
} from "@pagaya/contrato";
import { ErrorPagaya, relojDelSistema, type Reloj } from "@pagaya/nucleo";

import { MODULOS } from "./modulos.ts";

export type DependenciasApi = {
  readonly reloj?: Reloj;
  readonly acceso?: Acceso;
};

/** `/locales/<uuid>/carta`. RF-C-03 y RF-C-24: la carta se ve sin sesión. */
const RUTA_CARTA = /^\/locales\/([^/]+)\/carta$/;

export function crearServidor(config: Configuracion, dependencias: DependenciasApi = {}): Server {
  const reloj = dependencias.reloj ?? relojDelSistema;
  const acceso = dependencias.acceso;

  return createServer((peticion: IncomingMessage, respuesta: ServerResponse) => {
    const origen = peticion.headers.origin;
    if (origen !== undefined && config.api.origenesPermitidos.includes(origen)) {
      respuesta.setHeader("access-control-allow-origin", origen);
    }

    const ruta = new URL(peticion.url ?? "/", "http://pagaya.invalido").pathname;

    if (ruta === RUTA_SALUD && peticion.method === "GET") {
      const cuerpo: RespuestaSalud = {
        ambiente: config.ambiente,
        contrato: VERSION_CONTRATO,
        ahora: reloj.ahora().toISOString(),
      };
      respuesta.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      respuesta.end(JSON.stringify(cuerpo));
      return;
    }

    const carta = RUTA_CARTA.exec(ruta);
    if (carta !== null && peticion.method === "GET") {
      if (acceso === undefined) {
        respuesta.writeHead(503, { "content-type": "application/json; charset=utf-8" });
        respuesta.end(JSON.stringify({ error: "sin_acceso_a_base_de_datos" }));
        return;
      }

      const local = carta[1] as string;
      leerCarta(acceso, local)
        .then((categorias) => {
          const cuerpo: RespuestaCarta = { categorias };
          respuesta.writeHead(200, { "content-type": "application/json; charset=utf-8" });
          respuesta.end(JSON.stringify(cuerpo));
        })
        .catch((error: unknown) => {
          if (error instanceof ErrorPagaya && error.codigo === "acceso_invalido") {
            respuesta.writeHead(400, { "content-type": "application/json; charset=utf-8" });
            respuesta.end(JSON.stringify({ error: error.codigo, detalle: error.message }));
            return;
          }
          respuesta.writeHead(500, { "content-type": "application/json; charset=utf-8" });
          respuesta.end(JSON.stringify({ error: "error_interno" }));
        });
      return;
    }

    respuesta.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    respuesta.end(JSON.stringify({ error: "ruta_desconocida", ruta }));
  });
}

/** Los módulos montados en este proceso. Se expone para que una prueba los cuente. */
export { MODULOS };
