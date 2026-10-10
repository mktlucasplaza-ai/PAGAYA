# Arquitectura del MVP — decisiones técnicas

| | |
|---|---|
| **Alcance según** | PRD-001 a PRD-007 (RF vigentes, con sus modificaciones aplicadas) |
| **Cubre** | Fases 1 a 3 de [PRD-001 §18](../prds/PRD-001-pagaya-mvp.md); la Fase 4 reusa lo mismo |
| **Estado** | Propuesta vigente. Se edita cuando un PRD nuevo la contradiga |
| **Fecha** | 2026-10-04 (§9 la identidad, §10 el aislamiento por local, §11 la carga del local piloto y §12 el catálogo, las mesas y el personal: agregadas el 2026-10-06; §14 el puerto de encolar antes de `evento_salida` y §45 leer la carta sin sesión: agregadas el 2026-10-10) |

> Este documento **no define alcance**: traduce a decisiones técnicas lo que los
> PRDs ya exigen. Si algo de aquí contradice un PRD, manda el PRD. Cada decisión
> cita el RF o la sección que la obliga, y nombra la alternativa que se descartó
> y por qué: una arquitectura sin su alternativa descartada se reinventa distinta
> en la siguiente sesión.
>
> El backlog ([docs/backlog-fase-1.md](backlog-fase-1.md), supuesto 4) ya asume
> este documento: F1-70 nombra el outbox y la versión de la comanda.

---

## 1. Cómo se sostienen entre sí

Son cuatro decisiones y no son independientes:

```
AT-1 Stack
  └─ una sola base transaccional, que es lo que hace posibles las otras tres
       ├─ AT-2 Outbox ──── usa la versión de AT-3 para ordenar lo que entrega
       ├─ AT-3 Versión ─── congela la comanda al cobrar y ordena el tiempo real
       └─ AT-4 Invariante ─ se impone en la misma transacción que congela (AT-3)
                            y su rechazo se audita
```

Debajo de las cuatro está la **fundación del repositorio** (§8): el monorepo que
convierte la frontera de AT-1 en un dato verificable, las migraciones donde se
escriben las invariantes de AT-2, AT-3 y AT-4, los ambientes y la puerta de
verificación. No es una quinta decisión del mismo tipo: es dónde viven las otras
cuatro. Y **debajo de todo** está el aislamiento por local (§10): la mitad de
AT-1 que ninguna de las otras tres puede suponer resuelta, porque una invariante
de dinero que se cumple sobre las filas del local equivocado no es una
invariante.

El hilo común: **las reglas que involucran dinero o identidad no viven en la
interfaz**. Viven en una transacción de base de datos, porque es el único lugar
donde "imposible" significa imposible (PRD-003 §5).

Y **sobre** las cuatro está la identidad (§9): AT-10 y AT-11 no agregan una regla
de dinero, deciden quién llega hasta una. Van después porque AT-11 solo es
posible con la frontera de AT-5 ya verificada — es la que la obliga a decidir
sobre la comanda sin importarla.

Las dos últimas se tocan en un punto y está escrito en los dos lados: §9.3 deja
a las tablas de identidad **fuera** del `local_id` obligatorio —una persona no
pertenece a un local— y §10.1 es donde esa excepción se escribe, en el registro
que la migración 0002 crea para que pedir una excepción sea un acto visible.

---

## 2. AT-1 — Stack

### Qué lo exige

- El cliente debe poder operar **sin instalar nada**, entrando por el QR
  (PRD-001 §13 y §16; RF-C-01).
- El mesero usa **app instalada con push** y ve la última comanda conocida **sin
  conexión** (PRD-001 §13; RF-M-02, RF-M-03, RF-M-04, RF-M-05).
- Tiempo real en la comanda, en la lista del mesero y en el salón, con
  reconexión y polling de respaldo (PRD-001 §13); menos de 3 s (PRD-001 §14).
- **Multi-tenant desde el día uno** y zona horaria por local (PRD-001 §13),
  porque "visita del día" y "ventas del día" dependen de ella (PRD-001 §8).
- Carta usable en gama baja y con conexión pobre (PRD-001 §14).

### Decisión

- **Backend monolítico modular en TypeScript sobre PostgreSQL**, desplegado como
  un servicio con dos procesos: API + WebSocket, y el repartidor del outbox
  (AT-2).
- Módulos con frontera explícita —`mesa`, `comanda`, `identidad`, `pago`,
  `fidelizacion`, `notificacion`, `auditoria`— verificada por reglas de
  importación, no por despliegue separado.
- **Cliente: web app** servida desde el QR, sin instalación, con presupuesto de
  peso y primer pintado como requisito de aceptación (PRD-001 §14).
- **Mesero: app instalada** (React Native) con push nativo y caché local de la
  última comanda conocida (F1-63).
- **Administrador: panel web**, en el mismo código del cliente web (RF-A-05,
  RF-A-06).
- **Aislamiento por local:** columna `local_id` obligatoria en toda tabla de
  negocio, filtrada en una única capa de acceso y respaldada por *row level
  security* de PostgreSQL. El aislamiento no puede depender de que nadie olvide
  un `WHERE`.
- **Proveedores externos detrás de una interfaz**: pasarela de pago (ya exigido
  por PRD-002 §5.2), push y envío de OTP (PRD-004 §3: el canal es configurable).

### Alternativas descartadas

| Alternativa | Motivo del descarte |
|---|---|
| Microservicios por dominio desde el día uno | Las tres invariantes que más importan —a lo más un cobro por comanda (PRD-001 §10), descuento solo con beneficiario presente (PRD-003 §5) y a lo más una comanda abierta por mesa (PRD-005 §6)— son transaccionales y cruzan dominios. Repartirlas obliga a sagas para un piloto de **un** local. |
| Backend como servicio con reglas en el cliente (tipo Firestore) | PRD-003 §5 pide que el descuento inválido sea **imposible de generar**, no difícil. Las reglas de dinero y la auditoría de RF-A-15 exigen escritura del servidor. |
| Base documental | El modelo es relacional (comanda ↔ participante ↔ ítem ↔ pago) y las invariantes se expresan mejor como restricciones. Se prefiere que la base rechace el dato malo a que lo rechace el código. |
| App nativa también para el cliente | PRD-001 §13 y §16: sin instalación o se pierde la primera visita, que es justo la que PRD-004 §1 dice que hay que cobrar una sola vez. |
| Web app también para el mesero | RF-M-02, RF-M-03 y RF-M-04 son Must y dependen de push confiable; el push web en iOS no lo es. El mesero sí puede instalar: es personal del local. |

### Consecuencias

- Dos clientes (web y nativo) con el contrato de la API compartido como paquete
  de tipos; el costo es real y se asume por el push del mesero.
- Un monolito escala vertical para un local piloto. La frontera entre módulos es
  lo que permite partirlo después sin reescribirlo.
- `local_id` en todas partes encarece cada consulta en legibilidad; es el precio
  de no tener una fuga entre locales en el momento en que haya dos.

---

## 3. AT-2 — Patrón outbox para las notificaciones

### Qué lo exige

- Las notificaciones son **el canal operativo** entre cliente y mesero
  (PRD-001 §9): productos agregados (RF-M-02), llamado de asistencia
  (RF-M-03) y pago completado (RF-M-04) son Must.
- Cada push tiene su **equivalente en vivo** dentro de la app: el push es un
  aviso, no la única vía (PRD-001 §9).
- **Escalamiento al administrador** si no hay mesero asignado o no confirma en X
  minutos (PRD-001 §9; F1-73).
- El riesgo "el mesero no ve la notificación" se mitiga con redundancia
  (PRD-001 §16) y el requisito de latencia es < 3 s (PRD-001 §14).
- RF-M-02 (mod. por PRD-005 §5): el mesero **no** recibe aviso por los ítems que
  cargó él mismo.

### Decisión

Toda transición de estado que deba avisarle a alguien escribe un evento en la
tabla `evento_salida` **en la misma transacción** que el cambio de negocio. Un
proceso repartidor toma los pendientes (`FOR UPDATE SKIP LOCKED`) y los entrega
por los dos canales: WebSocket para la vista en vivo y push para el aviso.
**Ningún módulo de dominio llama al proveedor de push.**

- **Entrega al menos una vez.** Cada evento lleva `id_evento`; el consumidor
  descarta repetidos.
- **El orden no lo da la entrega, lo da la versión** de la comanda (AT-3). Un
  evento que llega tarde con versión menor a la que el cliente ya tiene se
  descarta en lugar de pintar un estado viejo.
- **El filtro de RF-M-02 (mod.) vive en el productor**, que conoce el origen del
  ítem (`app` | `mesero`, PRD-005 §6), no en el cliente de push: así la lista en
  vivo, el push y el escalamiento ven exactamente lo mismo.
- **El escalamiento se alimenta del propio outbox.** El evento guarda
  `entregado_en` y `confirmado_en`; un barrido periódico emite el evento de
  escalamiento al administrador cuando se vence el plazo configurado del local.
  Sin registro durable del envío no hay forma de saber qué quedó sin atender.
- **Reintento con espera creciente y tope.** Lo que agota reintentos queda en
  estado `fallido` y visible para operación; la mesa no se entera porque la
  lista en vivo sigue siendo la fuente de verdad (PRD-001 §9).
- El repartidor se despierta por `LISTEN/NOTIFY` y sondea como respaldo, para
  caber en el presupuesto de 3 s sin convertir la base en un reloj.

### Alternativas descartadas

| Alternativa | Motivo del descarte |
|---|---|
| Enviar el push y el WebSocket en el manejador, justo después del commit | Es una escritura doble. Si el proceso muere o el proveedor falla entre el commit y el envío, la notificación se pierde **en silencio**, sobre requisitos Must y sobre el riesgo que PRD-001 §16 pide mitigar. |
| Emitir antes del commit, dentro de la transacción | Peor: avisa de cosas que después se revierten. Un "Mesa 12 agregó productos" de un pedido que falló es una llamada perdida del mesero. |
| Un broker (Kafka, SQS) escrito directamente desde el dominio | No resuelve la escritura doble, la traslada: el problema es la atomicidad con la base, no el transporte. Un broker puede agregarse después **detrás** del outbox, sin tocar a los productores. |
| Leer el WAL con CDC en lugar de una tabla | Da la misma atomicidad, pero obliga a traducir cambios de filas a eventos de negocio fuera del dominio y agrega infraestructura que un piloto de un local no sostiene. Queda como evolución, no como punto de partida. |

### Consecuencias

- Los consumidores **deben** ser idempotentes: no hay "exactamente una vez" de
  punta a punta con un proveedor de push de terceros (ver S-4).
- `evento_salida` es una tabla caliente: necesita purga de los entregados y
  retención de los fallidos (S-5).
- Un solo repartidor activo a la vez (los demás, en espera) para no duplicar
  trabajo; es un punto único que hay que monitorear, y su atraso es la métrica
  que vigila el requisito de 3 s.

---

## 4. AT-3 — Versión de la comanda para congelarla al cobrar

### Qué lo exige

- PRD-001 §10: *"Si la comanda cambia mientras el pago está en curso, el pago se
  rechaza y se recalcula la cuenta (la comanda se congela al iniciar el
  cobro)"*, más idempotencia del cobro y confirmación **solo por webhook**.
- **PRD-002 §5.4**: esas reglas se mantienen y se agrega que la propina entra en
  el mismo intento de pago: **un solo cobro, no dos**.
- RF-C-09 y RF-C-17: el cliente ve un desglose, y lo que ve es lo que se cobra.
- RF-M-07 (mod.) y PRD-005 §2: el mesero carga ítems **en cualquier momento**.
  La carrera entre "el cliente está pagando" y "el mesero agrega el pisco sour"
  no es teórica: es el caso normal de un sábado.
- PRD-001 §15: `abierta → cobrando → pagada`.

### Decisión

- **`comanda.version`**: entero que sube en la misma transacción que cualquier
  cambio que afecte el consumo o al beneficiario —ítem agregado, corregido o
  anulado (RF-M-08), participante que entra o sale (RF-C-21), beneficio que se
  activa (PRD-003 §3.2)—. Toda escritura de comanda pasa por un único punto que
  la incrementa.
- **Iniciar el cobro es una transición condicionada:**
  `UPDATE comanda SET estado='cobrando' WHERE id=:id AND estado='abierta' AND version=:version_vista`.
  Si no actualiza ninguna fila, el cliente estaba mirando una cuenta vieja: se le
  muestra la nueva y vuelve a confirmar. RF-C-17 ya le muestra el desglose en
  vivo, así que el cambio no lo toma por sorpresa.
- **El pago guarda `version_congelada`** y el desglose calculado
  (`monto_consumo`, `monto_descuento`, `monto_propina`, total), que PRD-002 §6 ya
  exige como campos.
- **Mientras la comanda está `cobrando`, toda escritura que cambie el consumo se
  rechaza con un error tipificado** y la app del mesero muestra *"la mesa está
  pagando"*. No se encola: encolar es cobrar un monto que el cliente nunca vio.
- **La propina no es parte de la comanda.** Cambiarla es un intento de pago nuevo
  contra la **misma** versión congelada, que es lo que permite conservarla y
  modificarla al reintentar (PRD-002 §2.1) sin descongelar nada.
- **Idempotencia como restricción, no como comprobación** (PRD-001 §10): clave de
  idempotencia por intento, propagada al proveedor, más un índice único parcial
  que admite **a lo más un pago en estado `autorizando` o `pagado` por comanda**.
- **El webhook manda** (PRD-001 §10): es lo único que pasa la comanda a `pagada`,
  por un endpoint idempotente por identificador de transacción. Un webhook que
  llega para un intento ya vencido **marca el pago igual** y levanta una alerta
  de conciliación en auditoría; el sistema nunca se "des-cobra" solo.
- **Vencimiento del congelamiento** (S-2): al vencer se cancela el intento con el
  proveedor y recién entonces la comanda vuelve a `abierta`. Volver a abrir **no**
  incrementa la versión: no cambió el consumo.
- **La misma versión ordena el tiempo real** (AT-2): el cliente que reconecta
  dice qué versión tiene y recibe el delta o un refresco completo (PRD-001 §13).

### Alternativas descartadas

| Alternativa | Motivo del descarte |
|---|---|
| Bloqueo pesimista de la fila mientras dura el cobro | El cobro dura de segundos a minutos: 3-D Secure, redirección a Webpay (PRD-002 §5.1). Mantener una transacción abierta ese rato bloquea la app del mesero y muere con cualquier corte de red, que es el escenario normal en un local lleno. |
| Recalcular al confirmar y cobrar la diferencia | Contradice PRD-002 §5.4 ("un solo cobro") y cobra un monto que el cliente no autorizó. RF-C-17 y RF-C-18 prometen que lo mostrado es lo cobrado. |
| Hash del contenido de la comanda en vez de un contador | Detecta el cambio igual de bien, pero **no ordena**: AT-2 necesita saber cuál de dos estados es posterior, y un hash no lo dice. Un entero además se lee en una auditoría. |
| Congelar copiando los ítems a una "cuenta" aparte | Duplica la verdad: dos lugares donde vive el consumo y una pregunta nueva —"¿cuál manda?"— cada vez que algo falla a mitad de camino. |
| No congelar y resolver con "quien llega primero" | Es el estado actual sin decisión: el cliente paga $58.400 y se lleva un pisco sour que nadie cobró, o paga de más. PRD-001 §10 lo descarta explícitamente. |

### Consecuencias

- Si una escritura esquiva el punto único que incrementa la versión, el
  congelamiento se vuelve una mentira silenciosa. Es la regla que hay que
  proteger con pruebas, no con disciplina.
- La app del mesero necesita diseño y texto para "la mesa está pagando"; es
  trabajo de interfaz que nace de esta decisión.
- Hay que medir cuántos cobros se rechazan por versión vieja. Si es frecuente, el
  problema no es técnico sino de producto (el mesero carga ítems tarde) y vuelve
  como PRD, no como parche.

---

## 5. AT-4 — El descuento como invariante del cálculo

### Qué lo exige

**PRD-003 §5**, textual: *"el `monto_descuento` solo puede ser mayor que cero si
existe un participante con `beneficio_activo = true`. Es una **invariante del
cálculo**, no una validación de interfaz"*. Y su criterio de aceptación 4: un
pago así *"es imposible de generar, y el intento queda registrado"*.

Lo sostienen además:

- PRD-003 §3.2, Regla 2: el beneficio requiere la sesión del cliente presente; el
  código corto tipeado sienta al cliente pero **no** activa su beneficio
  (RF-M-15, RF-M-16).
