# PAGAYA

App de pago rápido y autogestión de mesa para restaurantes: el cliente pide,
agrega productos, llama al mesero y paga desde su propio teléfono; el mesero
atiende en lugar de tramitar; el administrador ve el salón y la caja en vivo. El
cliente sube de nivel según cuántas veces visitó el local.

## Cómo trabajamos

Este producto se define y evoluciona **por PRDs**. Toda la definición vive en
[`prds/`](prds/):

- El producto base está en [`prds/PRD-001-pagaya-mvp.md`](prds/PRD-001-pagaya-mvp.md).
- Los PRDs no se editan: cada cambio de alcance se escribe en un **PRD nuevo**
  que abre con la sección *"Cambios en esta versión"*.
- Las reglas de versionado y el índice están en [`prds/README.md`](prds/README.md).

## El repositorio

```
prds/          el alcance. No se edita: cada cambio es un PRD nuevo
docs/          ejecución: backlog, arquitectura y decisiones técnicas
ambientes/     dev.json y staging.json. Nombres de secretos, nunca valores
packages/      los módulos de arquitectura.md AT-1, con frontera explícita
apps/          api, repartidor y web app
fronteras.json qué puede importar cada módulo, y por qué
scripts/       los verificadores
```

## Cómo correr

Hace falta **Node 22.18 o superior** y **python3**. Nada más: no hay paso de
compilación, ni empaquetador, ni marco de pruebas.

```sh
make verify         # la única puerta: PRDs + lint + tipos + pruebas
make migrar         # aplica las migraciones al ambiente de PAGAYA_AMBIENTE
make cargar-piloto  # valida el archivo del local piloto (F1-05) y muestra el plan
```

`make verify` instala las dependencias si hace falta. Las pruebas que necesitan
PostgreSQL se omiten —diciéndolo— si no hay `PAGAYA_BD_URL`, y son obligatorias
en integración continua. Para trabajar en local: `cp .env.ejemplo .env` y
[`ambientes/README.md`](ambientes/README.md).

Las decisiones técnicas, con la alternativa que se descartó y por qué, están en
[`docs/arquitectura.md`](docs/arquitectura.md).

## Roles

| Rol | Qué hace |
|---|---|
| **Cliente** | Se une a la mesa por QR, pide, llama al mesero, paga y deja feedback. |
| **Mesero** | Ve sus mesas, recibe notificaciones, entrega y atiende. |
| **Administrador** | Configura carta, mesas, meseros y niveles; ve ventas y feedback. |
