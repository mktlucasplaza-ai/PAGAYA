# Carga inicial del local piloto (F1-05)

Mientras no exista el panel de administración —RF-A-01 a RF-A-04, Fase 4 de
PRD-001 §18—, el local piloto se configura con un archivo JSON versionado y este
comando. La decisión, con las alternativas que se descartaron, está en
[`docs/arquitectura.md` §11](../../docs/arquitectura.md) —el contrato del archivo
y el plan— y §12 —las tablas donde se escribe y el adaptador que las escribe.

```sh
make cargar-piloto                                  # valida el ejemplo del repositorio
make cargar-piloto COMANDO=plan                     # lee la base y muestra qué escribiría
make cargar-piloto COMANDO=validar ARCHIVO=mi.json  # valida otro archivo
make cargar-piloto COMANDO=cargar                   # aplica el plan, en una transacción
```

`validar` no necesita base de datos: se puede correr recién clonado el
repositorio. `plan` y `cargar` sí, porque desde F1-06 el plan se calcula contra
el estado real del local —que es lo que hace de la idempotencia una propiedad y
no una promesa— y la escritura entra por `entreLocales`, la única entrada que
puede dar de alta un local y escribir sobre el que acaba de crear. Hay que
exportar `PAGAYA_AMBIENTE` y los secretos de ese ambiente, igual que para
`make migrar`, y tener las migraciones aplicadas: las tablas que el archivo
escribe nacen en la migración `0003` (F1-06). `plan` no escribe nada.

## El archivo

`datos/local-piloto-demo.json` es un ejemplo completo con **datos ficticios**.
Toda clave que no esté en estas tablas es un error, no algo que se ignore: un
`"precios"` donde iba `"precio"` tiene que detener la carga.

| Raíz | Qué es |
|---|---|
| `formato` | Versión del contrato. Hoy `1`. Otro valor se rechaza sin interpretar el resto. |
| `local` | `slug`, `nombre`, `zona_horaria` (IANA canónica) y `moneda` (`CLP`). |
| `carta.categorias` | `slug`, `nombre`, `orden` (único). |
| `carta.productos` | Ver abajo. |
| `zonas` | `slug`, `nombre`. |
| `mesas` | `numero`, `zona`, `capacidad`, `qr_token` (opcional). |
| `meseros` | `codigo`, `nombre_pila`, `telefono` en E.164 (`+569…`). |
| `turnos` | `slug`, `nombre`, `inicio`, `fin` en `HH:MM`; `fin` menor que `inicio` cruza medianoche. |
| `asignaciones` | `turno`, `mesero`, `mesas` (lista de números de mesa). |

Un producto:

| Campo | Qué es |
|---|---|
| `sku` | Clave natural del producto. No se reusa con otro significado. |
| `categoria` | `slug` de una categoría declarada en el mismo archivo. |
| `nombre`, `descripcion` | Lo que ve el cliente (RF-C-03). |
| `precio` | Pesos chilenos, **entero**: el CLP no tiene decimales. |
| `disponible` | Disponibilidad inicial. Se escribe **solo al crear**: lo que el mesero marque como agotado (RF-M-12) sobrevive a la carga siguiente. |
| `foto` | Ruta o `null`. |
| `orden` | Posición dentro de su categoría. |
| `variantes` | `slug`, `nombre`, `precio_delta` (puede ser negativo, pero no dejar el precio bajo cero). |

## Lo que conviene saber antes de editarlo

- **Las claves naturales son la identidad.** Cambiar el `sku` de un producto o el
  `numero` de una mesa no es editar: es crear otra cosa y dejar la anterior como
  huérfana.
- **El cargador no borra.** Lo que se saca del archivo se reporta como huérfano y
  queda en la base, porque los ítems de comandas viejas lo referencian
  (PRD-001 §12). La única excepción son las asignaciones de los turnos que el
  archivo declara: ahí el archivo manda, que es lo que pide RF-A-04.
- **Una mesa tiene a lo más un mesero por turno** (supuesto S-13 de
  `docs/arquitectura.md`). La misma mesa en dos turnos distintos es lo normal.
- **El `qr_token` se deriva** de `(slug del local, número de mesa)` si no se
  declara. Decláralo si vas a renumerar mesas y quieres que el QR impreso siga
  sirviendo.
- **No se cargan acá** el PIN de mesa (es por sesión: F1-12), el estado de la
  mesa (es operación: F1-10, y la columna la agrega esa tarea) ni los niveles,
  propinas y medios de pago (fases 2 y 3).