- PRD-003 §3.5: el abuso que esto cierra incluye al **mesero** que aplica
  descuentos a conocidos. La app del mesero es un cliente más, no un lugar de
  confianza.
- PRD-002 §2.2: la fórmula, incluido que la propina se calcula sobre el consumo
  **ya descontado**.
- PRD-005 §3: un pedido cargado por el mesero *"activa consumo, no identidad"*.
- RF-A-15: la vía de ingreso de cada comensal queda registrada **para auditoría
  de descuentos**.

### Decisión

El descuento **no es un dato de entrada en ninguna parte del sistema**. Se impone
en cinco capas, de la más cómoda a la que no se puede esquivar:

1. **Una sola función de cálculo.** `calcular_cuenta(comanda, participantes,
   configuración del local)`, en el servidor, es el **único** lugar que produce
   un total. La usan igual la vista previa de RF-C-09 y RF-C-17 y la creación del
   intento de pago. Si dos lugares calculan, algún día difieren, y el día que
   difieran será delante de un cliente. El orden del cálculo (descuento antes de
   propina, PRD-002 §2.2) vive ahí, no en la pantalla.
2. **Ninguna API acepta montos.** El cliente envía su elección de propina
   (`sin_propina` | `sugerida_10` | monto libre dentro del tope de RF-C-16) y
   nada más. No existe endpoint capaz de fijar un descuento.
3. **`beneficio_activo` es derivado, no asignado.** Se calcula desde
   `sesion_activa`, el nivel vigente y la vía de ingreso, según la tabla de
   PRD-003 §3.2. Nadie lo escribe a mano, y por eso el mesero no puede
   concedérselo a nadie (PRD-003 §3.5).
4. **La base rechaza el dato imposible.** En `pago`:
   `participante_beneficiario_id`, `nivel_aplicado` y `porcentaje_aplicado` como
   instantánea, con `CHECK (monto_descuento = 0 OR participante_beneficiario_id
   IS NOT NULL)` y un disparador que, en la misma transacción, exige que ese
   participante tenga `beneficio_activo = true`. *Imposible de generar* significa
   que la escritura falle, no que falte el botón.
5. **El intento rechazado se registra** en el registro de auditoría con actor,
   comanda y motivo (PRD-001 §14; RF-A-10, RF-A-15). El criterio 4 de PRD-003
   pide constancia, no solo bloqueo: un rechazo que nadie ve es un fraude que
   nadie investiga.

El cálculo se congela en el mismo instante que la comanda (AT-3): el descuento
que se cobra es el que existía en `version_congelada`, no el que exista cuando
llegue el webhook.

### Alternativas descartadas

| Alternativa | Motivo del descarte |
|---|---|
| Validar en la interfaz | Es exactamente lo que PRD-003 §5 descarta por escrito. |
| Validar solo en la capa de servicio | Mejor, pero una migración, un script de corrección o un endpoint nuevo pasan por el costado. La restricción en la base es la que nadie olvida a las 2 de la mañana. |
| Guardar el porcentaje y recalcular el descuento al leer | El nivel del cliente cambia con el tiempo: una cuenta de hace un mes recalcularía distinto. El monto cobrado es un hecho histórico y se guarda como instantánea. |
| Permitir un descuento manual del mesero | No existe en ningún PRD vigente: sería alcance nuevo. Y abriría justo el abuso que PRD-003 §3.5 cierra. |
| Confiar en que la app del mesero no ofrece la acción | PRD-003 §3.1 ya estableció que la seguridad no descansa en que algo sea secreto; tampoco descansa en que una pantalla no tenga un botón. |

### Consecuencias

- La vista previa de la cuenta y el cobro **no pueden** divergir, porque son la
  misma función; a cambio, esa función es el punto más sensible del sistema y
  necesita pruebas sobre los criterios 2, 4 y 5 de PRD-003 y el 5 de PRD-005.
- Un descuento que "debería haberse aplicado y no se aplicó" se diagnostica
  mirando `sesion_activa` y la vía de ingreso, no el código: es lo que RF-A-15
  hace visible en el panel.

---

## 6. Supuestos y preguntas abiertas

Lo que aquí se decidió sin que lo decidiera un PRD. **S-1 era una pregunta de
producto y ya la cerró el PRD-006**; se conserva la fila como registro. Casi
todas las demás son valores por defecto técnicos que viven en configuración;
las excepciones son dos y están marcadas: **S-9**, que no es un número sino la
lectura de dos requisitos que dicen cosas distintas, y **S-11**, que toca qué
cuenta como visita. Las dos dicen qué las reabriría como PRD.

| ID | Supuesto | Por qué, y qué pasa si se resuelve distinto |
|---|---|---|
| **S-1** | **Cerrado por [PRD-006](../prds/PRD-006-beneficiario-del-descuento-por-presencia.md):** el beneficiario es el participante con `beneficio_activo` y mayor porcentaje presente en la comanda, pague él o no; un solo descuento por comanda, decidido al congelar. | Era una contradicción entre PRD-002 §2.2 ("el cliente que paga") y PRD-003 §5 / PRD-005 §3 ("un participante con `beneficio_activo`"). PRD-006 adopta presencia y agrega al pago `beneficiario_id`, `pagador_id`, `nivel_aplicado`, `porcentaje_aplicado` y `monto_descuento_calculado` como instantánea, más un tope opcional por comanda (RF-A-07 mod.) y máximo un descuento por cliente por día. `calcular_cuenta` elige al beneficiario al congelar (AT-3) y la restricción de AT-4 pasa a referenciar `beneficiario_id`. |
| S-2 | Vencimiento del congelamiento: **15 minutos**, configurable por local. | Ningún PRD fija el plazo. Muy corto, se cancelan pagos con 3-D Secure lento; muy largo, la mesa queda bloqueada para el mesero. Se mide en el piloto. |
| S-3 | Plazos de escalamiento al administrador (la "X minutos" de PRD-001 §9): **3 min** para llamado de asistencia, **5 min** para productos agregados. | PRD-001 §9 los deja configurables sin fijar valor. Son configuración por local; se calibran con la operación real. |
| S-4 | Entrega **al menos una vez**, no exactamente una vez. | No existe "exactamente una vez" de punta a punta con un proveedor de push de terceros. Se compensa con idempotencia del consumidor y con la lista en vivo como fuente de verdad (PRD-001 §9). |
| S-5 | Retención del outbox: **30 días** los eventos entregados; los fallidos no se purgan. | Equilibrio entre tamaño de la tabla y poder reconstruir qué pasó en una noche concreta. |
| S-6 | **Producción se agrega cuando llegue el piloto**, como un archivo más en `ambientes/` (§8.4). En Fase 1 existen solo dev y staging. | F1-01 pide dos ambientes; ningún PRD dice cuándo nace el tercero. PRD-001 §18 pone el piloto en la Fase 5. Si hiciera falta antes, es un archivo y los secretos del proveedor: no cambia código. |
| S-7 | **PostgreSQL 16** en integración continua; la versión mínima soportada es **13**, porque `gen_random_uuid()` es parte del motor desde ahí y así ninguna migración necesita una extensión ni superusuario (§8.3). | Ningún PRD fija la versión del motor. Si el proveedor de staging obliga a una versión menor, vuelve la extensión `pgcrypto` y con ella el permiso de superusuario en el alta de la base. |
| S-8 | **Node 22.18 o superior** como plataforma, y TypeScript ejecutado sin compilar (§8.2). | Ningún PRD fija el entorno de ejecución. Si un proveedor de despliegue obliga a una versión anterior, vuelve un paso de transpilación: cambia el `Makefile` y el despliegue, no el código. |
| S-9 | El **mesero ve la comanda solo de las mesas que tiene asignadas** en el turno; el administrador, de todas las del local (§9.2). | PRD-001 §14 dice "el personal del local" sin distinguir, y RF-M-01 con PRD-001 §4.2 dicen "solo las mesas a su cargo". Se adopta la lectura más estricta de las dos, que además es la que hace falta para que el escalamiento al administrador de PRD-001 §9 tenga sentido: una mesa sin asignación no la ve ningún mesero, y por eso se escala (F1-73). Si la operación real necesita que un mesero cubra una mesa ajena, cambia **quién llena `meserosAsignados`** —y eso lo decide `mesa`, con RF-A-04 reasignando en caliente—, no la regla. Si tuviera que cambiar la regla, sería un PRD. El caso concreto que esto deja sobre la mesa de **F1-14**: un mesero abre una mesa de otra zona (RF-M-17) y con esta regla no vería la comanda que acaba de crear. Lo resuelve esa tarea decidiendo si abrir una mesa implica quedar asignado a ella; acá solo se declara que el acceso se lee de la asignación y de ningún otro lado. |
| S-10 | Vigencia de sesión: **cliente 180 días deslizantes**, **mesero 16 h** y **admin 12 h** no deslizantes, **sin cuenta 12 h** deslizantes (§9.1). | PRD-001 §14 exige "sesiones por rol" y PRD-004 §3 exige que la del cliente sea persistente, pero ningún PRD fija los números. La forma —deslizante para el cliente, de una jornada para el personal— es la decisión; los plazos son configuración y se calibran con la operación. Muy corto en el cliente, se gasta OTP de más, que es el costo variable que PRD-004 §3 quiere bajar; muy largo en el personal, un teléfono olvidado en la barra queda con sesión abierta. |
| S-11 | **El día operativo del local es su día calendario** en su zona horaria (§10.4). | Ningún PRD lo dice y tres reglas dependen de ello: "una visita por día por local" (PRD-001 §8), "ventas del día" (RF-A-06) y "un descuento por cliente por día por local" (PRD-006 §2, regla 7). Un restaurante que cierra a las 02:00 parte la noche en dos días, y la visita de quien pagó a las 01:30 cae al día siguiente. Si eso importa en el piloto, el arreglo es un corte configurable por local y **es un PRD**, no un parche: cambia qué cuenta como visita. |
| S-12 | **El mismo rol conecta y migra**, y no es superusuario (§10.1). | Ningún PRD habla de roles de base de datos. Lo que sí es innegociable es que el rol que conecta no sea superusuario: un superusuario esquiva la row level security y el aislamiento entre locales deja de existir en silencio. Separar el rol que migra del que sirve es mejor y es un `GRANT` en el alta de la base, no una migración: la migración 0002 le concede `pagaya_app` a quien la corre. |
| S-13 | **Una mesa tiene a lo más un mesero por turno**, y el cargador rechaza el archivo que diga otra cosa (§11.1). | PRD-001 §9 manda cada aviso "al mesero de la mesa", en singular, y escala al administrador cuando *no hay* asignación; RF-A-04 asigna mesas a meseros. Nadie lo escribió como regla. Si el local necesita mesas compartidas entre dos meseros, es un PRD nuevo: hay que definir quién recibe RF-M-02 y RF-M-03 y quién responde. |
| S-14 | **El token del QR se deriva de (local, número de mesa)** cuando el archivo no lo declara (§11.1). | Si el cargador lo sorteara, la segunda corrida cambiaría el QR impreso de todas las mesas. Que sea derivable no lo debilita: el QR identifica y no autentica (PRD-003 §3.1), y el control de "estoy sentado acá" es el PIN (PRD-002 §3.1). Un local que prefiera un token opaco —o que vaya a renumerar mesas— lo declara en el archivo. |
| S-15 | **El cargador no borra nada**: lo que el archivo ya no nombra se reporta como huérfano, salvo las asignaciones de los turnos que el archivo declara (§11.2). | PRD-001 §12: los ítems de comandas viejas referencian al producto y guardan el precio del momento. Borrar en una carga rutinaria es irreversible y silencioso. Si hay que retirar un producto de verdad, lo hará el panel de la Fase 4 (RF-A-01) con su auditoría. |
| S-16 | **`local.slug` es la clave natural del archivo de carga y es opcional** (§12.1). | Ningún PRD la nombra, porque ningún PRD habla del archivo de carga, y sin ella la segunda corrida no sabe cuál de los locales es el del archivo: la idempotencia de F1-05 no se podría calcular. Es opcional porque es un dato del archivo y no del local —la identidad del local es su `id`—, y hacerla obligatoria forzaría a inventarle un nombre corto a todo local que nazca por otro camino, incluido el panel de RF-A-09. Si algún día el slug sale en una URL o en un reporte, pasa a obligatorio con una migración y un valor derivado del nombre. |
| S-17 | **`local.moneda` es una columna con `CHECK (moneda = 'CLP')`** (§12.1). | PRD-002 §1 decidió Chile y el contrato del archivo ya declara la moneda "para que el día que haya otro mercado falle acá"; ningún PRD pide guardarla. Se guarda por dos motivos: el plan la compara en cada corrida —si no estuviera, el cargador querría actualizar el local para siempre— y así el que escriba sin pasar por el archivo, como el panel de RF-A-09, falla igual. El día que haya un segundo mercado, lo que cambia es el `CHECK`, y cambiarlo obliga a revisar que los precios enteros sigan teniendo sentido (PRD-002 §1). |
| S-18 | **El personal lleva `codigo` obligatorio y el cliente nunca** (§12.1). | Es la clave natural con la que el archivo nombra a cada mesero (RF-A-03), y hacerla obligatoria en el personal es lo que evita que el cargador tenga que ignorar en silencio a un mesero que no puede nombrar. El costo es que el panel de la Fase 4 tendrá que asignar un código al dar de alta a alguien; es una línea del formulario. Si eso resultara molesto, el código pasa a opcional y el cargador reporta como huérfano al personal sin código, que es peor: un huérfano que nadie puede resolver. |
| S-19 | **`mesa.qr_token` es único en todo el sistema, no por local** (§12.1). | Lo que el cliente escanea tiene que resolver a una sola mesa de un solo local (RF-C-01, F1-11), y un token que solo fuera único dentro del local obligaría a que el QR llevara también el local y a confiar en que los dos coincidan. No debilita nada: el token identifica y no autentica (PRD-003 §3.1), y el control de "estoy sentado acá" es el PIN (PRD-002 §3.1). Se paga con una restricción que cruza locales: dar de alta un local puede fallar por un token de otro, que con el token derivado de (local, mesa) de S-14 solo ocurre si dos locales comparten slug, y el slug es único. |

---

## 7. Qué no se decide aquí

- **Proveedor concreto de push y de SMS**, y el plan de nube y despliegue: están
  detrás de una interfaz (AT-1) justamente para no decidirlos hoy. El canal de
  OTP ya es configurable por exigencia de PRD-004 §3.
- **Enrutamiento entre Fintoc y Kushki**: ya está decidido en **PRD-007 §2.1**
  (Fintoc principal, Kushki para Webpay Plus y como respaldo; MercadoPago queda
  descartado), sobre la interfaz única de proveedor que exige PRD-002 §5.2, y
  acotado por **PRD-008 §2.4**: Google Pay queda sin proveedor y deshabilitado.
  Su habilitación depende de **G-2**, reescrita en **PRD-008 §7**; aquí no se
  agrega nada. El cobro es un *Checkout Session* alojado por el proveedor y el
  local es un **subcomercio** (PRD-008 §2.1 y §2.2); el vencimiento de la
  transferencia se reconoce por webhook mientras G-2 no confirme la consulta de
  estado (PRD-008 §2.5). El plazo de confirmación de la transferencia y el conflicto entre un
  webhook tardío y el cobro manual los define PRD-007 §2.4 y RF-A-19, y se
  resuelven con el mecanismo que §5 ya describe.
- **Boleta electrónica** (PRD-002 §5.5), **división de cuenta** y **KDS**
  (PRD-001 §5.2 y §13): fuera del MVP. El registro de pagos sí guarda lo que
  PRD-002 §5.5 pide para poder emitir después.
- **Esquema de datos completo**: las entidades están definidas en PRD-001 §12,
  PRD-002 §6, PRD-003 §5, PRD-004 §8 y PRD-005 §6. Aquí solo se agregan los
  campos que las cuatro decisiones exigen: `evento_salida` (AT-2),
  `comanda.version` y `pago.version_congelada` (AT-3), y
  `pago.participante_beneficiario_id`, `nivel_aplicado`, `porcentaje_aplicado`
  (AT-4).

---

## 8. La fundación del repositorio (F1-01)

