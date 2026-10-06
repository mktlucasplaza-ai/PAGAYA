# Ambientes

Dos ambientes en Fase 1: **dev** (el equipo, en su máquina) y **staging** (un
despliegue de verdad, con PostgreSQL de verdad, donde se prueba lo que todavía
no ve un cliente). Producción nace con el piloto (PRD-001 §18, Fase 5): cuando
llegue, es un archivo más acá y ninguna línea de código.

## La regla

**Un ambiente es un archivo de configuración; una credencial es una variable de
entorno.** `dev.json` y `staging.json` están en el repositorio y se revisan como
cualquier cambio. Los secretos no: cada archivo declara el **nombre** de la
variable de entorno donde vive cada uno, nunca su valor.

```json
"secretos": {
  "url_base_datos": "PAGAYA_BD_URL",
  "firma_sesion": "PAGAYA_FIRMA_SESION"
}
```

Si una variable declarada falta, `cargarConfiguracion()` **falla al arrancar**
nombrándola. No arranca a medias ni usa un valor por defecto: un valor por
defecto para una credencial es una credencial en el repositorio escrita de otra
forma.

## Cómo se elige

`PAGAYA_AMBIENTE=dev|staging`. Sin esa variable no hay ambiente por defecto: el
proceso falla. "Por defecto dev" es cómodo hasta el día en que un proceso de
staging arranca con la configuración de dev.

## Cómo se trabaja en local

```sh
cp .env.ejemplo .env     # .env está en .gitignore
# llena los valores y expórtalos en tu shell, o usa tu gestor de secretos
PAGAYA_AMBIENTE=dev make migrar
```

## Una condición del alta de la base: sin superusuario

`PAGAYA_BD_URL` tiene que apuntar a un rol **que no sea superusuario**. Un
superusuario esquiva la *row level security* entera, y con ella el aislamiento
entre locales que la migración 0002 escribe (arquitectura.md AT-12): todo
seguiría funcionando y un local vería los datos de otro. Una prueba de
`make verify` lo exige en voz alta en vez de dejarlo a la suerte del alta.

El alta mínima, igual en una máquina y en integración continua:

```sql
CREATE ROLE pagaya LOGIN CREATEROLE PASSWORD '…';   -- sin SUPERUSER
CREATE DATABASE pagaya_dev OWNER pagaya;
```

`CREATEROLE` es lo único que hace falta de más, y es para que la migración 0002
pueda crear `pagaya_app`, el rol al que la capa de acceso cambia en cada
transacción. Si la base la provee un tercero que no entrega `CREATEROLE`, el rol
se crea una vez en el alta y la migración lo encuentra hecho.

## Qué agregar acá y qué no

Va acá lo que **cambia entre un ambiente y otro y no cambia durante la
operación**: puertos, orígenes permitidos, SSL, tamaño del pool, nivel de
registro, nombres de secretos.

No va acá lo que el **administrador configura por local** —rotación del PIN
(RF-A-12), umbrales de nivel (RF-A-07), plazos de escalamiento (PRD-001 §9),
medios de pago habilitados (RF-A-18)—. Eso vive en la base de datos, por local,
y se cambia sin desplegar. Un local no es un ambiente.