Lo que las cuatro decisiones anteriores necesitan para existir como código.
Las exige **F1-01** del [backlog](backlog-fase-1.md) ("Monorepo, CI y ambientes
(dev, staging)", PRD-001 §13), de la que dependen todas las demás tareas de la
Fase 1. Son cinco decisiones y ninguna toca una regla de negocio: F1-01 entrega
la fundación vacía y una prueba de que arranca.

```
AT-5 Monorepo ──── la frontera de AT-1 como dato verificable (fronteras.json)
AT-6 Ejecución ─── TypeScript que corre sin compilar ni empaquetar
AT-7 Migraciones ─ SQL a mano, inmutable, con huella; donde viven AT-2/3/4
AT-8 Ambientes ─── dev y staging como archivo; las credenciales, nunca
AT-9 La puerta ─── `make verify`, el mismo comando en el equipo y en la CI
```

### 8.1 AT-5 — Monorepo, y la frontera entre módulos como dato

**Qué lo exige.** AT-1 decide módulos "con frontera explícita […] verificada por
reglas de importación, no por despliegue separado", y nombra como consecuencia
asumida que los dos clientes compartan "el contrato de la API […] como paquete
de tipos". Una frontera que solo vive en un documento no es una frontera: AT-3
ya advierte que si una escritura esquiva el punto único que incrementa
`comanda.version`, "el congelamiento se vuelve una mentira silenciosa".

**Decisión.** Un monorepo con **npm workspaces**: los siete módulos de AT-1
(`mesa`, `comanda`, `identidad`, `pago`, `fidelizacion`, `notificacion`,
`auditoria`) son paquetes, más cuatro de apoyo (`nucleo`, `contrato`, `config`,
`base-datos`) y tres aplicaciones (`api`, `repartidor`, `web`).

El grafo de importación vive en **`fronteras.json`**, en la raíz, con una arista
por par y el motivo escrito al lado. De ahí salen tres cosas, no una:

1. **`eslint.config.js`** lo traduce a `no-restricted-imports` por paquete: para
   cada uno se prohíbe explícitamente todo `@pagaya/*` que su `puede_importar`
   no nombre. La violación se ve en el editor.
2. **`scripts/fronteras.prueba.ts`** es la verificación autoritativa: el grafo
   es acíclico, ninguna capa depende de una más alta, cada `package.json` dice
   lo mismo que el grafo, y el código real no tiene una importación que el grafo
   no permita —incluido un `../../otro-modulo/src`, que el lint no ve porque no
   resuelve rutas.
3. **npm** resuelve por los `dependencies` de cada paquete, que la prueba obliga
   a coincidir con el grafo. Si npm y el lint discreparan, uno de los dos
   miente.

Las fronteras que cuestan y por qué se pagan: `mesa` no importa `comanda` ni
`pago` (una mesa no sabe de dinero); `comanda` no importa `pago` (la comanda no
conoce la pasarela; `pago` la importa a ella); `notificacion` y `auditoria` no
importan ningún módulo de dominio (si lo hicieran, el grafo tendría un ciclo con
todos, y el filtro de RF-M-02 (mod.) de AT-2 dejaría de vivir en el productor);
`fidelizacion` no importa `comanda` ni `pago`, que es la forma estructural de
"`beneficio_activo` es derivado, no asignado" (AT-4, regla 3); y **`apps/web`
solo puede importar `@pagaya/contrato`**, para que nada de servidor —el pool, un
secreto, una función de cálculo— pueda viajar al navegador del cliente.

El mismo archivo restringe las dependencias de terceros: `pg` solo entra por
`@pagaya/base-datos`. Es la misma idea que PRD-002 §5.2 pide para la pasarela
—ninguna regla de negocio conoce el nombre del proveedor— aplicada al resto.

| Alternativa | Motivo del descarte |
|---|---|
| Un repositorio por módulo | Las invariantes de AT-3 y AT-4 son transaccionales y cruzan módulos; repartirlas en repositorios obliga a versionar y publicar para cambiar dos líneas que viven en la misma transacción. Es el costo de los microservicios sin ninguno de sus beneficios. |
| Carpetas dentro de un paquete único | Es lo mismo que no tener frontera: cualquier archivo importa cualquier otro con una ruta relativa y nadie se entera. AT-1 pide que la frontera esté *verificada*. |
| Dejar la frontera en la revisión de código | Una regla que depende de que un humano la recuerde a las 2 de la mañana no es una regla. Y la revisión no escala a la tarea 40, que es donde esto se rompe. |
| pnpm o Yarn en lugar de npm | Mejores en varias cosas, pero agregan un paso de instalación antes de poder correr `make verify`. La puerta tiene que poder correrla cualquiera con Node, incluido un agente en un contenedor recién creado. Si algún día hace falta, se cambia sin tocar un solo `import`. |
| Nx o Turborepo | Resuelven caché de compilación y grafos de tareas que este repositorio no tiene todavía: hay tres aplicaciones y un `make verify` que dura segundos. Se agregan cuando el tiempo de verificación duela, no antes. |
| `eslint-plugin-boundaries` u otro complemento | Hace casi lo mismo, pero deja la frontera escrita en la configuración del lint, donde solo la lee el lint. En `fronteras.json` la leen el lint, la prueba y cualquiera que quiera entender el sistema sin abrir el código. |

### 8.2 AT-6 — TypeScript que corre sin compilar ni empaquetar

**Qué lo exige.** Nada en los PRDs; es una decisión de operación del repositorio.
La restricción que la gobierna es el principio rector de `CLAUDE.md`: la puerta
de verificación tiene que poder correrla cualquiera, en cualquier equipo, sin
preparación previa.

**Decisión.** Node ejecuta los `.ts` directamente (quita los tipos al cargar,
sin transpilar), y por eso:

- **No hay paso de compilación ni empaquetador** en el servidor. Cada paquete
  publica su `src/index.ts` en su campo `exports`.
- **`tsc` no emite nada**: solo chequea tipos (`make tipos`).
- **`erasableSyntaxOnly`** está activo en `tsconfig.json`: prohíbe la sintaxis
  de TypeScript que no se puede borrar (`enum`, `namespace`, propiedades en el
  constructor). Es la restricción que hace que lo que `tsc` aprueba sea
  exactamente lo que Node puede correr.
- **Las pruebas son `node:test`**, sin marco de pruebas. Se llaman
  `*.prueba.ts`.
- La cadena de herramientas se fija en lo que `typescript-eslint` soporta
  (TypeScript 6, no 7): si el lint y el chequeo de tipos leyeran el lenguaje con
  versiones distintas, uno de los dos estaría revisando otro programa.

| Alternativa | Motivo del descarte |
|---|---|
| Compilar a `dist/` con `tsc` y ejecutar JavaScript | Dos árboles de archivos, uno de los cuales se desincroniza; rutas de pila que apuntan a líneas que nadie escribió; y un paso más entre guardar y ver el resultado. |
| `tsx`, `ts-node` o un empaquetador (esbuild, swc) | Resuelven un problema que Node ya resuelve. Cada uno es una dependencia más que puede romperse en una versión de Node y detener la puerta de verificación. |
| Vitest o Jest | Dan vigilancia de archivos, cobertura y simulacros cómodos, y cuestan cientos de paquetes transitivos y una configuración propia. `node:test` alcanza para lo que F1-01 necesita; si la cobertura se vuelve un requisito, Node ya la trae. |
| Un marco web (Express, Fastify) para el proceso API | No se decide acá: la tarea que tiene el requisito que lo decide es otra (ver §8.5). `node:http` sostiene `/salud` y no compromete nada. |

### 8.3 AT-7 — Migraciones de SQL escritas a mano e inmutables

**Qué lo exige.** Las tres decisiones anteriores viven en el esquema, no en el
código: el índice único parcial que admite a lo más un pago en `autorizando` o
`pagado` por comanda (AT-3), el `CHECK` y el disparador del descuento (AT-4), la
tabla `evento_salida` (AT-2), y el `local_id` con *row level security* de AT-1.
PRD-003 §5 pide que el descuento inválido sea "imposible de generar": eso se
escribe en SQL.

**Decisión.** Una migración es un archivo `NNNN_nombre.sql` en
`packages/base-datos/migraciones/`, con numeración contigua, que **se aplica una
vez y no se edita nunca** —la misma regla que los PRDs, por la misma razón—. El
aplicador registra el nombre y la **huella sha256** de cada archivo en
`pagaya.migracion`; si una migración ya aplicada cambió de contenido, se detiene
antes de tocar la base. Cada migración corre con su registro en **una**
transacción, y un cerrojo de asesoría impide que los dos procesos de AT-1
apliquen la misma migración a la vez.

La mecánica no sabe SQL: trabaja contra un puerto (`RegistroMigraciones`) que
PostgreSQL implementa en un solo archivo. Eso es lo que permite probar el orden,
la idempotencia y el rechazo de una migración alterada **sin una base de datos
encendida**, y es la razón de que la prueba de integración sea corta.

La primera migración no crea ninguna tabla: solo el esquema `pagaya` donde van a
vivir. F1-01 prueba el camino, no el modelo; el modelo es F1-02.

| Alternativa | Motivo del descarte |
|---|---|
| Un ORM que genere las migraciones (Prisma, Drizzle) | Lo que este esquema necesita es justo lo que los generadores expresan peor o no expresan: *row level security*, índices únicos **parciales**, `CHECK` compuestos y disparadores (AT-1, AT-3, AT-4). Terminaríamos escribiendo SQL crudo dentro de una migración generada, con el modelo declarado en dos idiomas. |
| Una herramienta de migraciones de terceros (`node-pg-migrate` y similares) | Son razonables. No se descartan por malas sino porque lo que agregan sobre 120 líneas propias es un formato de archivo y una dependencia en el camino crítico del arranque; y lo que no agregan es la huella que detecta una migración editada, que es la regla que más nos importa. |
| Permitir editar una migración ya aplicada | La base y el repositorio dirían cosas distintas y nadie se enteraría hasta el día en que alguien recrea el esquema desde cero y no le queda igual. |
| Aplicar las migraciones al arrancar el proceso API | Un despliegue que se reinicia solo aplica esquema sin que nadie lo decida, y dos procesos (AT-1) compiten por hacerlo. `make migrar` es un paso explícito. |

### 8.4 AT-8 — Un ambiente es un archivo; una credencial es una variable

**Qué lo exige.** PRD-001 §14 (datos de pago solo en la pasarela, cifrado en
tránsito y en reposo) y PRD-001 §13 (multi-tenant desde el día uno). F1-01 pide
dos ambientes, dev y staging, "definidos como configuración, sin credenciales en
el repositorio".

**Decisión.** `ambientes/dev.json` y `ambientes/staging.json` están en el
repositorio y se revisan como cualquier cambio: puertos, orígenes permitidos,
SSL, tamaño del pool, nivel de registro. Las credenciales no: cada archivo
declara el **nombre** de la variable de entorno donde vive cada secreto, nunca
su valor. `cargarConfiguracion()` falla al arrancar nombrando la variable que
falta, y **no hay ambiente por defecto**: sin `PAGAYA_AMBIENTE` el proceso no
arranca. Una prueba verifica que ningún archivo de ambiente contenga algo con
forma de credencial.

Un secreto cargado viaja envuelto en `Secreto`, que devuelve el nombre de la
variable —no su valor— en cualquier intento de imprimirlo: texto, `JSON` o
inspección. El registro de errores es el lugar más fácil donde se escapa una
credencial.

**Producción no existe todavía** y eso es deliberado: nace con el piloto
(PRD-001 §18, Fase 5) y será un archivo más, sin una línea de código. Lo que el
administrador configura **por local** —rotación del PIN (RF-A-12), umbrales de
nivel (RF-A-07), plazos de escalamiento (PRD-001 §9), medios de pago habilitados
(RF-A-18)— no vive acá sino en la base de datos: un local no es un ambiente, y
cambiarle un umbral no puede exigir un despliegue.

| Alternativa | Motivo del descarte |
|---|---|
| Un `.env` por ambiente, en el repositorio | Mezcla en un archivo lo que se revisa con lo que no se puede ver. El día que alguien agrega una clave de Fintoc "solo para probar", queda en la historia de git para siempre. |
| Solo variables de entorno, sin archivo de ambiente | La configuración se vuelve invisible: no hay dónde leer qué distingue staging de dev, ni cómo revisar ese cambio. Y un error de tipeo en un nombre de variable se descubre en producción. |
| Un gestor de secretos (Vault, Secrets Manager) desde el día uno | Es el siguiente paso, no el primero: `process.env` es la interfaz que todos los gestores alimentan, así que adoptarlo después no cambia una línea de este código. |
| Un ambiente por defecto ("si no hay variable, dev") | Cómodo hasta el día en que un proceso de staging arranca con la configuración de dev y escribe en la base equivocada. |

### 8.5 AT-9 — `make verify` es la única puerta, y la CI corre el mismo comando

**Qué lo exige.** El principio rector de `CLAUDE.md`: "está terminado cuando
`make verify` pasa y pegas su salida". Si la CI corriera otra cosa, habría dos
definiciones de terminado.

**Decisión.** `make verify` corre, en orden y deteniéndose en el primer fallo:
la convención de PRDs (el verificador que ya existía), el **lint** —que incluye
la frontera de AT-5—, el **chequeo de tipos** y las **pruebas**. Agregar una
verificación significa agregarla ahí, no en otro comando que alguien tiene que
acordarse de correr. `.github/workflows/verificar.yml` corre `make verify` en
cada PR y en cada push a main, y nada más.

**Las pruebas contra PostgreSQL** son el único punto donde el equipo y la CI no
corren lo mismo, y la diferencia está declarada: se omiten si no hay
`PAGAYA_BD_URL` —diciéndolo en voz alta en la salida— y se vuelven
**obligatorias** con `PAGAYA_EXIGIR_BD=1`, que la CI pone siempre junto a un
PostgreSQL efímero. Así la puerta la puede correr cualquiera sin instalar una
base de datos, y el verde de la CI no se puede obtener sin ella.

| Alternativa | Motivo del descarte |
|---|---|
| Que la CI corra su propia lista de pasos | Dos definiciones de "listo" que se desincronizan en el tercer mes, y un fallo de CI que no se puede reproducir en el equipo. |
| Exigir Docker o PostgreSQL local para `make verify` | Una puerta que no todos pueden correr no es una puerta: deja de correrse. El contrato es más honesto al revés —omitir diciéndolo, y hacerlo obligatorio donde sí hay base de datos. |
| Omitir las pruebas de base de datos también en la CI | Entonces el `CHECK` de AT-4 y el índice único de AT-3, que son las reglas que PRD-003 §5 pide que sean imposibles de violar, no estarían verificadas en ninguna parte. |
| `make verify` en paralelo | Más rápido y menos legible: la salida se entrevera y el primer fallo deja de ser evidente. Se reconsidera cuando la verificación duela. |

### 8.6 Qué no se decide en F1-01

- **Marco web y biblioteca de WebSocket.** El proceso API responde `/salud` con
  `node:http`. Lo decide F1-70, que es la tarea con el requisito que manda:
  tiempo real en menos de 3 s (PRD-001 §14).
- **Marco de interfaz y empaquetador de la web app**, y la **app del mesero en
  React Native** con su empaquetador: `apps/web` existe hoy por su frontera, no
  por su contenido, y `apps/mesero` todavía no existe. Los decide F1-30, que
  tiene el requisito que los decide —carta usable en gama baja y con conexión
  pobre—, y E6 para el mesero. El riesgo de estimación de F1-30 ya advierte que
  ahí se juega la primera pantalla de la primera visita.
- **Capa de consultas** (SQL a mano, constructor de consultas o ORM solo para
  leer). Lo decide F1-02, que es la que escribe la capa única de acceso con
  `local_id` que AT-1 exige. **Ya decidido:** §10, AT-13.
- **Nube, despliegue y observabilidad.** §7 ya los deja fuera; F1-01 solo deja
  dos procesos que arrancan con su configuración y se apagan limpio.

---

## 9. La identidad y el acceso a la comanda (F1-03)

Quién es quien pide, cuánto le dura la sesión y qué puede ver. Las exige
**F1-03** del [backlog](backlog-fase-1.md) ("Roles (cliente, mesero, admin) y
sesiones; acceso a la comanda limitado a la mesa y al personal del local",
PRD-001 §14). Son dos decisiones:

```
AT-10 Sesión ─── un registro revocable; el token no dice nada de sí mismo
AT-11 Acceso ─── la regla recibe un descriptor de la comanda, no la comanda
```

No son una quinta y una sexta decisión del mismo peso que AT-1 a AT-4: esas
gobiernan el dinero, estas gobiernan quién llega hasta él. Van después porque
AT-11 solo es posible con la frontera de AT-5 ya verificada.

**F1-03 llega antes que F1-02 en este repositorio**, y el backlog la hace
depender de ella. La consecuencia está asumida y es visible en el código:
F1-03 entrega las **reglas y la mecánica puras** —se prueban sin PostgreSQL— y
el **puerto** `RepositorioSesiones`. No crea ninguna tabla: el `local_id`
obligatorio, el *row level security* y la capa única de acceso son de F1-02
(AT-1), y adelantarlos acá sería decidir su esquema desde otra tarea. Lo que
F1-03 sí le deja decidido es qué tiene que guardar y con qué excepción (§9.3).

### 9.1 AT-10 — La sesión es un registro revocable, y el token no dice nada

**Qué lo exige.**

- **RF-C-02 (mod. por PRD-004 §3)**: "sin contraseña, con sesión persistente".
  PRD-004 §3 lo dice completo: la sesión "queda persistente en el dispositivo y
  se recupera con OTP. Una contraseña en un restaurante es una barrera sin
  beneficio".
- **PRD-001 §14**: "OTP con expiración y límite de intentos; **sesiones por
  rol**". No hay una vigencia única: la del cliente dura lo que dure su relación
  con el local, la del personal dura un turno.
- **RF-C-24 y PRD-004 §2.2**: unirse a la mesa, ver la carta y ver la comanda no
  exigen registro. Existe entonces una sesión **sin cuenta**, y existe el
  instante en que se convierte en una con cuenta (F1-23).
- **RF-C-21** ("No es mi mesa"), **F1-15** (al cerrarse la sesión de mesa expira
  el acceso de todos los dispositivos) y **RF-C-23** (eliminar la cuenta): hay
  que poder apagar un acceso **ahora**, no al vencer un plazo.

**Decisión.**

- **Una sesión es una fila, no un token firmado.** Lleva titular, dispositivo,
  cuándo se abrió, última actividad, cuándo vence y cuándo se revocó.
- **El token nunca se guarda:** se guarda su `sha256`. El token en claro existe
  una sola vez, cuando se emite, y vive en el dispositivo. Una tabla de sesiones
  en claro es un archivo de contraseñas en claro, y PRD-001 §14 pide cifrado en
  reposo.
- **Vigencia por titular** (los plazos son S-10): cliente **deslizante** —se
  empuja con el uso, y eso es exactamente lo que "persistente" significa en
  PRD-004 §3—; personal **no deslizante**, una jornada, porque un teléfono de
  salón se presta y se queda arriba de la barra; sin cuenta, una comida.
- **Promover, no reabrir.** El dispositivo que se sentó sin cuenta y termina el
  registro (F1-23) **conserva el identificador de su sesión**: es lo que hace que
  el carro armado y el participante que ya está en la comanda sobrevivan al
  registro sin duplicarse. Y **rota el token**, porque el token viejo nació sin
  cuenta y pudo llegar al dispositivo por un camino que nadie controla; heredarlo
  sería dejar que quien lo plantó herede la cuenta. Es la misma lógica de
  PRD-003 §3.1: un token que ya circuló no se reusa.
- **Toda sesión nace en `abrirSesion` o en `promoverACuenta`.** F1-20 y F1-21
  implementan el OTP y el registro contra la frontera que F1-03 deja declarada
  (`ServicioIdentidad`), y terminan ahí: si hubiera una segunda forma de empezar
  una sesión, la política de vigencia de PRD-001 §14 se podría esquivar.

| Alternativa | Motivo del descarte |
|---|---|
| Token firmado sin estado (JWT) | No se puede revocar. RF-C-21, RF-C-23 y F1-15 exigen apagar un acceso en el momento; con un token sin estado habría que mantener una lista de revocados, que es la tabla que el JWT venía a evitar, más el token. |
| Contraseña, aunque sea opcional | PRD-004 §3 la descarta por escrito, y RF-C-25 da 40 segundos para todo el registro. Una contraseña opcional es igual de caro de sostener (recuperación, rotación, fuga) y no la usaría nadie. |
| Guardar el token en claro para poder buscarlo | Es lo mismo que guardar contraseñas en claro. La huella se busca igual de rápido y una fuga de la tabla no entrega ninguna sesión. |
| Una sola vigencia para todos los roles | Contradice "sesiones por rol" (PRD-001 §14) y obliga a elegir entre una sesión de cliente que caduca —y lo manda al OTP cada vez, el costo variable que PRD-004 §3 quiere bajar— o una de mesero que no caduca nunca. |
| Abrir una sesión nueva al terminar el registro | Pierde el carro y duplica el participante en la comanda, que es el riesgo que el backlog le cuelga a F1-23. |
| Sesión atada al número de mesa | La sesión del cliente es suya y sobrevive a la mesa (PRD-004 §3). Lo que está atado a la mesa es el **acceso a esa comanda**, y eso lo decide AT-11 sin tocar la sesión. |

**Consecuencias.**

- Autenticar es una lectura por petición. Renovar es una **escritura**, así que
  `renovarSesion` existe aparte y quien conecte esto a HTTP (F1-70) decide cada
  cuánto la llama: llamarla en cada petición es escribir en la base en cada
  petición.
- La sesión del cliente, al ser deslizante y sin tope absoluto, no caduca
  mientras se use. Es deliberado y es lo que PRD-004 §3 pide; lo que la cierra
  es la revocación (RF-C-23), no el calendario.
- El azar pasa a ser un insumo inyectable (`FuenteAleatoria` en `@pagaya/nucleo`,
  por el mismo motivo que el reloj): sin eso, una prueba no puede afirmar que dos
  tokens no se repiten, y un `Math.random()` suelto en un módulo de dominio sería
  un token adivinable que nadie nota al revisar el código. Lo reusan el PIN de
  mesa (F1-12) y el QR personal de 60 s (RF-C-20).

### 9.2 AT-11 — El acceso a la comanda se decide con un descriptor, no importando la comanda

**Qué lo exige.** **PRD-001 §14**, textual: "acceso a la comanda limitado **a la
mesa y al personal del local**". Son dos puertas y ninguna es el rol a secas:

- **La mesa:** quien está sentado en esa sesión de mesa, con cuenta o sin ella
  (RF-C-24, PRD-004 §2.2: ver la comanda no exige registro), y solo mientras la
  sesión de mesa esté abierta (PRD-001 §16 pide "expirar el acceso al cerrarse";
  PRD-002 §3.4 rota el PIN ahí mismo).
- **El personal del local:** el administrador ve el salón completo (RF-A-05); el
  mesero ve solo las mesas a su cargo (RF-M-01, PRD-001 §4.2) — es S-9.
- Y una tercera que ningún PRD escribe porque no hace falta: nadie ve la comanda
  de otro local (PRD-001 §13, multi-tenant desde el día uno).

Más la restricción estructural: **`fronteras.json` prohíbe que `identidad`
importe `mesa` y `comanda`** (AT-5), porque la importan ellas a ella.

**Decisión.**

- La regla es **una función pura** en `@pagaya/identidad`:
  `puedeVerComanda({ sesion, comanda, ahora })`. No consulta nada.
- Recibe un **descriptor**, `ComandaParaAcceso`, que nombra exactamente los
  cuatro hechos que la decisión necesita: el local, si la sesión de mesa sigue
  abierta, quiénes están sentados y a qué meseros les toca esa mesa. Los dos
  últimos los tienen `comanda` y `mesa`, que son sus dueñas y pueden importar
  `identidad`. **Los cuatro campos son obligatorios**: un `meserosAsignados`
  opcional se olvida, y olvidarlo abre la comanda a todo el personal sin que
  nadie se entere.
- **El rechazo es un código tipificado**, no un booleano: `otro_local`,
  `mesa_no_asignada`, `sesion_de_mesa_cerrada`, `fuera_de_la_mesa`,
  `sesion_expirada`, `sesion_revocada`. PRD-001 §14 pide auditoría y AT-4
  (regla 5) pide que el intento rechazado quede registrado con su motivo; un
  motivo en prosa libre no se puede contar ni alertar.
- **El acceso de la mesa no se revoca: se deja de conceder.** Al cerrarse la
  sesión de mesa (F1-15), la regla deja de permitir porque el descriptor dice
  que está cerrada. No hace falta recorrer los dispositivos revocando sesiones
  —un recorrido que puede fallar a la mitad y dejar a uno con acceso—, y la
  sesión del cliente sigue viva, que es lo correcto: sigue identificado, solo no
  está sentado en ninguna parte.
- **El personal no se mide contra la sesión de mesa.** Su acceso no viene de
  estar sentado, y lo necesita después del cierre para las ventas y la auditoría
  del turno (RF-A-06, RF-A-10). Lo que PRD-001 §16 manda expirar al cerrarse es
  el acceso de quien entró por el QR.
- **Una sesión se puede nombrar de dos maneras** dentro de una comanda: por su
  dispositivo (se sentó sin cuenta, F1-13) y por su cuenta (se registró después,
  F1-23). La regla acepta las dos, y no es laxitud: como `promoverACuenta`
  conserva el identificador de la sesión, es el mismo dispositivo, y así el
  acceso no depende de si la migración del participante ya ocurrió.
- **Esta función no autoriza escrituras.** Pedir exige cuenta (RF-C-05 mod.),
  cargar y corregir ítems son del mesero (RF-M-07, RF-M-08) y la comanda
  `cobrando` rechaza toda escritura (AT-3). Son reglas de las tareas que agregan
  esas escrituras; leer no es escribir.

| Alternativa | Motivo del descarte |
|---|---|
| Que `identidad` importe `comanda` y `mesa` y consulte lo que necesita | Invierte el grafo de AT-5: `comanda` y `mesa` importan `identidad`, así que esto cierra un ciclo. Y convierte la regla en una consulta, que es lo que hace que hoy se pueda probar sin base de datos. |
| Poner la regla en `comanda`, que ya tiene los datos | Quedaría a un lado de la frontera y el mesero del panel de administración (RF-A-05) y el historial del cliente volverían a decidirla por su cuenta. La pregunta "quién puede ver esto" es de identidad en los tres casos. |
| Decidir por rol solamente (`mesero` ⇒ ve las comandas) | Contradice RF-M-01 y PRD-001 §4.2 ("ve solo las mesas a su cargo"), y deja a cualquier comensal registrado viendo la comanda de la mesa de al lado, que es exactamente el riesgo que PRD-001 §16 lista para el QR. |
| Un token de acceso a la mesa, con la mesa adentro | Es un permiso que no se puede quitar: "No es mi mesa" (RF-C-21) y el cierre de la sesión de mesa (F1-15) tendrían que esperar a que el token venza. La verdad de quién está sentado vive en la comanda, y ahí se consulta. |
| Revocar las sesiones de los dispositivos al cerrar la mesa | Es un recorrido que puede fallar a la mitad, y de paso desloguea al cliente de su propia cuenta por haber terminado de comer. |
| Devolver `true`/`false` | Pierde el motivo, y sin motivo no hay auditoría del rechazo (AT-4, regla 5) ni forma de distinguir un error de permisos de una sesión vencida en la app del cliente. |

**Consecuencias.**

- Quien lea una comanda tiene que **armar el descriptor**, y eso cuesta una
  consulta de participantes y una de asignación. Es el precio de que la frontera
  sea real; a cambio, la lista completa de hechos que gobiernan el acceso está en
  un solo tipo en lugar de repartida en consultas.
- **El historial del cliente (RF-C-13) y el comprobante posterior al pago no
  pasan por acá.** Son lecturas de las cuentas pagadas de una persona, no acceso
  a la comanda de una mesa abierta, y llegan en Fase 2 y 3 con su propia regla.
  Si alguien afloja esta función para que entren, rompe PRD-001 §16.
- Si mañana el local necesita que un mesero cubra una mesa ajena, se cambia
  **quién llena `meserosAsignados`** (es `mesa` quien lo decide), no la regla.

### 9.3 Identidad es el único módulo cuyas tablas no son por local

AT-1 pide `local_id` obligatorio en **toda tabla de negocio**, con *row level
security*. Las tablas de identidad son la excepción, y no por comodidad: lo
decide PRD-001 §12, que al definir el usuario dice "rol (`cliente` | `mesero` |
`admin`), **local al que pertenece (meseros y admin)**". Una cuenta de cliente es
una persona —PRD-004 §3: una cuenta por número de teléfono— y una persona no
pertenece a un local. Lo que es por local es todo lo que cuelga de ella: la
visita, el nivel, el participante de comanda, la asignación de mesas.

Por eso la sesión no lleva local: lo lleva el titular, y solo cuando es personal.
La consecuencia práctica está en la regla de §9.2 —a un cliente no se le compara
el local, lo que lo ata a uno es estar sentado en una comanda de ese local, que
es un hecho más fuerte que un campo— y en el puerto: `porHuellaDeToken` es la
única búsqueda de este módulo que **no** filtra por local, porque es la que
*establece* de qué local es la petición. F1-02 hereda esta excepción y es la que
tiene que escribirla en su *row level security*: `usuario.local_id` nulo para el
cliente, obligatorio para el personal.

### 9.4 Qué no se decide en F1-03

- **El OTP (F1-20) y el registro (F1-21).** Queda declarada su frontera
  (`ServicioIdentidad`, `ProveedorCodigo`, `LimitesOtp`) y una sola cosa fijada:
  esos caminos terminan en una sesión abierta por AT-10. El proveedor de envío y
  sus límites los deciden ellas, con el tercero contratado delante.
- **El texto del consentimiento (F1-22, RF-C-26).** Lo bloquea G-4; acá solo
  existe el campo de versión que lo va a referenciar.
- **El PAGAYA ID** —código corto y QR personal de 60 s (RF-C-20, PRD-003 §3.1)—
  es Fase 3 por el supuesto 1 del backlog. Nada de lo declarado acá puede abrir
  una sesión a partir de un código corto: el código corto identifica y no
  autentica.
- **Cómo viaja el token en HTTP** (encabezado, cookie, vigencia del lado del
  navegador) y el manejo de la sesión en los dos clientes. Lo decide quien decida
  el marco web (F1-70) y el de la web app (F1-30), igual que §8.6.
- **La tabla de sesiones, su `local_id` y su RLS**: F1-02, contra el puerto que
  esta tarea deja escrito.
- **Si una persona puede ser mesero y cliente a la vez.** PRD-001 §12 le da un
  rol a cada usuario y PRD-004 §3 una cuenta a cada teléfono, así que hoy no
  puede, y el modelo lo refleja tal cual en lugar de inventarle una salida: un
  titular tiene un rol. Es un caso real —el personal también come— y si el piloto
  lo encuentra, se cierra con un PRD, no con un campo.

---

## 10. El aislamiento por local (F1-02)

Lo exige **F1-02** del [backlog](backlog-fase-1.md) ("Modelo multi-tenant
aislado por local, con zona horaria del local", PRD-001 §13), de la que dependen
todas las tareas que escriben datos. AT-1 ya decidió el **qué** en una frase:
*"columna `local_id` obligatoria en toda tabla de negocio, filtrada en una única
capa de acceso y respaldada por row level security de PostgreSQL. El aislamiento
no puede depender de que nadie olvide un `WHERE`"*. Lo que falta es el **cómo**,
y son cuatro decisiones:

```
AT-12 Aislamiento ── RLS forzada, un rol de aplicación y dos variables de sesión
AT-13 Capa única ─── una transacción, un local; SQL a mano y nada de pool afuera
AT-14 Configuración  un documento del local, no una columna por PRD
AT-15 El día ─────── la fecha del local la calcula la base, no el proceso
```

El MVP opera con **un** local piloto (PRD-001 §13), así que nada de esto se va a
notar hasta que haya dos. Ése es exactamente el motivo de hacerlo ahora: una
fuga entre locales no se descubre probando con uno, y el día que haya dos la
tabla con el `local_id` que faltó ya tiene medio año de datos.

**§9 llegó antes y eso cambia dos cosas, no una.** F1-03 entregó reglas puras y
un puerto, sin tablas, justamente para no decidir este esquema desde otra tarea.
Lo que sí decidió y esta sección recoge es la **excepción de identidad**
(§9.3): sus tablas no llevan `local_id` obligatorio, así que no pasan por
`activar_aislamiento` y tienen que dejar su fila en el registro de excepciones
(§10.1). Y `sinLocal` deja de ser una entrada sin uso: es la que corre
`porHuellaDeToken`, la búsqueda que *establece* de qué local es la petición y
que por eso no puede filtrar por uno (§10.2). Lo que esta sección **no** entrega
es la tabla de sesiones: la pide §9.4 y la escribe la migración que la cree,
contra este mecanismo.

### 10.1 AT-12 — `local_id`, RLS forzada y un rol que no es el que conecta

**Qué lo exige.** PRD-001 §13 (multi-tenant desde el día uno; zona horaria por
local), PRD-001 §14 (*"acceso a la comanda limitado a la mesa y al personal del
local"*) y AT-1. Lo escribe la migración
`0002_aislamiento_por_local.sql`, inmutable como todas (AT-7).

**Decisión.** Tres piezas y dos condiciones del alta de la base.

Las piezas:

- **`pagaya_app`**, un rol sin login al que la capa de acceso cambia con
  `SET LOCAL ROLE` al abrir cada transacción. Es el único rol con permisos sobre
  las tablas de negocio, y no tiene `CREATE` sobre el esquema: la aplicación
  consulta, no migra.
- **`pagaya.local_id`**, variable de sesión fijada por transacción. Si no está,
  `pagaya.local_actual()` es `NULL`, `local_id = NULL` no es verdadero para
  ninguna fila y la consulta **no ve nada**. El caso por defecto es cero filas,
  no todas.
- **`pagaya.entre_locales`**, variable de sesión apagada por defecto que abre el
  paso entre locales para lo único que lo necesita de verdad: dar de alta un
  local y la carga inicial (F1-05). Hay que escribirla, y la capa de acceso
  exige un motivo para hacerlo.

Las condiciones, las dos verificadas por pruebas de integración:

1. **El rol que conecta no puede ser superusuario.** Un superusuario esquiva la
   row level security entera, `FORCE` incluido, y las tres piezas de arriba se
   vuelven falsas sin que nada falle. Está en `ambientes/README.md` y
   `.env.ejemplo`, lo hace la integración continua, y una prueba lo exige en voz
   alta.
2. **`FORCE ROW LEVEL SECURITY` en toda tabla**, para que el dueño del esquema
   —que es el mismo rol que conecta— también quede sujeto. Es lo que convierte
   "alguien consultó sin pasar por la capa" en **cero filas**, que se nota, en
   vez de **las filas de todos los locales**, que no.

La tabla `local` es el único caso especial, porque su clave de inquilino es su
propio `id`: un local **se lee y se configura a sí mismo** —RF-A-07, RF-A-09 y
RF-A-12 son del administrador de ese local—, pero no puede darse de alta, darse
de baja ni mudarse al `id` de otro. Quién, dentro del local, tiene derecho a
configurarlo es otra pregunta y otra capa: roles y sesiones son **F1-03**. La
row level security responde "de qué local es esta fila", no "quién es esta
persona", y confundir las dos es cómo se termina con una autorización que vive
en dos lugares y difiere en uno.

Dos piezas más, que son las que hacen que esto sobreviva a la tarea 40:

- **`pagaya.activar_aislamiento('pagaya.mesa')`**, una llamada al final de la
  migración que crea cada tabla. Verifica que la tabla tenga `local_id uuid NOT
  NULL` con referencia a `local`, enciende RLS, la fuerza, crea la política y da
  los permisos. Son cinco pasos y basta con olvidar uno —típicamente `FORCE`—
  para que el aislamiento sea una creencia.
- **`pagaya.tablas_sin_aislamiento()`**, la guardia: devuelve las tablas del
  esquema que deberían estar aisladas y no lo están, con el motivo exacto. Una
  prueba de `make verify` falla si devuelve algo. Las excepciones deliberadas
  —`migracion`, `local`, la propia tabla de excepciones— viven como filas en
  `pagaya.tabla_sin_local`, con su motivo: pedir una excepción es escribirla y
  que alguien la revise.

**La primera excepción prevista ya tiene nombre: las tablas de identidad.**
**§9.3** lo decidió antes que esta tarea y con un argumento de producto, no de
comodidad: PRD-001 §12 da el "local al que pertenece" solo a meseros y
administradores, y PRD-004 §3 hace de una cuenta de cliente una persona —una por
número de teléfono—, que no pertenece a ningún local. Por local es lo que cuelga
de ella: la visita, el nivel, el participante de comanda, la asignación de
mesas.

La consecuencia concreta para este mecanismo es que **`activar_aislamiento` no
les sirve**: exige `local_id uuid NOT NULL`, y §9.3 pide `usuario.local_id`
**nulo para el cliente y obligatorio para el personal**. La migración que cree
esas tablas tiene entonces dos obligaciones, y ninguna es opcional: escribir su
política a mano —personal, el de su local; cliente, sin comparación de local,
porque lo que lo ata a uno es estar sentado en una comanda de ese local, que es
un hecho más fuerte que un campo (§9.2)— y **dejar su fila en
`pagaya.tabla_sin_local` con ese motivo**, para que la guardia siga en verde por
una decisión escrita y no por un descuido. El `porHuellaDeToken` de §9.3 es la
única búsqueda del sistema que legítimamente no filtra por local, porque es la
que *establece* de qué local es la petición: corre, por eso, antes de que haya
un local que fijar, y le toca `sinLocal` (§10.2).

**Lo que esto no es.** No es una frontera de privilegio contra nuestro propio
código: quien puede abrir una transacción puede encender `entre_locales`. Lo que
compra la row level security acá es que **el caso por defecto sea cero filas** y
que cruzar de local haya que escribirlo. La frontera dura necesitaría una
segunda credencial —un rol de operación con su propia contraseña, que la API no
tiene—, y eso es una decisión de despliegue que hoy no se puede verificar en
ninguna parte: queda nombrada acá y se toma cuando exista producción (S-6).

| Alternativa | Motivo del descarte |
|---|---|
| Filtrar por `local_id` en cada consulta, sin row level security | Es exactamente lo que AT-1 descarta por escrito: *"el aislamiento no puede depender de que nadie olvide un `WHERE`"*. Y el olvido no se ve en la revisión —una consulta sin `WHERE local_id` compila, pasa las pruebas con un local y devuelve de más recién cuando hay dos. |
| Pasar el `local_id` como parámetro a cada función de repositorio | Mejor que nada, pero el parámetro se puede pasar mal: `obtenerComanda(localDelMesero, comandaDeOtroLocal)` es un error de tipos imposible de detectar, porque los dos son `uuid`. La variable de sesión se fija **una vez por transacción**, donde la sesión del usuario ya está resuelta. |
| Una base de datos (o un esquema) por local | Aísla mejor y cuesta su peso: migrar N bases en cada despliegue, N pools, y reportes entre locales que dejan de ser una consulta. Para un piloto de un local es infraestructura por adelantado; si algún día un cliente grande lo exige, `local_id` no estorba para llegar ahí. |
| Un rol de PostgreSQL por local | El aislamiento sería del motor, pero el alta de un local pasaría a ser un `CREATE ROLE` y un cambio de credenciales, y el pool dejaría de poder reusar conexiones entre locales. Se paga un problema de operación para resolver uno de consulta. |
| Un rol `pagaya_operador` con su política, en vez de la variable `entre_locales` | Se probó y no funciona como promete: PostgreSQL aplica una política `TO rol` a cualquier **miembro** del rol, y el rol que conecta tiene que ser miembro para poder hacerle `SET ROLE`. Resultado: una consulta cruda sin pasar por la capa veía todos los locales. La variable de sesión deja el caso por defecto en cero. |
| `BYPASSRLS` para el camino entre locales | Crear un rol con ese atributo exige superusuario de verdad, que varias bases administradas no entregan. Una variable de sesión consigue lo mismo y se lee en el `\d` de la política. |

**Consecuencias.**

- El alta de la base deja de ser trivial: un rol sin superusuario y con
  `CREATEROLE`. Está escrito en dos lugares y comprobado en uno.
- Una migración que necesite tocar datos de negocio tiene que encender
  `pagaya.entre_locales` o cambiar a `pagaya_app` con un local fijado; si no,
  no ve nada. Es incómodo una vez y correcto siempre.
- La política se evalúa en cada consulta. Toda tabla de negocio va a querer sus
  índices **encabezados por `local_id`**; no se crea uno automático porque un
  índice solo de `local_id` no sirve de nada cuando hay un local, y el índice
  compuesto que sí sirve lo sabe la tarea que crea la tabla.

### 10.2 AT-13 — La capa única: una transacción, un local

**Qué lo exige.** La misma frase de AT-1 ("una única capa de acceso"), y §8.6,
que dejó explícitamente a F1-02 la decisión de cómo se consulta.

**Decisión.** `crearAcceso(configuracion)` en `@pagaya/base-datos` devuelve tres
entradas y ninguna más. No hay consulta fuera de una transacción, y no hay
transacción sin decir desde dónde se mira:

| Entrada | Qué hace | Para qué |
|---|---|---|
| `conLocal(local, …)` | Fija `pagaya.local_id` y cambia a `pagaya_app` | El camino normal: toda petición de un cliente, un mesero o un administrador |
| `sinLocal(…)` | Solo cambia de rol | Lo que ocurre **antes** de saber de qué local es la petición: autenticar un token (`porHuellaDeToken`, §9.3). Sobre una tabla aislada ve cero filas, y eso es correcto, no un error que haya que rodear |
| `entreLocales(motivo, …)` | Enciende `pagaya.entre_locales` | Alta de un local y carga inicial (F1-05). Exige un motivo escrito |

Lo demás de la decisión:

- **SQL a mano con parámetros posicionales.** Sin constructor de consultas y sin
  ORM, por las mismas razones de AT-7: lo que este esquema necesita —índices
  únicos parciales, `CHECK` compuestos, disparadores, row level security— es lo
  que los generadores expresan peor, y tener el modelo declarado en dos idiomas
  es la forma más cara de equivocarse. La transacción expone `consulta` y `una`,
  nada más.
- **El pool no sale del paquete.** `@pagaya/base-datos` no exporta `crearPool`
  ni el cliente de `pg`. Sumado a que `pg` solo puede entrar por ese paquete
  (`fronteras.json`, `dependencias_externas`), no queda forma de hablar con la
  base sin decir desde qué local se mira. Una prueba compara la lista de
  exportaciones del paquete: la frontera que no se verifica se pierde.
- **La transacción muere con su bloque.** Guardarla y usarla después falla con
  un error tipificado, porque la variable de sesión ya no está y la consulta
  correría sin local.
- **El motivo de `entreLocales` se le entrega a quien lleve la constancia**, por
  un callback opcional. Hoy no va a ningún lado a propósito: el registro de
  auditoría append-only es **F1-04** (PRD-001 §14), y engancharlo antes de que
  exista sería inventarle la forma.

| Alternativa | Motivo del descarte |
|---|---|
| Un ORM (Prisma, Drizzle, TypeORM) | Mismo motivo que AT-7 para las migraciones, más uno propio: la variable de sesión por transacción hay que inyectarla igual, y hacerlo a través del ciclo de vida de conexiones de un ORM es más frágil que hacerlo con `BEGIN` y `SET LOCAL` propios. |
| Un constructor de consultas (Kysely, Knex) | Es la opción razonable que más cuesta descartar: da tipos sobre el esquema sin esconder el SQL. Se descarta por ahora porque el esquema todavía no existe —no hay de dónde generar los tipos— y porque agrega una dependencia en el camino crítico de `make verify`. Se reconsidera cuando haya tablas de verdad; no cambiaría esta capa, se metería adentro. |
| Exponer el pool y que cada módulo abra sus transacciones | Es volver a "que nadie olvide el `WHERE`", con un paso más: que nadie olvide el `SET LOCAL`. |
| Un `AsyncLocalStorage` con el local de la petición, implícito | Cómodo y peligroso: el local deja de verse en la firma de la función y aparece una clase nueva de error —"esta tarea de fondo corrió sin contexto"— que no se detecta leyendo el código. Pasarlo explícito cuesta una línea. |
| Permitir consultas sueltas fuera de transacción | Una consulta fuera de transacción no puede tener `SET LOCAL`, así que correría sin local. Prohibirlo es lo que hace que la regla no tenga excepciones que recordar. |

**Consecuencias.**

- Todo acceso a datos queda dentro de un bloque, lo que de paso hace que la
  transacción sea la unidad por defecto. Es lo que AT-2 y AT-4 necesitan: el
  evento del outbox y el registro de auditoría se escriben **en la misma
  transacción** que el cambio, y acá no hay forma de que no sea así.
- Una petición que necesite dos locales no existe en el MVP. Si apareciera, es
  `entreLocales` con su motivo, y el motivo se lee en la revisión.

### 10.3 AT-14 — La configuración del local es un documento, no una columna por PRD

**Qué lo exige.** PRD-001 §12 (el Local guarda "datos, impuestos, medios de
pago, configuración de niveles") y cada PRD desde entonces: PRD-002 §6 agrega
propina sugerida, tope de propina libre y política de rotación del PIN;
PRD-003 §5 agrega flags de medios por proveedor; PRD-004 §8 agrega el canal de
OTP; PRD-006 §4 agrega el tope de descuento por comanda; PRD-007 §4 **reemplaza**
los flags de PRD-003 por `enrutamiento_por_medio` y agrega
`plazo_confirmacion_transferencia`.

**Decisión.** `local.configuracion` es un `jsonb` que arranca vacío. Cada clave
la agrega la tarea que la usa, con su validación en el borde que la lee. Y una
regla que la acota: **lo que sostiene una invariante no vive ahí**. Dinero,
identidad y aislamiento son columnas con su restricción; `configuracion` guarda
lo que el administrador cambia sin desplegar y cuya forma todavía se mueve.

Por el mismo criterio, `local` tiene hoy `nombre` y nada más de "datos del
local": el RUT, la dirección y los datos de boleta que RF-A-09 y PRD-002 §5.5
van a pedir llegan con la tarea que los usa. Una columna que nadie llena en toda
la Fase 1 es una columna que el día que se use va a estar llena de nulos y de
suposiciones.

| Alternativa | Motivo del descarte |
|---|---|
| Una columna tipada por campo | Es lo correcto cuando el conjunto de campos es estable, y acá demostradamente no lo es: cuatro PRDs lo cambiaron y uno de ellos **borró** campos del anterior. Serían cuatro migraciones de columnas que ninguna invariante usa. Vuelve a ser la opción correcta en cuanto un campo empiece a sostener una restricción. |
| Una tabla clave-valor por local | Es un `jsonb` peor: pierde los tipos igual, agrega un `JOIN` a cada lectura y hace que leer la configuración completa sea una consulta con pivote. |
| Un archivo de configuración por local | Lo descarta AT-8 por escrito: *"un local no es un ambiente, y cambiarle un umbral no puede exigir un despliegue"*. RF-A-07, RF-A-09 y RF-A-12 son del administrador, no del equipo. |
| `jsonb` validado con un esquema JSON en un `CHECK` | Tentador, pero congela en una migración inmutable la forma de algo que cambia con cada PRD. La validación vive donde se lee, que es donde se sabe qué se espera. |

**Consecuencias.** La base no puede rechazar una clave mal escrita en
`configuracion`; eso tiene que hacerlo la lectura, y la tarea que agregue una
clave tiene que agregar su validación y su valor por defecto. Es el precio
aceptado, y es aceptable **solo** mientras se respete la regla de que nada con
una invariante detrás viva ahí.

### 10.4 AT-15 — La fecha del local la calcula la base

**Qué lo exige.** PRD-001 §13: *"zona horaria y turnos por local, porque 'visita
del día' y 'ventas del día' dependen de eso"*. PRD-001 §8: *"máximo **una visita
por día por local**, para evitar inflado"*. RF-A-06: ventas del día. PRD-006 §2,
regla 7: máximo un descuento por cliente **por día por local**.

**Decisión.** `local.zona_horaria` guarda un nombre IANA
(`America/Santiago`), validado con un `CHECK` al escribirlo, y
`pagaya.fecha_local(local, instante)` devuelve el día calendario de ese local.
Las tres reglas de arriba se escriben contra esa función y no contra `::date` de
un `timestamptz`, que daría el día del servidor.

Validar la zona horaria parece exagerado hasta que se piensa el fallo: un nombre
mal escrito no se nota al guardarlo, y el día que alguien calcule una fecha, o
la consulta revienta en hora punta o —peor— alguien la "arregla" cayendo a UTC y
el cierre de caja de un sábado queda partido en dos días.

| Alternativa | Motivo del descarte |
|---|---|
| Guardar un desfase fijo (`-03:00`) | Chile cambia de hora dos veces al año y la Isla de Pascua está en otro huso. Un desfase fijo es correcto seis meses al año. |
| Calcular la fecha en TypeScript | Se puede, pero entonces la regla "una visita por día por local" no se puede expresar como un índice único en la base, y vuelve a ser una comprobación que alguien puede saltarse. Es el mismo argumento de AT-4. |
| `SET TIME ZONE` por sesión, según el local | Cambia el significado de **toda** consulta de la transacción, incluidos los `now()` de auditoría, que deberían ser absolutos. Una función explícita afecta solo donde se la llama. |
| Dejarlo para cuando haya reportes (Fase 4) | La visita y el tope diario de descuento son de Fase 3 y de PRD-006, no de Fase 4, y los dos ya preguntan "¿qué día es en el local?". |

**Consecuencias.** Queda un supuesto que ningún PRD responde y que se registra
como **S-11**: el día operativo es el **día calendario** del local. Un restaurante
que cierra a las 02:00 tiene dos "días operativos" en una misma noche, y la
visita de quien pagó a las 01:30 cae al día siguiente. Nada en los PRDs dice lo
contrario, así que se construye así; cambiarlo es agregar un corte configurable
y es un PRD, no un parche.
## 11. La carga del local piloto (F1-05)

Lo exige **F1-05** del [backlog](backlog-fase-1.md): *"carga inicial del local
piloto por script: carta, mesas, QR, meseros y asignaciones"*, que **sustituye
por ahora a RF-A-01 a RF-A-04**, los requisitos del panel de administración que
llegan en la Fase 4 (PRD-001 §18). Hasta entonces, el local piloto se configura
con un archivo versionado y un comando.

No es una tarea menor por ser "solo un script": de F1-05 dependen F1-30 (la
carta del cliente) y F1-60 (las mesas del mesero), así que es el primer lugar
donde el modelo de datos de PRD-001 §12 se escribe como algo concreto.

```
AT-16 Contrato ──── el archivo del local es un contrato, y validarlo es la mitad
AT-17 Plan ──────── la idempotencia se calcula; la escritura, detrás de un puerto
```

### 11.1 AT-16 — El archivo del local es un contrato, y validarlo es la mitad

**Qué lo exige.** Lo que entra por acá es lo que RF-A-01 a RF-A-04 van a
administrar después: categorías, productos con precio y variantes (RF-A-01),
mesas y zonas con su QR (RF-A-02), usuarios del local (RF-A-03) y asignaciones
por turno (RF-A-04). Y lo que se cargue mal no se nota en la carga: se nota
cuando un cliente ve un precio equivocado (RF-C-03) o cuando un aviso de mesa no
le llega a nadie (PRD-001 §9).

**Decisión.** Un archivo **JSON versionado en el repositorio**
(`packages/carga-inicial/datos/local-piloto-demo.json`), con `"formato": 1` y
sin identificadores inventados: cada entidad se nombra por su **clave natural**
—el slug de la categoría, el sku del producto, el número de la mesa, el código
del mesero, `(turno, mesa)` para la asignación—. El validador no es un chequeo
de tipos: es donde viven las reglas que los PRDs ya fijaron.

- **Se reportan todos los problemas, no el primero.** Un cargador que falla de a
  un error por corrida convierte cada tipeo en un viaje de ida y vuelta con el
  humano, que es justo lo que F1-05 viene a ahorrar.
- **Una clave desconocida es un error, no algo que se ignora.** Un `"precios"`
  donde iba `"precio"` que pasa en silencio es un supuesto no escrito: el archivo
  dice una cosa y la base guarda otra.
- **La zona horaria tiene que ser una zona IANA en su forma canónica.** PRD-001
  §13 y §8: "visita del día" y "ventas del día" dependen de ella, así que un
  `America/Santiaago` corre el corte del día del local y no se descubre hasta el
  primer reporte.
- **Los precios son enteros**: el peso chileno no tiene decimales, y un `4500.5`
  que redondee en algún lado es una cuenta que no cuadra.
- **Un teléfono por mesero**, porque PRD-004 §3 y RF-C-02 (mod.) establecen una
  cuenta por número: dos meseros con el mismo número serían la misma cuenta con
  dos nombres.
- **Integridad referencial dentro del archivo**: un producto apunta a una
  categoría declarada, una mesa a una zona declarada, una asignación a un turno,
  un mesero y una mesa declarados.
- **Lo que no impide cargar pero alguien tiene que ver sale como aviso**: una
  mesa sin mesero en un turno (sus avisos escalan al administrador, PRD-001 §9)
  o una categoría sin productos (la carta la mostraría vacía).

| Alternativa | Motivo del descarte |
|---|---|
| `INSERT` escritos a mano, o una migración con los datos del local | Mezcla esquema con contenido: la migración es inmutable (AT-7) y la carta cambia cada semana. Y no hay dónde poner una validación: el primer error se descubre con la carta publicada. |
| Un CSV por entidad (como lo exporta una planilla) | Cómodo para el local, malo para las variantes y las asignaciones, que son anidadas; y no hay un lugar donde declarar la versión del formato. Si algún día el local entrega planillas, se convierten a este JSON, que es el contrato. |
| YAML | Más agradable de escribir y con dos trampas conocidas —la indentación y los valores que parecen otra cosa—, a cambio de una dependencia para leerlo. JSON lo lee la plataforma. |
| Un esquema JSON Schema con su validador de terceros | Verifica forma, no reglas: no sabe que el peso no tiene decimales, que la zona horaria tiene que ser canónica ni que una mesa tiene un solo mesero por turno. Terminaríamos con la mitad de las reglas en el esquema y la otra mitad en código, y una dependencia más. |
| Semillas escritas en TypeScript, como código | `tsc` las revisaría, pero volverían a ser código: cambiar un precio sería un cambio de programa, y el día que el administrador quiera cargar su carta no hay archivo que mandarle. |
| Adelantar un panel mínimo de la Fase 4 | Es la tarea que el backlog pone en la Fase 4 por una razón: un panel necesita identidad, roles y sesiones (F1-03) y pantallas. F1-05 son tres días y desbloquea F1-30 y F1-60. |

### 11.2 AT-17 — La idempotencia se calcula; la escritura vive detrás de un puerto

**Qué lo exige.** F1-05 pide que correr el cargador dos veces no duplique nada.
Y PRD-001 §12 obliga a algo menos obvio: los datos que carga **conviven con la
operación**. Un ítem de comanda guarda el precio al momento del pedido y
referencia a su producto; una mesa tiene estado (PRD-001 §15); RF-M-12 deja que
el mesero marque un producto como agotado en medio del servicio. El cargador
corre un martes a las nueve de la noche, no sobre una base vacía.

**Decisión.** El cargador **no escribe: planifica**. Lee el estado que ya
existe, lo compara por clave natural contra el archivo y produce una lista de
cambios —`crear`, `actualizar`, `baja`— que recién entonces se aplica.

- **La idempotencia es una propiedad verificable, no una promesa**: aplicar el
  plan y volver a planificar sobre el estado resultante da una lista vacía. Es
  lo que prueba `plan.prueba.ts`, y con cero cambios **no se abre ninguna
  transacción**.
- **`producto.disponible` se escribe solo al crear.** Es la consecuencia directa
  de RF-M-12: si el cargador reescribiera la disponibilidad, correrlo a las
  nueve volvería a poner en la carta el pescado que se acabó a las ocho. La
  disponibilidad es estado de operación, no configuración.
- **El cargador no borra.** Lo que existe en la base y el archivo ya no nombra se
  reporta como **huérfano** y se deja quieto: un producto retirado de la carta
  sigue referenciado por los ítems de comandas viejas (PRD-001 §12). La única
  excepción son las asignaciones de los turnos que el archivo **sí** declara,
  porque reasignar mesas es exactamente lo que RF-A-04 pide poder hacer.
- **Todo el plan se aplica en una transacción.** Un archivo cargado a medias deja
  mesas sin zona y asignaciones sin mesero, y la corrida siguiente ya no puede
  distinguir eso de un archivo editado a mano.
- **El orden del plan es parte del contrato** (`ORDEN_ENTIDADES`): la zona antes
  que la mesa que la referencia, la categoría antes que su producto. Quien
  implemente el puerto puede escribir el plan tal como viene.
- **La escritura vive detrás del puerto `RepositorioCarga`**, con dos métodos:
  leer el estado del local y escribir los cambios. Es la misma forma que AT-7 usa
  para las migraciones, y por la misma razón: permite probar la validación y la
  idempotencia **sin una base de datos encendida**.
- **El adaptador de PostgreSQL entra por `entreLocales`** (§10.2), que AT-13 dejó
  nombrada justamente para esto: dar de alta un local no puede filtrar por un
  `local_id` que todavía no existe, y la carga del resto escribe sobre un local
  que recién se creó en la misma corrida. Lo que falta para escribirlo no es la
  capa de acceso —F1-02 ya entregó `pagaya.local`, la RLS forzada y las tres
  entradas— sino **las tablas de la carta, las zonas, las mesas, el personal, los
  turnos y las asignaciones**, que nacen con las tareas que las usan (la mesa con
  F1-10) y que el cargador no crea: una herramienta no decide el modelo de datos.
  Hasta entonces el comando `cargar` **falla diciéndolo**, con el código
  `no_implementado`, y `plan` muestra qué escribiría. Un cargador que cargara en
  memoria y dijera que terminó sería un auto-reporte.
  **Ya hecho:** §12 (AT-18 escribe esas tablas y AT-19 el adaptador); `cargar`
  carga y `plan` lee el estado real.

| Alternativa | Motivo del descarte |
|---|---|
| Borrar todo lo del local y volver a insertarlo | Es la forma más simple de ser idempotente y la más fácil de confundir con un desastre: se lleva la disponibilidad que puso el mesero, los estados de mesa y, con las claves nuevas, la referencia de todo ítem de comanda ya existente (PRD-001 §12). |
| `INSERT ... ON CONFLICT DO UPDATE` directo, sin plan | Es idempotente y no se puede mostrar antes de correrlo, ni probar sin una base de datos, ni distinguir "no cambió nada" de "cambió todo". Y pisaría `disponible` en cada corrida, que es justo lo que RF-M-12 no tolera. |
| Identificadores (UUID) escritos en el archivo | Haría al archivo dueño de las claves primarias de la base y obligaría a inventar un UUID a mano por cada producto nuevo. La clave natural ya existe y es la que el local entiende: el número de la mesa. |
| Marcar como no disponible lo que el archivo ya no nombra | Mezcla dos significados en un campo que RF-M-12 ya usa para otra cosa —"se acabó hoy"— y dejaría al mesero sin poder reponerlo. Un producto que sale de la carta es una decisión que alguien toma, no un efecto de borrar una línea. |
| Aplicar los cambios de a uno, sin transacción | Deja estados intermedios que la corrida siguiente no sabe interpretar, y en una tarea cuyo único valor es ser repetible sin miedo. |
| Conectar el puerto a PostgreSQL ahora, creando las tablas acá | El aislamiento por local ya está (§10), pero las tablas de negocio no, y crearlas desde el cargador sería decidir el modelo de datos de la carta y de la mesa desde una herramienta de carga —con una migración inmutable (AT-7) escrita de paso—. Nacen con la tarea que las usa, y el backlog ya ordena esas dependencias. |

### 11.3 Lo que F1-05 no carga, y por qué

- **El PIN de mesa.** No es configuración de la mesa sino de su **sesión**: se
  genera y rota al abrirse y cerrarse (PRD-002 §3.1 y §3.4), y eso es F1-12. Un
  PIN cargado por script sería un PIN que no rota.
- **El estado de la mesa.** `libre | ocupada | …` es operación (PRD-001 §15), y
  lo maneja F1-10. Si el cargador lo escribiera, una segunda corrida liberaría
  una mesa ocupada.
- **Niveles, topes de descuento, propinas y medios de pago** (RF-A-07, RF-A-09,
  RF-A-18): son de las fases 2 y 3, y el archivo no los nombra para que nadie los
  cargue "por si acaso" antes de que exista la regla que los usa.
- **La URL del QR.** Se guarda el **token**; la URL se arma al imprimir (F1-11)
  porque el host depende del ambiente (§8.4) y el dato guardado no.

El ejemplo del repositorio es un local **ficticio** y se revisa como tal: una
prueba verifica que todos sus teléfonos estén en un rango que no se asigna en
Chile, para que nadie suba el número de alguien real junto con la carta.

## 12. El catálogo, las mesas y el personal (F1-06)

Las ocho tablas que el archivo de carga escribe y que el resto de la Fase 1 lee.
Las exige **F1-06** del [backlog](backlog-fase-1.md) ("Migración 0003 con las
tablas que el archivo de carga escribe y que F1-10 y F1-30 leen", PRD-001 §12),
que depende de **F1-02** —el aislamiento y la capa de acceso— y de **F1-05** —el
contrato del archivo y el plan—. Son las tablas de RF-A-01 a RF-A-04, los
requisitos del panel que llega en la Fase 4 y que F1-05 sustituye por ahora.

§7 dejó el "esquema de datos completo" fuera de las cuatro decisiones de arriba
y esta sección **no lo completa**: escribe lo que el cargador nombra y nada más.
La sesión de mesa, el PIN, la comanda, el pago y la visita siguen naciendo con
las tareas que las usan (§12.3).

Y es la tarea que vuelve falsa —a propósito— la última frase de AT-17: *"hasta
entonces el comando `cargar` falla diciéndolo, con el código
`no_implementado`"*. Ya no falla, y lo que lo demuestra no es esta sección sino
una prueba de integración que carga el archivo dos veces contra PostgreSQL.

```
AT-18 Esquema ──── la clave natural es del archivo, el id es de la base, y la
                   base solo revisa lo que ningún camino puede violar
AT-19 Adaptador ── el puerto de AT-17 sobre la capa de AT-13: una transacción
                   entre locales, y la idempotencia verificada contra PostgreSQL
```

### 12.1 AT-18 — La clave natural es del archivo, el id es de la base

**Qué lo exige.** PRD-001 §12 define las entidades —Usuario, Mesa, Asignación de
mesas, Producto— y AT-16 definió el contrato del archivo que las carga:
categorías, productos con precio y variantes (RF-A-01), mesas y zonas con su QR
(RF-A-02), usuarios del local (RF-A-03) y asignaciones por turno (RF-A-04). De
estas tablas leen F1-30 (la carta, RF-C-03), F1-10 (la mesa) y F1-60 (las mesas
del mesero, RF-M-01). Lo escribe la migración `0003_catalogo_mesas_y_personal.sql`,
inmutable como todas (AT-7).

**Decisión.** Ocho tablas —`usuario`, `zona`, `mesa`, `categoria`, `producto`,
`variante`, `turno`, `asignacion`— más dos columnas en `local`. Y cuatro reglas
que valen para todas:

- **Cada entidad tiene su clave natural única *dentro del local*** —el slug de
  la zona, el sku del producto, el número de la mesa, el código del mesero,
  `(turno, mesa)` para la asignación— y además su `id` uuid. El archivo no
  inventa identificadores (AT-17) y la base no depende de los nombres del
  archivo: `UNIQUE (local_id, <clave natural>)` es lo que une las dos cosas.
- **Una fila no puede apuntar a un padre de otro local.** Cada tabla lleva
  `UNIQUE (local_id, id)` y quien la referencia usa una clave ajena **compuesta**
  `(local_id, <padre>_id)`. La row level security no alcanza acá: `entreLocales`
  la apaga (AT-13) y es justo el camino por el que entra la carga, así que sin
  esto una asignación podría unir el turno de un local con la mesa de otro.
- **La base revisa lo que ningún camino de escritura puede violar; el archivo
  revisa su contrato.** En la base: identidad (`usuario`), dinero (`precio`
  entero, `moneda`), referencias, unicidad de las claves naturales y la
  cardinalidad de la asignación. En `validacion.ts`: rangos, la forma canónica de
  la zona horaria, el teléfono móvil chileno, que una variante no deje el precio
  bajo cero. Repetir en la base las del archivo no las haría más ciertas, y haría
  que cambiar el largo máximo de un nombre de producto pidiera una migración.
- **`local_id` encabeza todo índice** (§10.1, consecuencias). Los dos que no
  salen de una restricción son los que la operación va a consultar:
  `producto (local_id, categoria_id, orden)` para pintar la carta y
  `asignacion (local_id, mesero_id, turno_id)` para "mis mesas en este turno".

Lo que cada tabla decide por su cuenta:

- **`usuario` es la excepción al `local_id`, y ya estaba escrita.** §9.3 la
  decidió en F1-03 y la migración 0002 la dejó anotada en el comentario de
  `pagaya.tabla_sin_local`: `local_id` **nulo para el cliente y obligatorio para
  el personal**, porque PRD-001 §12 da el "local al que pertenece" solo a meseros
  y administradores y PRD-004 §3 hace de una cuenta de cliente una persona. Esta
  migración cumple las dos obligaciones que §10.1 le fijó: su política está
  escrita a mano —`entre_locales()`, o `local_id IS NULL`, o
  `local_id = local_actual()`— y su fila está en `pagaya.tabla_sin_local` con el
  motivo. La equivalencia `(rol = 'cliente') = (local_id IS NULL)` es un `CHECK`:
  ni un cliente con local ni un mesero sin él.
- **El teléfono es único en todo el sistema**, no por local (PRD-004 §3 y §8:
  "una cuenta por número de teléfono. Cierra el farmeo de niveles con cuentas
  múltiples"). El email no existe todavía: PRD-004 §3 lo deja "opcional y
  posterior, ofrecido desde el perfil, nunca en el registro".
- **Un cliente no se convierte en personal del local, ni al revés.** Es un
  disparador y no un `CHECK` porque mira la fila anterior. Lo exige la rama
  `local_id IS NULL` de la política: una transacción fijada en un local **tiene**
  que ver las filas de cliente —son de quien no pertenece a ningún local— y sin
  esta regla podría ascender una a mesero suyo con un `UPDATE`, que es acceso a
  las comandas de sus mesas (S-9). §9.4 ya había decidido el fondo: "un titular
  tiene un rol", y si el piloto encuentra el caso, "se cierra con un PRD, no con
  un campo". Pasar de mesero a administrador sigue permitido: eso es RF-A-03.
- **`UNIQUE (local_id, turno_id, mesa_id)` en `asignacion` es el supuesto S-13
  escrito en el esquema.** Una mesa tiene a lo más un mesero por turno porque
  PRD-001 §9 manda cada aviso "al mesero de la mesa", en singular, y escala al
  administrador cuando *no hay* asignación (F1-73). Hasta ahora eso solo lo
  revisaba el validador del archivo; ahora no se puede violar por ningún camino.
- **El estado de la mesa y la disponibilidad del producto son operación, no
  configuración.** `mesa.estado` (PRD-001 §15) no está: lo agrega F1-10, que es
  la tarea que tiene su máquina de estados, y si el cargador lo escribiera una
  segunda corrida liberaría una mesa ocupada (§11.3). `producto.disponible` sí
  está, con su valor inicial, porque RF-M-12 lo mueve durante el servicio y
  AT-17 ya decidió que el cargador solo lo escriba al crear.
- **`orden` no lleva unicidad en la base** aunque el archivo sí la exija entre
  las categorías: reordenar dos es intercambiar sus posiciones, y un `UNIQUE` no
  diferido rechazaría el estado intermedio de esa misma transacción.
- **El turno guarda `time` del reloj del local**, no instantes: un turno es
  "19:00 a 01:00" todos los días. `fin` menor que `inicio` significa que cruza
  medianoche —el caso normal de la cena—, así que lo único que no puede ser es
  que empiece y termine a la misma hora. Convertir esas horas a un instante es
  trabajo de `pagaya.fecha_local` (AT-15), no de `::date`.

| Alternativa | Motivo del descarte |
|---|---|
| Crear estas tablas en F1-05, con el cargador | Lo descartó AT-17 por escrito: sería decidir el modelo de datos de la carta y de la mesa desde una herramienta de carga, con una migración inmutable escrita de paso. Lo que cambió no es el argumento, es que ahora hay una tarea cuyo trabajo es justamente este. |
| Crear de una vez todo PRD-001 §12 —comanda, ítem, pago, visita, feedback— | Es la misma trampa un nivel más arriba. La comanda necesita `comanda.version` (AT-3) y el pago su índice único parcial y su `CHECK` del descuento (AT-4): esas restricciones son el corazón de F1-40 y de la Fase 2, y escribirlas desde acá las deja sin la prueba que las verifica. Una migración inmutable con una invariante a medias es peor que no tenerla. |
| Usar la clave natural como clave primaria, sin uuid | Cambiar el sku de un producto o el número de una mesa pasaría a reescribir en cascada todo lo que lo referencia, incluidos los ítems de comandas viejas (PRD-001 §12). Y RF-A-02 deja renumerar mesas. La clave natural identifica para el archivo; el id identifica para la base. |
| Una clave ajena simple a `zona(id)` en lugar de la compuesta con `local_id` | Más corta y deja pasar exactamente el error que importa: una mesa del local A en la zona del local B. Se paga con un `UNIQUE (local_id, id)` por tabla, que es un índice que de todos modos empieza por `local_id`. |
| Forzar en la base que el asignado sea `rol = 'mesero'` y no administrador | Se puede —una columna generada constante y una clave ajena a `usuario (local_id, rol, id)`— y el precio no vale la pena: bloquearía el cambio de rol de RF-A-03 mientras el mesero tenga mesas, y lo que evita es una fila sin sentido pero inofensiva. La clave ajena compuesta ya garantiza lo que importa: **personal de este local**, porque `usuario.local_id` solo es no nulo en el personal. Que sea mesero lo revisa el archivo. |
| `moneda` y el `slug` del local como claves de `local.configuracion` | AT-14 fija la regla y acá se aplica al revés: `moneda` sostiene una invariante de dinero y `slug` es una clave única que la base tiene que poder exigir. Ninguna de las dos es algo que el administrador cambie sin desplegar. |
| Repetir en la base los rangos del validador (capacidad 1 a 40, teléfono `+569`, zona IANA canónica) | Son el contrato del archivo, no del esquema. Puestos en la base, el mensaje de error deja de decir en qué línea del archivo está el problema, y el día que el local piloto tenga una mesa de 50 personas hay que escribir una migración. |

**Consecuencias.**

- **Una persona no puede ser mesero en dos locales**, porque su teléfono es único
  y su `local_id` obligatorio. No es una decisión de esta tarea: sale de PRD-001
  §12 y PRD-004 §3 juntos, igual que §9.4 ya había notado que hoy nadie puede ser
  mesero y cliente a la vez. Si el piloto lo encuentra, es un PRD.
- **La política de `usuario` deja ver las cuentas de cliente desde cualquier
  local.** Es lo que §9.3 pide y lo que hace posible autenticar a quien no
  pertenece a ningún local. Lo que no responde es qué columnas puede ver quién:
  que el mesero vea solo el nombre de pila y nunca los datos de contacto es
  **F1-64** (PRD-001 §14), en la capa de la consulta.
- **Sin local fijado solo se ven las cuentas de cliente**, porque para el
  personal `local_id = NULL` no es verdadero. El `porHuellaDeToken` de §9.3 —la
  única búsqueda que no filtra por local— va a tener que resolverse contra la
  tabla de sesiones, no contra ésta; es un dato para la tarea que la cree (§9.4),
  y queda dicho en la prueba que lo comprueba.
- **La migración 0003 agrega una columna `NOT NULL` con valor por defecto a una
  tabla que ya existía** (`local.moneda`) y una opcional (`local.slug`). Ninguna
  de las dos reescribe la tabla ni toca datos, así que no necesita encender
  `pagaya.entre_locales` —lo que sí necesitaría una migración que escribiera
  filas de negocio (§10.1, consecuencias).

### 12.2 AT-19 — El repositorio del cargador, y la idempotencia como prueba

**Qué lo exige.** AT-17 dejó la escritura detrás del puerto `RepositorioCarga` y
dijo qué faltaba para implementarlo: "no la capa de acceso […] sino las tablas de
la carta, las zonas, las mesas, el personal, los turnos y las asignaciones". Con
AT-18 ya están.

**Decisión.** `repositorioPostgres(acceso)` implementa el puerto sobre la capa
única de AT-13, y el cargador en memoria vuelve a ser lo único que siempre tuvo
que ser: el doble con el que se prueban la planificación y la idempotencia sin
PostgreSQL.

- **Entra por `entreLocales`, con motivo escrito.** Es la entrada que AT-13 dejó
  nombrada para esto: dar de alta un local no puede filtrar por un `local_id` que
  todavía no existe, y el resto de la carga escribe sobre un local que recién se
  creó en la misma corrida. Hay dos motivos distintos, uno para leer el estado y
  otro para escribir el plan, y los dos nombran a F1-05: el día que exista el
  registro de auditoría (F1-04) va a leerse ahí.
- **Todo el plan va en una transacción**, que es lo que AT-17 pide y que acá sale
  gratis: la capa de acceso no tiene consulta fuera de una transacción. Un
  archivo cargado a medias no existe.
- **Un solo mapa entre el contrato y el esquema.** Cada entidad declara su tabla,
  las partes de su clave natural, el campo → columna de cada dato y su consulta
  de lectura, en un único lugar. La alternativa —escribir la lectura y la
  escritura por separado— deja que las dos discrepen en silencio, y la forma en
  que eso se manifiesta es la peor posible: un plan que siempre quiere actualizar
  algo y una carga que nunca converge.
- **Las referencias se resuelven con el orden del plan.** `ORDEN_ENTIDADES` ya es
  parte del contrato del puerto (AT-17): la zona antes que la mesa, la categoría
  antes que su producto. El adaptador traduce la clave natural al `id` que generó
  la base, con una caché por corrida, y si una referencia no está, falla diciendo
  qué entidad y qué clave faltaba en lugar de escribir un nulo.
- **El adaptador no borra nada que no sea una asignación.** El plan solo produce
  bajas de asignación (AT-17, supuesto S-15), y el adaptador lo exige en lugar de
  suponerlo: una baja de producto o de mesa falla con su motivo. Es la misma
  regla de siempre —un producto retirado sigue referenciado por los ítems de
  comandas viejas (PRD-001 §12)— puesta donde ya no se puede saltar.
- **El comando `plan` deja de mentir.** Antes planificaba contra un local vacío
  en memoria, porque no había de dónde leer el estado; ahora lee el estado real y
  no escribe nada. `validar` sigue sin necesitar base de datos, que es lo que
  permite correrlo recién clonado el repositorio.
- **La idempotencia se verifica contra PostgreSQL, no solo contra el doble.** La
  prueba carga el archivo, vuelve a leerlo y compara campo por campo contra lo
  que el archivo declara; después lo carga otra vez y exige cero cambios y las
  mismas filas. Es la única forma de ver un `time` que vuelve como `'19:00:00'`
  donde el archivo dice `'19:00'`: el doble en memoria devuelve lo que guardó, y
  por eso no puede detectar nada de esto.

| Alternativa | Motivo del descarte |
|---|---|
| Que el adaptador use `conLocal` y el alta del local se haga aparte | Partiría la carga en dos transacciones: el local en una, su contenido en otra. Un fallo en la segunda deja un local vacío que la corrida siguiente no distingue de uno a medio cargar, y es exactamente lo que AT-17 prohíbe. |
| `INSERT … ON CONFLICT DO UPDATE` sobre la clave natural, sin plan | Ya lo descartó AT-17 por tres motivos que siguen en pie, y uno se nota recién acá: pisaría `disponible` en cada corrida, que es lo que RF-M-12 no tolera. Y seguiría sin poder mostrar nada antes de correrlo. |
| Generar el SQL desde el contrato en tiempo de ejecución, por reflexión sobre el esquema | Suena a menos código y es más: habría que consultar el catálogo de PostgreSQL para saber qué columnas existen, y el error de un campo mal mapeado aparecería en tiempo de ejecución en lugar de en `tsc`. El mapa explícito cabe en una pantalla y se lee. |
| Dejar la prueba de integración solo con "cargar dos veces no cambia nada" | Pasa igual con una lectura que devuelva basura consistente. Lo que la hace valer es comparar contra lo que **el archivo** dice, que es el único lado de la igualdad que no sale de la base. |
| Probar el aislamiento entre locales con un simulacro | Lo que se está probando es que PostgreSQL rechaza lo que el código podría dejar pasar: la política de la migración 0002 y las claves ajenas compuestas de AT-18. Un simulacro probaría el simulacro. |

**Consecuencias.**

- `make cargar-piloto` con `plan` o `cargar` necesita `PAGAYA_AMBIENTE` y la base
  del ambiente; `validar` no. Es la misma frontera que `make migrar`: verificar y
  validar no escriben en ninguna base, y lo que escribe es un paso explícito.
- `@pagaya/carga-inicial` gana dos aristas en `fronteras.json`: a
  `@pagaya/base-datos`, por el adaptador, y a `@pagaya/config`, porque como
  `apps/api` y `apps/repartidor` es un proceso que carga su propio ambiente para
  saber a qué base le habla. Sigue sin importar ningún módulo de dominio.
- `@pagaya/base-datos` gana una exportación, `migrarAmbiente(config)`: aplicar
  las migraciones con su pool y su cerrojo era un baile que `cli.ts` y las
  pruebas de integración repetían, y ahora que hay pruebas de integración en dos
  paquetes hacía falta una sola forma de pedir el esquema. El pool sigue sin
  salir del paquete (AT-13).
- Las pruebas de integración corren en procesos separados y en paralelo contra la
  misma base, así que cada archivo migra por su cuenta —el cerrojo de asesoría de
  AT-7 las serializa—, usa sus propios locales y los borra al terminar. Los
  teléfonos tienen que ser distintos entre archivos de prueba, porque el
  teléfono es único en todo el sistema (AT-18): es incómodo una vez y es la
  invariante de PRD-004 §3 funcionando.

### 12.3 Lo que F1-06 no crea, y por qué

- **La sesión de mesa, el PIN y el estado de la mesa** (F1-10, F1-12, F1-15). El
  PIN no es configuración de la mesa sino de su sesión, y rota al abrirse y
  cerrarse (PRD-002 §3.1 y §3.4); el estado es operación (PRD-001 §15). Ya lo
  decía §11.3: un PIN cargado por script sería un PIN que no rota.
- **La comanda, sus ítems y sus participantes, y todo el pago** (F1-40 en
  adelante y la Fase 2). Sus restricciones son las que AT-3 y AT-4 describen
  —`comanda.version`, el índice único parcial del cobro, el `CHECK` del
  descuento— y nacen con la tarea que las prueba.
- **La tabla de sesiones**, que §9.4 dejó pedida contra el puerto
  `RepositorioSesiones`. No la escribe el cargador y no la lee F1-30, así que no
  es de esta tarea; lo que esta tarea le deja es un dato: con la política de
  `usuario`, una búsqueda sin local fijado no encuentra al personal, así que la
  sesión va a tener que llevar lo que `porHuellaDeToken` necesita (§9.3).
- **Lo que PRD-004 §8 agrega al usuario y no escribe el cargador**:
  `estado_verificacion` y la tabla de verificación del OTP (F1-20), el
  `consentimiento` con su versión (F1-22, bloqueado por G-4) y
  `eliminacion_solicitada_en` (RF-C-23, sin fase asignada hasta que haya visitas
  y pagos que anonimizar). Están nombrados en el PRD y van a ser columnas de
  `usuario`; las agrega la tarea que las llena, por lo mismo que `local` sigue
  sin RUT ni dirección (AT-14): una columna que nadie llena llega al día en que
  se usa llena de nulos y de suposiciones.
- **El registro de auditoría** (F1-04). El motivo de cada `entreLocales` del
  cargador ya está escrito y hoy no va a ningún lado, igual que en AT-13.
- **Los niveles, las propinas, los medios de pago y los datos de boleta**
  (RF-A-07, RF-A-09, RF-A-18): son de las fases 2 y 3, el archivo no los nombra
  (§11.3) y `local.configuracion` los espera sin una columna por PRD (AT-14).

## 13. Mesa y sesión de mesa (F1-10a)

**F1-10a** del [backlog](backlog-fase-1.md) agrega `mesa.estado` (PRD-001 §12 y
§15) y la tabla `sesion_mesa` que PRD-002 §3.4 pide, con la invariante que
PRD-005 §6 refuerza sobre la misma sesión: "como máximo una comanda abierta por
mesa". Depende de **F1-02** —el aislamiento— y de la migración 0003, que ya
dejó dicho que el estado de la mesa "es operación, lo maneja F1-10".

### 13.1 AT-20 — La invariante es un índice parcial sobre `comanda`, no una columna de `mesa`

**Qué lo exige.** PRD-005 §6, literal: "se refuerza la invariante: como máximo
una comanda abierta por mesa". `mesa.estado` es la lectura operativa de ese
hecho, no la fuente: una columna se desincroniza si algo la actualiza a medias,
un índice único no puede.

**Decisión.** `pagaya.comanda` nace mínima —`id`, `local_id`, `mesa_id`,
`estado`— y un índice único parcial, `UNIQUE (local_id, mesa_id) WHERE estado =
'abierta'`, es la invariante completa: dos transacciones que intenten abrir la
segunda comanda de la misma mesa a la vez no pueden ganar las dos, sin
`SELECT … FOR UPDATE` ni un candado aparte. `sesion_mesa` vincula mesa y
comanda (PRD-002 §3.4) y es de a una por comanda, pero no repite el candado:
mientras exista como máximo una comanda abierta por mesa, no puede haber dos
sesiones abiertas vinculadas a comandas de esa misma mesa.

| Alternativa | Motivo del descarte |
|---|---|
| Un índice único sobre `mesa.estado = 'ocupada'` | Confunde la causa con el efecto: `mesa.estado` lo mueve la máquina de estados de F1-10b, una capa de aplicación, y el día que esa capa tenga un bug de por medio la mesa queda "ocupada" sin comanda o "libre" con una abierta. La comanda es el dato; el estado de la mesa es su proyección. |
| El candado en `sesion_mesa` en vez de en `comanda` | `sesion_mesa` es la entidad nueva de PRD-002 y `comanda` ya estaba nombrada como la que PRD-005 §6 refuerza. Poner el índice ahí exigiría además que toda apertura de sesión pasara por `sesion_mesa` antes que por `comanda`, un orden que ninguna tarea pidió. |
| `SELECT … FOR UPDATE` sobre la mesa antes de insertar la comanda | Serializa cada apertura detrás de un candado de fila que vive en el código de la aplicación, no en el esquema: quien escriba la siguiente tarea que abra una comanda (F1-14a) tendría que acordarse de pedirlo. El índice lo hace imposible de olvidar. |

**Consecuencias.**

- El error que ve quien intenta la segunda apertura es la violación del índice
  `comanda_una_abierta_por_mesa`, no un mensaje de negocio: traducirlo es
  trabajo de la capa que use este esquema (F1-10b, F1-14a), igual que
  `acceso.ts` no traduce los `CHECK` de identidad de la migración 0003.
- `comanda.version` (AT-3), `abierta_por` y `origen_primer_pedido` (PRD-005
  §6) no están: la migración de F1-70a y la de quien implemente el origen del
  primer pedido les agregan la columna, sin tocar ésta (AT-7, inmutable).

### 13.2 Lo que F1-10a no crea, y por qué

- **La máquina de estados** (F1-10b, en `@pagaya/mesa`). Esta migración declara
  los valores válidos de `mesa.estado` y `comanda.estado` en un `CHECK`; quién
  puede pasar de uno a otro es lógica de dominio, no del esquema.
- **El PIN de mesa** (F1-12a). PRD-002 §3.1 lo liga a `sesion_mesa` y lo rota al
  abrir cada sesión nueva (G-3): la tabla ya existe para que F1-12a la
  referencie, pero el PIN hasheado no es columna de esta migración.
- **Los clientes sentados y su vía de ingreso** (F1-41a, F1-13a). PRD-002 §3.4
  los nombra como parte de la sesión; viven en la tabla de participantes que
  todavía no existe, no en `sesion_mesa`.
- **`abierta_por` y `origen_primer_pedido` en `comanda`** (PRD-005 §6). Son del
  primer pedido del mesero, una decisión de F1-14a y F1-80b; agregarlos acá
  sería decidir esa tarea desde ésta.

## 14. El puerto de encolar, antes de `evento_salida` (F1-20a)

### Qué lo exige

- **RF-C-02, PRD-004 §3:** el canal del OTP es configurable (SMS por defecto),
  y el proveedor vive detrás de una interfaz (AT-1).
- **AT-2 (§3):** ningún módulo de dominio llama al proveedor de notificación;
  escribe un evento en la misma transacción que su cambio de negocio. La misma
  razón que vale para el push vale para el OTP: un envío directo que se pierde
  entre generar el código y mandarlo es la escritura doble que AT-2 ya descartó.
- F1-20a llega antes que **F1-70b**, que es quien crea `evento_salida` y el
  repartidor real. El camino crítico del backlog (F1-20 → F1-21 → F1-23, el más
  largo de la Fase 1) no puede esperar a que esa tabla exista.

### Decisión

`@pagaya/notificacion` define el puerto `Outbox`, con un solo método:
`encolar(evento: { tipo, payload }): Promise<EventoSalida>`, donde
`EventoSalida` agrega `idEvento` y `creadoEn`. Es la forma mínima que AT-2 ya
fijó para la tabla, expresada como interfaz de TypeScript en lugar de columnas.
`identidad` llama a este puerto desde `crearServicioOtp` (`registro.ts`) para
encolar un evento `otp_solicitado`, con el canal, el teléfono, el dispositivo y
el código — nunca a un `ProveedorCodigo` directamente.

**Contrato que F1-70b tiene que cumplir (AT-25):** su adaptador de PostgreSQL
implementa `Outbox` contra `evento_salida`, en la misma transacción que lo
llama (AT-2 ya lo exige); `idEvento` lo asigna la implementación, no el
productor; `encolar` devuelve el evento con su `creadoEn`, para que quien lo
llame pueda loguear sin una segunda consulta. El repartidor (`FOR UPDATE SKIP
LOCKED`, `LISTEN/NOTIFY`) consume esos eventos y ahí, y solo ahí, vive el
adaptador real que implementa `ProveedorCodigo` (`identidad/registro.ts`) para
cada `tipo` de evento.

### Alternativas descartadas

| Alternativa | Motivo del descarte |
|---|---|
| Esperar a F1-70b para empezar el OTP | Rompe la cadena más larga del backlog (supuesto 7); el puerto deja avanzar F1-20a a F1-23 en paralelo con F1-70. |
| `identidad` llama a un `ProveedorCodigo` (SMS) directamente | Viola AT-2 por el mismo motivo que lo prohíbe para el push: una escritura doble que se pierde en silencio. |
| Una tabla de encolado propia de `identidad`, aparte de `evento_salida` | Duplicaría el repartidor y el orden por versión de AT-2; migrar esos eventos a la tabla real cuando F1-70b exista es trabajo que no aporta nada hoy. |

### Consecuencias

- `outboxEnMemoria` (`@pagaya/notificacion`) es el único adaptador que existe
  hoy: no persiste entre procesos y no es el repartidor. Nunca entra a
  producción; eso lo reemplaza F1-70b sin tocar el código que llama a `Outbox`.
- El código del OTP viaja en el `payload` del evento, en claro. F1-70b decide
  si `evento_salida` lo cifra en reposo (PRD-001 §14) antes de entregarlo.

**F1-10a** del [backlog](backlog-fase-1.md) agrega `mesa.estado` (PRD-001 §12 y
§15) y la tabla `sesion_mesa` que PRD-002 §3.4 pide, con la invariante que
PRD-005 §6 refuerza sobre la misma sesión: "como máximo una comanda abierta por
mesa". Depende de **F1-02** —el aislamiento— y de la migración 0003, que ya
dejó dicho que el estado de la mesa "es operación, lo maneja F1-10".

### 13.1 AT-20 — La invariante es un índice parcial sobre `comanda`, no una columna de `mesa`

**Qué lo exige.** PRD-005 §6, literal: "se refuerza la invariante: como máximo
una comanda abierta por mesa". `mesa.estado` es la lectura operativa de ese
hecho, no la fuente: una columna se desincroniza si algo la actualiza a medias,
un índice único no puede.

**Decisión.** `pagaya.comanda` nace mínima —`id`, `local_id`, `mesa_id`,
`estado`— y un índice único parcial, `UNIQUE (local_id, mesa_id) WHERE estado =
'abierta'`, es la invariante completa: dos transacciones que intenten abrir la
segunda comanda de la misma mesa a la vez no pueden ganar las dos, sin
`SELECT … FOR UPDATE` ni un candado aparte. `sesion_mesa` vincula mesa y
comanda (PRD-002 §3.4) y es de a una por comanda, pero no repite el candado:
mientras exista como máximo una comanda abierta por mesa, no puede haber dos
sesiones abiertas vinculadas a comandas de esa misma mesa.

| Alternativa | Motivo del descarte |
|---|---|
| Un índice único sobre `mesa.estado = 'ocupada'` | Confunde la causa con el efecto: `mesa.estado` lo mueve la máquina de estados de F1-10b, una capa de aplicación, y el día que esa capa tenga un bug de por medio la mesa queda "ocupada" sin comanda o "libre" con una abierta. La comanda es el dato; el estado de la mesa es su proyección. |
| El candado en `sesion_mesa` en vez de en `comanda` | `sesion_mesa` es la entidad nueva de PRD-002 y `comanda` ya estaba nombrada como la que PRD-005 §6 refuerza. Poner el índice ahí exigiría además que toda apertura de sesión pasara por `sesion_mesa` antes que por `comanda`, un orden que ninguna tarea pidió. |
| `SELECT … FOR UPDATE` sobre la mesa antes de insertar la comanda | Serializa cada apertura detrás de un candado de fila que vive en el código de la aplicación, no en el esquema: quien escriba la siguiente tarea que abra una comanda (F1-14a) tendría que acordarse de pedirlo. El índice lo hace imposible de olvidar. |

**Consecuencias.**

- El error que ve quien intenta la segunda apertura es la violación del índice
  `comanda_una_abierta_por_mesa`, no un mensaje de negocio: traducirlo es
  trabajo de la capa que use este esquema (F1-10b, F1-14a), igual que
  `acceso.ts` no traduce los `CHECK` de identidad de la migración 0003.
- `comanda.version` (AT-3), `abierta_por` y `origen_primer_pedido` (PRD-005
  §6) no están: la migración de F1-70a y la de quien implemente el origen del
  primer pedido les agregan la columna, sin tocar ésta (AT-7, inmutable).

### 13.2 Lo que F1-10a no crea, y por qué

- **La máquina de estados** (F1-10b, en `@pagaya/mesa`). Esta migración declara
  los valores válidos de `mesa.estado` y `comanda.estado` en un `CHECK`; quién
  puede pasar de uno a otro es lógica de dominio, no del esquema.
- **El PIN de mesa** (F1-12a). PRD-002 §3.1 lo liga a `sesion_mesa` y lo rota al
  abrir cada sesión nueva (G-3): la tabla ya existe para que F1-12a la
  referencie, pero el PIN hasheado no es columna de esta migración.
- **Los clientes sentados y su vía de ingreso** (F1-41a, F1-13a). PRD-002 §3.4
  los nombra como parte de la sesión; viven en la tabla de participantes que
  todavía no existe, no en `sesion_mesa`.
- **`abierta_por` y `origen_primer_pedido` en `comanda`** (PRD-005 §6). Son del
  primer pedido del mesero, una decisión de F1-14a y F1-80b; agregarlos acá
  sería decidir esa tarea desde ésta.

## 45. Leer la carta sin sesión (F1-30a)

**F1-30a** del [backlog](backlog-fase-1.md) expone RF-C-03 (mod. PRD-004 §2.2:
"la carta se puede ver completa y sin registro") y RF-C-24 ("ver la carta […]
sin registro"). Depende de **F1-06** (migración 0003, §12): lee `categoria`,
`producto` y `variante`, y no agrega ninguna tabla ni columna.

### AT-90 — Una ruta sin sesión, con el id del local en la URL; `conLocal` igual que cualquier lectura de negocio

**Qué lo exige.** RF-C-24 pide la carta sin registro, no sin local: alguien
tiene que decir de qué local, y AT-13 no tiene una cuarta forma de mirar la
base además de `conLocal`, `sinLocal` y `entreLocales`. Explorar sin cuenta no
es lo mismo que explorar sin local.

**Decisión.** `GET /locales/<id>/carta` en `@pagaya/api`, sin leer ninguna
cabecera de sesión, llama a `leerCarta(acceso, id)` en `@pagaya/base-datos`:
`conLocal` filtra por `local_id` con la misma *row level security* que
cualquier otra consulta (AT-13), y lo único que esta ruta no exige es una
cuenta. `leerCarta` junta `categoria`, `producto` y `variante` por `orden`
—el que el archivo de carga declaró (AT-18)— y devuelve `disponible` como
campo, sin filtrar: RF-C-03 pide verla, no ocultar lo agotado. Un `id` que no
es UUID responde 400 (el mismo `acceso_invalido` de AT-13); un local sin filas
responde 200 con la carta vacía, porque no es un error, es RLS funcionando.

| Alternativa | Motivo del descarte |
|---|---|
| Resolver el local por `local.slug` en la URL | S-16 deja `slug` opcional *a propósito* y dice que se vuelve obligatorio "el día que salga en una URL", con su propia migración. Esta tarea no agrega migraciones; forzar `slug` en la ruta habría sido tomar esa decisión de paso, sin PRD ni migración que la respalde. |
| Exigir el `qr_token` de una mesa para resolver el local | Acopla leer la carta a haber escaneado una mesa (RF-C-01), que es un flujo distinto y posterior (F1-11); RF-C-24 nombra la carta y la mesa como dos cosas separadas. |
| Filtrar `producto.disponible = true` en la consulta | RF-C-03 es explícito: la carta muestra "precio **y disponibilidad**". Ocultar lo agotado sería responder una pregunta distinta a la que RF-M-12 plantea (mostrarlo tachado, por ejemplo), y esa es una decisión de UI de F1-30b, no de esta lectura. |
| Autenticar la ruta igual, aunque sea con un token anónimo | PRD-004 §2.2 es categórico: "explorar nunca exige identidad". Inventar un token igual sería la misma exigencia con otro nombre. |

**Consecuencias.**

- `@pagaya/api` gana su primera dependencia real de `@pagaya/base-datos`
  (ya declarada en `fronteras.json` desde F1-01) y su primera ruta de negocio;
  `crearServidor` recibe el `Acceso` inyectado y `principal.ts` lo cierra al
  apagarse, igual que ya cierra el servidor.
- La URL lleva el `id` del local, no su `slug`: quien construya el enlace del
  QR (F1-11) necesita saber ese `id`, y hoy no hay ninguna ruta que lo
  resuelva desde algo más corto. Es la pregunta que F1-30b o F1-11 van a tener
  que responder, no esta tarea.

## 46. La pantalla de la carta en `@pagaya/web` (F1-30b)

**F1-30b** del [backlog](backlog-fase-1.md) expone RF-C-03 (mod.) — "ver la
carta con categorías, foto, descripción, precio y disponibilidad" — mostrando
lo que **F1-30a** (§45) ya sirve en `GET /locales/<id>/carta`. No agrega
migraciones ni toca `@pagaya/api` ni `@pagaya/base-datos`.

### AT-95 — Renderizar a string, sin marco de interfaz ni empaquetador todavía

**Qué lo exige.** `apps/web/src/index.ts` (F1-01) ya deja dicho que el marco
de interfaz y el empaquetador se eligen con el requisito que los decide,
PRD-001 §14 (uso en gama baja y conexión pobre), y esa es la tarea **F1-30c**,
no esta. AT-6 (§8.2) tampoco acepta un paso de compilación todavía.

**Decisión.** `renderizarCarta(categorias)` en `pantallaCarta.ts` devuelve un
string de HTML a partir de `RespuestaCarta` (tipo nuevo en `@pagaya/contrato`,
junto a `rutaCarta`, espejo de lo que ya devuelve la ruta de F1-30a). Es puro:
sin `document` ni `fetch`, así que la prueba de F1-30b ("muestra la carta
completa de un local de prueba") corre con `node --test` armando el string
esperado, sin navegador ni `jsdom`. Los colores y la tipografía son variables
CSS en `estilos.css` (`--pagaya-color-*`, `--pagaya-tipografia-*`): hoy son una
paleta neutra porque no hay identidad visual, y F1-30c (o quien la traiga) las
cambia sin tocar el marcado.

| Alternativa | Motivo del descarte |
|---|---|
| Elegir ya un marco (React, una plantilla con Vite) | Es la decisión de F1-30c, que la ata al presupuesto de rendimiento (PRD-001 §14); elegirla acá la tomaría sin esa medición. |
| Probarlo con `jsdom` montando el DOM real | Agrega una dependencia nueva para una pantalla que todavía no se sirve en un navegador (eso también es F1-30c); el string ya prueba el contenido que RF-C-03 pide. |
| Mandar el HTML de la carta desde `@pagaya/api` | La API no sabe de interfaz (AT-1); mezclar marcado con la ruta de negocio obligaría a versionarlo junto al contrato de datos, no al de presentación. |

### AT-96 — Lo agotado se muestra tachado y con aviso, nunca oculto

**Qué lo exige.** AT-90 (§45) dejó explícito que ocultar `producto.disponible
= false` sería "responder una pregunta distinta a la que RF-M-12 plantea" y
que el cómo mostrarlo es decisión de esta tarea; RF-C-03 pide ver la
disponibilidad, no inferirla por ausencia.

**Decisión.** Cada producto agotado lleva la clase `producto--agotado` (nombre
tachado por CSS) y un `<span class="producto__agotado">Agotado</span>` junto
al nombre. Ningún producto se filtra ni se reordena por disponibilidad: el
orden sigue siendo el de `orden` (AT-18), igual que lo entrega F1-30a.

| Alternativa | Motivo del descarte |
|---|---|
| Ocultar los agotados | Es exactamente lo que AT-90 ya descartó para la API; repetirlo en la pantalla contradice RF-C-03. |
| Solo tachar, sin aviso de texto | El tachado no es accesible para lectores de pantalla ni se distingue bien en gama baja con poco contraste; el texto "Agotado" no depende de verlo. |
| Mover los agotados al final de su categoría | Reordenar por disponibilidad es una decisión de producto que ningún RF pide hoy; además divergiría del orden que ya fija AT-18. |
