# PRD-008 — Resultados de la reunión con Fintoc: plataforma de subcomercios, tarjeta guardada y Google Pay sin proveedor

| | |
|---|---|
| **Versión** | 008 |
| **Estado** | Vigente |
| **Fecha** | 2026-10-08 |
| **Reemplaza a** | PRD-007 |

---

## 0. Cambios en esta versión

**Motivo del cambio:** la reunión comercial con Fintoc y la lectura de su guía
pública de cobro traen hechos que PRD-007 no tenía y que contradicen uno de los
que daba por verificado. PRD-007 §1 afirmó que Fintoc activa **Apple Pay y
Google Pay** automáticamente; Fintoc dice que **Google Pay no está lanzado**.
Ese era el único proveedor de Google Pay (PRD-007 §2.1), así que hoy el medio no
tiene quién lo cobre. Al mismo tiempo aparecen dos cosas que el proyecto
necesitaba: **tokenización de tarjetas**, que cierra D-14, y **subcomercios**,
que es el modelo con el que PAGAYA puede integrar una vez y cobrar para muchos
locales. Este PRD escribe los cuatro hechos, cierra lo que cierran y abre
explícitamente lo que dejan abierto.

### Se agregó
- **§1 Hechos de la reunión y de la guía pública**, con su fuente, sin
  reinterpretación.
- **§2.1 Modelo de plataforma:** PAGAYA integra Fintoc **una vez** y cada local
  es un **subcomercio**; el destinatario del cobro se personaliza con
  `business_profile`.
- **§2.2 El cobro es un Checkout Session alojado:** el backend lo crea, el
  cliente va al checkout y vuelve por `success_url` o `cancel_url`; la
  confirmación sigue siendo **solo por webhook**, con los eventos nombrados.
- **§2.3 Tarjeta guardada en el MVP** para el cliente registrado.
- **§2.4 Google Pay sin proveedor:** no se muestra en ningún dispositivo.
- **RF-C-32, RF-C-33, RF-C-34, RF-A-20** (§3).
- Campos al modelo de datos: `id_checkout_session`, `id_payment_intent`,
  `medios_solicitados`, `subcomercio_id` y la entidad **Medio guardado** (§4).
- **D-18** (quién recibe los fondos y quién los liquida al local), **D-19**
  (quién paga las 2 UF mensuales de la cuenta apificada, y si es una por local o
  una sola para PAGAYA) y **D-20** (si PAGAYA puede recibir dinero de terceros):
  abiertas, con su supuesto (§7).

### Se modificó
- **PRD-007 §1 y §2.1 (hecho verificado de las billeteras)** — antes: *"Apple
  Pay y Google Pay activados automáticamente"* en Fintoc. Ahora: **Google Pay no
  está lanzado en Fintoc**, está en proceso de lanzamiento (§1, hecho 2). Apple
  Pay no cambia de estado: sigue sin confirmarse en producción y sigue
  deshabilitado por G-2.
- **PRD-007 §2.1 (reparto por medio)** — la fila de **Google Pay** pasa de
  "Fintoc, sin respaldo" a **sin proveedor**: el medio queda deshabilitado en la
  configuración de todos los locales (RF-A-18) y **no se muestra** (RF-C-34).
- **PRD-007 §2.3 (pantalla de pago)** — el **orden de los tres grupos no
  cambia**; lo que cambia es qué hay dentro: el primer grupo queda **vacío
  mientras ninguna billetera tenga proveedor en producción**, y el tercero
  **suma la tarjeta guardada** (§2.3). Y se explicita que la pantalla es de
  PAGAYA y el cobro ocurre en el checkout del proveedor (§2.2).
- **PRD-002 §8 (métrica "pagos con billetera ≥ 25 %") y PRD-007 §6 (primera
  fila, "≥ 50 % de los pagos donde la billetera se mostró")** — ambas quedan
  **suspendidas, no eliminadas**: con Google Pay sin lanzar y Apple Pay sin
  confirmar, en Android **no hay billetera** y el denominador de la segunda es
  cero. Se reactivan cuando al menos una billetera esté en producción, y la
  segunda se mide **por plataforma** desde entonces (§6).
- **PRD-007 §2.2 (caída de Fintoc)** — la frase *"deja al local sin
  transferencia, sin Google Pay y sin Apple Pay"* pierde Google Pay, que ya no
  se ofrecía. El resto del comportamiento no cambia.
- **PRD-007 §2.4 (consulta al proveedor al vencer la transferencia)** — la guía
  pública **no documenta consulta de estado**. La regla no se relaja; se le da
  un camino documentado mientras G-2 no la confirme: el vencimiento se reconoce
  por el webhook `checkout_session.expired` y el cobro manual se ofrece **solo**
  al recibirlo (§2.5, supuesto).
- **PRD-007 §2.4 y PRD-006 §2.6 (congelamiento de los participantes)** — antes:
  los participantes se congelaban y *"No es mi mesa"* (RF-C-21) se encolaba
  **solo en la transferencia**, y para los demás medios PRD-006 §2.6 mandaba
  rechazar el intento. Ahora **todos** los medios pasan por un checkout alojado
  con confirmación diferida (§2.2), así que el congelamiento de participantes y
  el encolado **se extienden a todos los medios** y empiezan al **crear la
  sesión**, no al volver el cliente. PRD-006 §2.6 y su criterio 4 quedan **sin
  medio en el que aplicarse**: ningún intento se rechaza por un cambio de
  participantes. El monto no cambia nunca: manda la instantánea (PRD-006 §2.4).
- **RF-M-18** — antes: al vencer el plazo, el cobro manual se ofrece *"solo si la
  consulta al proveedor dice que el pago no está hecho"*. Ahora se ofrece **solo
  al recibir `checkout_session.expired`** (§2.5); sin evento, no se ofrece y el
  mesero solo puede **forzarlo**, que es lo que PRD-007 ya le permitía. El resto
  del requisito no cambia.
- **RF-C-31** — antes: escrito **solo para la transferencia** (*"esperando la
  confirmación de tu banco"*) y con el reintento condicionado a la consulta al
  proveedor. Ahora aplica a **todos los medios** (§2.2), el texto deja de
  nombrar al banco cuando el medio no es la transferencia, y el reintento se
  habilita con el evento de vencimiento en lugar de la consulta.
- **PRD-002 §5.2 (interfaz única de proveedor)** — la interfaz **se mantiene
  entera**, con sus cinco operaciones, pero dos de ellas —**consultar** y
  **reembolsar**— quedan **sin implementación verificada** en Fintoc (hecho 8).
  No se quitan del contrato: la implementación queda pendiente de G-2 y §2.5 da
  el camino conservador mientras no exista.
- **PRD-007 §2.2 y §8 criterio 11 (reenrutamiento automático de la tarjeta)** —
  se mantienen, **acotados**: el reenrutamiento es invisible para el cliente solo
  si la caída se detecta **antes** de crear la sesión. Una caída posterior a la
  redirección no se reenruta y cae en el ciclo de §2.5 (§2.2).
- **PRD-007 §8, criterio 9** (*"transferencia vencida pero pagada en el
  proveedor"*) — queda **reemplazado** por los criterios 6 y 7 de §8: sin
  consulta de estado, "vencida pero pagada" no es distinguible, y la salida
  conservadora es la de §2.5.
- **PRD-007 §6, filas de billetera** (*"billeteras ofrecidas cuya hoja no se
  abre"* y *"Apple Pay rechazados por marca no soportada"*) — **suspendidas por
  el mismo motivo** que las dos métricas de billetera ya nombradas: con ninguna
  billetera ofrecida, su denominador también es cero (§6).
- **PRD-001 §10 (medio de pago guardado)** — deja de ser una promesa sin
  proveedor: entra al MVP sobre la tokenización de Fintoc (§2.3, RF-C-33).
- **RF-C-10** — se mantiene su lista de medios y se le agrega la **tarjeta
  guardada** del cliente registrado, que **no es un medio nuevo** sino la tarjeta
  pagada con un token (§2.3); **Google Pay deja de ofrecerse** hasta que tenga
  proveedor.
- **RF-A-18** — el enrutamiento por medio se mantiene tal cual y se le agrega
  que un medio **sin proveedor** no es habilitable, y el `subcomercio_id` del
  local (§4).
- **G-2** — **se reescribe** con lo que sigue pendiente después de esta reunión
  (§7). Lo que la reunión respondió sale de G-2; lo que no, se queda con su
  nombre propio.
- **D-14** — **cerrada**: la tarjeta guardada entra al MVP (§2.3).
- **D-15** (devolución de una transferencia) — **sigue abierta**: la guía pública
  no documenta devoluciones. Su supuesto no cambia y la pregunta pasa a G-2.
- **`docs/arquitectura.md` §7** — la línea del enrutamiento Fintoc/Kushki pasa a
  nombrar también este PRD, porque G-2 ya no es la de PRD-007 §7.

### Se eliminó
- **Google Pay como medio ofrecido.** No se elimina el requisito: el medio
  **sigue en el modelo de datos y en el enrutamiento**, deshabilitado y sin
  proveedor, porque Fintoc lo tiene en proceso de lanzamiento (§2.4). Lo que
  desaparece es el botón.
- Ningún otro requisito se elimina.

**Sin cambios:** la **confirmación del pago solo por webhook** (PRD-001 §10),
**un solo cobro con la propina incluida** (PRD-002 §5.4), la **idempotencia del
cobro dentro de PAGAYA** —a lo más un pago en `autorizando` o `pagado` por
comanda—, el **congelamiento del consumo de la comanda** al iniciar el cobro
(PRD-001 §10; lo que cambia arriba es el de los **participantes**), que **PAGAYA
no almacena datos de tarjeta**, que **el local siempre puede cobrar** por la vía
tradicional (PRD-001 §14 y §16) y que el **cobro manual nunca se bloquea**, el
respaldo manual de Apple Pay y **Webpay Plus por Kushki** (PRD-007 §2.1, §2.2),
el **plazo de 3 minutos** configurable (RF-A-18), la regla de visibilidad
**cerrado por defecto** y el caso de la **PWA instalada** (PRD-007 §2.3), y
RF-C-29, RF-C-30, RF-A-19 y RF-A-17. Todo lo demás sigue
vigente según los PRD-001 a 007: propinas, PIN de mesa, PAGAYA ID y sus reglas
de seguridad, registro obligatorio para pedir, apertura de mesa por el mesero,
escala de niveles, exención de feedback y la regla del beneficiario por
presencia (PRD-006 §2).

---

## 1. Contexto

Dos fuentes, dos fechas, ninguna reinterpretación.

**Fuente A — reunión comercial con Fintoc, 2026-10-08:**

| # | Hecho |
|---|---|
| 1 | Fintoc permite **tokenizar tarjetas**. |
| 2 | **Google Pay no está lanzado** en Fintoc; está **en proceso de lanzamiento**. |
| 3 | Fintoc permite **subcomercios**. |
| 4 | Fintoc trabaja con **cuentas apificadas**; puede abrirlas, con un costo de **2 UF mensuales**. **No se precisó** si es por cuenta de cada local o una sola cuenta para PAGAYA. |

**Fuente B — guía pública `https://docs.fintoc.com/guides/payments/accept-a-payment`:**

| # | Hecho |
|---|---|
| 5 | El pago es un **Checkout Session alojado por Fintoc**: el backend lo crea, el cliente es redirigido y vuelve por `success_url` o `cancel_url`. La confirmación llega por **webhook** (`payment_intent.succeeded`, `.failed`, `.requires_action`; `checkout_session.finished` y `.expired`). |
| 6 | **`payment_method_types`** limita los medios de una sesión. En Chile están documentados **`bank_transfer`** y **`card`**. **Apple Pay y Google Pay no aparecen** en esa guía. |
| 7 | **`business_profile`** personaliza el destinatario cuando se cobra para un **subcomercio**. |
| 8 | La guía **no documenta idempotencia, consulta de estado ni devoluciones**. |

Tres cosas se leen solas:

1. **El hecho 2 corrige a PRD-007.** PRD-007 §1 tomó de la página de producto de
   Fintoc que Apple Pay y Google Pay venían activados; el proveedor dice que
   Google Pay todavía no. Como Fintoc era su **único** proveedor (PRD-007 §2.1,
   "no figura en la documentación de Kushki"), Google Pay **no tiene quién lo
   cobre**. Y como Apple Pay sigue sin confirmarse en producción, hoy **en
   Android no hay ninguna billetera**: eso golpea las metas de billetera de
   PRD-002 §8 y PRD-007 §6, que se escribieron suponiendo que las dos existían.
2. **Los hechos 1 y 3 habilitan dos cosas que el proyecto quería.** La
   tokenización responde a D-14 con el proveedor que ya es el principal, y los
   subcomercios responden a algo que ningún PRD había escrito todavía: cómo
   cobra PAGAYA para muchos locales sin integrar uno por uno.
3. **El hecho 8 no es un detalle.** PRD-007 §2.4 apoya todo el ciclo de la
   transferencia en *consultar al proveedor* y D-15 en *devolver*. Que la guía
   no los documente no significa que no existan; significa que no están
   verificados, y la diferencia va a G-2 (§7).

## 2. Alcance del cambio

### 2.1 Modelo de plataforma: PAGAYA integra una vez, el local es subcomercio

PAGAYA **integra Fintoc una sola vez** con sus propias credenciales y cada local
**se da de alta como subcomercio** (hecho 3). Cada cobro identifica al local como
destinatario mediante `business_profile` (hecho 7), para que el cliente vea el
nombre del restaurante donde está comiendo y no el de PAGAYA.

Por qué así: la alternativa es que cada local traiga su propia cuenta y sus
propias credenciales. Eso convierte el alta de un local en un proyecto de
integración, y PRD-001 §13 ya exige multi-tenant desde el día uno. Con
subcomercios, dar de alta un local es configuración (RF-A-20).

Lo que este modelo **no resuelve y queda abierto**: quién recibe los fondos y
quién los liquida al local (**D-18**), quién paga las 2 UF mensuales de la cuenta
apificada y si es una por local o una sola para PAGAYA (**D-19**, hecho 4, donde
el propio hecho dice que no se precisó), y si PAGAYA puede **recibir dinero de
terceros** sin una autorización que hoy no tiene (**D-20**). Las tres en §7.

### 2.2 El cobro es un Checkout Session alojado por el proveedor

El flujo del hecho 5, sin adornos:

1. El cliente elige el medio **en la pantalla de PAGAYA** (§2.3).
2. El **backend de PAGAYA** crea el Checkout Session con el monto
   `consumo − descuento + propina` —**un solo cobro**, PRD-002 §5.4—, el
   `business_profile` del local (§2.1) y los `payment_method_types` del medio
   elegido (§2.5).
3. El cliente es **redirigido** al checkout del proveedor y vuelve por
   `success_url` o `cancel_url`.
4. **La vuelta no confirma nada.** La comanda pasa a `pagada` solo con el
   webhook, exactamente como ya manda PRD-001 §10 y como PRD-007 §2.4 lo dice
   para la transferencia. `success_url` muestra *"esperando la confirmación"*
   (RF-C-31); `cancel_url` devuelve a la pantalla de medios.
5. Los eventos que PAGAYA consume son los del hecho 5:
   `payment_intent.succeeded` → `pagado`; `payment_intent.failed` → `rechazado`;
   `payment_intent.requires_action` → el intento **sigue** `autorizando`, no se
   libera el índice de idempotencia; `checkout_session.finished` cierra la
   sesión; `checkout_session.expired` es el vencimiento (§2.5).

Dos consecuencias que no son del medio sino del checkout alojado, y que por eso
alcanzan a **todos** los medios:

- **El congelamiento empieza al crear la sesión**, no al volver el cliente:
  entre el paso 2 y el paso 4 hay un cliente fuera de la app y una comanda que
  no puede moverse. Y congela **también a los participantes**, con *"No es mi
  mesa"* (RF-C-21) encolado, que PRD-007 §2.4 había reservado para la
  transferencia. La razón es la misma que dio PRD-007 y ahora vale para todo: un
  cobro ya autorizado en el checkout del proveedor **no se puede rechazar**, así
  que PRD-006 §2.6 —rechazar el intento si cambian los participantes— deja de
  tener un medio donde ejecutarse. El monto no cambia: manda la instantánea
  congelada (PRD-006 §2.4).
- **El reenrutamiento automático de la tarjeta (PRD-007 §2.2) se decide al crear
  la sesión.** Si el proveedor principal no responde en el paso 2, el intento se
  crea contra el de respaldo y el cliente no ve nada, que es el criterio 11 de
  PRD-007 §8. Si cae **después** de la redirección, el cliente ya está en un
  checkout ajeno: no hay reenrutamiento, y eso cae en el ciclo de §2.5 como
  cualquier otro cobro sin evento.

### 2.3 La tarjeta guardada entra al MVP (cierra D-14)

Con la tokenización del hecho 1, **D-14 se cierra: sí, en el MVP**, para el
**cliente registrado** —que desde PRD-004 es todo cliente que pide por la app—
y como **una opción más de la pantalla de pago**, no como un camino aparte.

- **No es un medio nuevo:** es el medio `tarjeta` pagado con un token. Por eso
  no tiene fila propia en `enrutamiento_por_medio` ni se habilita por separado
  —se habilita y se enruta con la tarjeta (RF-A-18)— y en el modelo de datos se
  distingue por `medio_guardado_id`, no por un valor de `medio` (§4).
- Vive en el **tercer grupo** de PRD-007 §2.3, junto a la tarjeta y Webpay Plus,
  y aparece **arriba de la tarjeta nueva**: para quien ya la guardó es el camino
  más corto.
- Guardar es **opt-in explícito** en el momento del pago. PAGAYA sigue **sin
  almacenar datos de tarjeta** (PRD-001 §10): guarda el token del proveedor, la
  marca y los últimos cuatro dígitos para poder mostrarla.
- El cliente puede **eliminarla** en cualquier momento, y se elimina con su
  cuenta (RF-C-23).
- No cambia nada del cálculo ni del beneficiario: el medio de pago no decide
  quién recibe el descuento (PRD-006 §2).

### 2.4 Google Pay no tiene proveedor y no se muestra

- **No se muestra en ningún dispositivo**, ni siquiera en un Android que lo
  soporte (RF-C-34). Es la misma regla de PRD-002 §5.3 aplicada un nivel más
  arriba: no se muestra un medio que **nadie puede cobrar**.
- **No se borra del sistema.** `google_pay` sigue siendo un valor de `medio` y
  una fila del enrutamiento, **deshabilitada y sin proveedor**: Fintoc lo tiene
  en proceso de lanzamiento, y el día que salga esto es configuración, no un
  PRD (RF-A-18). La **fecha estimada** es una pregunta de G-2.
- **Consecuencia en Android:** hoy no hay billetera. El pago de un toque, que
  PRD-007 §1 usó para elegir a Fintoc como principal, **existe solo en iOS y
  solo si G-2 confirma Apple Pay**. La decisión de PRD-007 no se revierte —Fintoc
  sigue siendo el único con transferencia y el principal de tarjeta—, pero el
  argumento que la sostuvo queda a la mitad y se dice acá para que no se cite de
  nuevo como si estuviera entero.
- **Consecuencia en las metas:** las métricas de billetera de PRD-002 §8 y
  PRD-007 §6 quedan **suspendidas** (§6).

### 2.5 Supuestos explícitos de este PRD

Decisiones que toma este PRD y que no vienen ni de un PRD anterior ni de las dos
fuentes de §1:

- **La pantalla de PAGAYA mantiene el orden de PRD-007 §2.3 y la sesión se crea
  con `payment_method_types` del medio elegido** (hecho 6). Es decir: PAGAYA
  elige el medio y el checkout del proveedor no vuelve a preguntarlo. La
  alternativa —abrir el checkout con todos los medios y dejar que el cliente
  elija allá— rompería dos reglas vigentes: el orden de §2.3, que es decisión de
  producto, y *"nunca se muestra un medio que ese dispositivo no pueda pagar"*
  (PRD-002 §5.3), que PAGAYA no puede hacer cumplir dentro de una pantalla que
  no es suya.
- **`bank_transfer` es la transferencia cuenta a cuenta y `card` es la tarjeta**
  (hecho 6). Son los dos medios documentados en Chile y los dos del camino base
  de PRD-007 §7.
- **Mientras no haya consulta de estado confirmada (hecho 8), el vencimiento de
  la transferencia se reconoce por `checkout_session.expired`** y el cobro manual
  se ofrece **solo** al recibirlo. El plazo de 3 minutos de PRD-007 §2.4 sigue
  siendo lo que la app le muestra al cliente; lo que **habilita** el cobro
  manual sin fricción es el evento, no el reloj. Si al vencer el plazo no llegó
  ningún evento, el intento **sigue** `autorizando` y el mesero puede **forzar**
  el cobro, que es la salida que PRD-007 §2.4 ya dejó abierta. Esto es más
  conservador que PRD-007, no más laxo: ante la duda, nadie cobra dos veces.
- **La idempotencia del cobro se sostiene dentro de PAGAYA** —a lo más un pago
  en `autorizando` o `pagado` por comanda, PRD-007 "Sin cambios"— y **no se
  apoya en una garantía del proveedor** que el hecho 8 dice que no está
  documentada. Si G-2 confirma que existe, se suma; no se reemplaza.
- **El subcomercio se da de alta por local, no por sucursal ni por razón
  social.** El local es la unidad de PRD-001 §13 y de todo el modelo
  multi-tenant; cualquier otra unidad obligaría a un mapeo que nadie pidió.

## 3. Requisitos funcionales

| ID | Requisito | Prioridad |
|---|---|---|
| RF-C-10 (mod.) | Pagar el total desde la app con **transferencia cuenta a cuenta, tarjeta (crédito, débito, prepago) —nueva o guardada—, Webpay Plus o Apple Pay**, según lo que el local habilite y lo que ese dispositivo pueda pagar; recibir comprobante en la app. La tarjeta guardada se habilita con el medio tarjeta, no por separado (§2.3). **Google Pay no se ofrece** mientras no tenga proveedor. | Must |
| RF-C-32 | El pago ocurre en un **Checkout Session alojado por el proveedor**: PAGAYA lo crea en el backend con el medio elegido y el destinatario del local, redirige al cliente y lo recibe de vuelta por `success_url` o `cancel_url`. **El retorno no confirma el pago**; solo el webhook pasa la comanda a `pagada`. | Must |
| RF-C-33 | El cliente registrado puede **guardar su tarjeta tokenizada** con consentimiento explícito en el pago, pagar con ella desde la pantalla de medios y **eliminarla** cuando quiera. PAGAYA guarda solo el token, la marca y los últimos cuatro dígitos. | Must |
| RF-C-34 | Un medio **sin proveedor que lo cobre** no se muestra en ninguna plataforma, aunque el dispositivo lo soporte. Aplica hoy a **Google Pay**. | Must |
| RF-C-31 (mod.) | Mientras un cobro está en curso **en cualquier medio**, la app muestra que está esperando la confirmación —nombrando al banco solo cuando el medio es la transferencia— y nunca da por pagado lo que el webhook no confirmó. Ofrece pagar con otro medio **solo** cuando el intento quedó `rechazado` o venció la sesión (§2.5). | Must |
| RF-M-18 (mod.) | Se mantiene entero —el mesero ve el medio y el tiempo, y **siempre puede forzar** el cobro con confirmación y motivo—, y cambia su disparador: el cobro manual se **ofrece** al llegar `checkout_session.expired`, no al vencer el reloj ni tras una consulta al proveedor (§2.5). | Must |
| RF-A-18 (mod.) | El enrutamiento por local y por medio de PRD-007 se mantiene, y además: un medio **sin proveedor no es habilitable**, y la configuración del local guarda su **`subcomercio_id`**. | Must |
| RF-A-20 | Dar de alta un local como **subcomercio** del comercio de PAGAYA es configuración: guardar su `subcomercio_id` y los datos que el checkout muestra como destinatario (`business_profile`). No requiere credenciales propias del local ni cambios en la app. | Must |

## 4. Impacto en el modelo de datos

- **Pago (mod. de PRD-007 §4):** agrega `id_checkout_session`,
  `id_payment_intent` y `medios_solicitados` (los `payment_method_types` con que
  se creó la sesión, §2.5: sin eso no se puede auditar con qué se intentó
  cobrar). `medio` **no cambia**: `google_pay` se conserva (§2.4) y la **tarjeta guardada
  no agrega un valor**, porque es el medio `tarjeta` con token (§2.3). Agrega
  `medio_guardado_id`, nulo salvo que el cobro haya usado una tarjeta guardada.
- **Medio guardado (entidad nueva):** cliente, `proveedor`, token del proveedor,
  marca, últimos cuatro dígitos, fecha de alta, estado
  (`vigente` | `eliminado`). **Nunca el número ni el CVV** (PRD-001 §10). Se
  elimina con la cuenta del cliente (RF-C-23).
- **Configuración del local (mod. de PRD-007 §4):** agrega `subcomercio_id` y
  los datos del destinatario que muestra el checkout. `enrutamiento_por_medio`
  no cambia de forma; la fila de `google_pay` queda con proveedor vacío y
  `habilitado = false`, y el campo no admite habilitar un medio sin proveedor.
- **Sin cambios:** Comanda, Participante de comanda, Propina, Visita, PAGAYA ID,
  PIN de mesa, Sesión de mesa, los campos de descuento del pago (PRD-006 §6) y
  los que agregó PRD-007 §4 (`enrutado_a_respaldo`, `forzado`, `en_conflicto`,
  `plazo_confirmacion_transferencia`).

## 5. Impacto en otros flujos o roles

- **Cliente:** gana la tarjeta guardada y pierde Google Pay, que nunca llegó a
  ver. En Android el camino rápido pasa a ser la **tarjeta guardada**, no la
  billetera. El pago lo completa fuera de la app, en el checkout del proveedor,
  y vuelve a la pantalla de espera de RF-C-31.
- **Mesero:** una sola diferencia, y está en RF-M-18 (mod.): el cobro manual sin
  fricción se habilita con el **evento** de vencimiento, no con el reloj ni con
  una consulta al proveedor. Si no llega ningún evento, lo fuerza, que es lo que
  PRD-007 §2.4 ya le permitía. Sigue sin conocer el nombre de la pasarela
  (PRD-002 §5.2) y nunca pierde la capacidad de cobrar (PRD-001 §16).
- **Administrador:** RF-A-20 y la fila nueva de RF-A-18. No configura
  credenciales; configura su alta como subcomercio.
- **PRD-007 §2.2 (caídas):** se mantiene entero, menos Google Pay, que ya no
  estaba en la pantalla. Si Fintoc no responde, el local pierde transferencia y
  tarjeta guardada; la tarjeta sigue cobrando por Kushki reenrutada sola.
- **Boleta electrónica (PRD-002 §5.5):** sigue fuera del MVP. El registro de
  pagos guarda `id_payment_intent` además de lo que ya guardaba.
- **`docs/arquitectura.md` §7:** la línea del enrutamiento Fintoc/Kushki pasa a
  nombrar también este PRD: G-2 es la de §7 de este PRD, el modelo de
  subcomercios es el de §2.1 y el vencimiento de la transferencia es el de §2.5.
- **D-3 de PRD-001** (país y pasarela) **sigue cerrada**: cambia el detalle de la
  respuesta, no su estado.

## 6. Métricas de éxito del cambio

| Métrica | Meta | Por qué |
|---|---|---|
| Pagos con **tarjeta guardada** sobre los pagos con tarjeta del cliente registrado que ya guardó una | ≥ 70 % | Si guardó la tarjeta y aun así tipea los datos, la opción está mal puesta en la pantalla (§2.3) |
| Clientes registrados que **guardan** su tarjeta, sobre los que pagaron con tarjeta nueva | Se mide; sin meta | Dice si el opt-in explícito de §2.3 es un freno o solo un trámite |
| Pagos iniciados que **no vuelven** del checkout del proveedor (sin `success_url` ni `cancel_url` ni webhook) | < 2 % | Es el costo del checkout alojado de §2.2: cada uno es una mesa esperando y un cobro manual probable |
| Cobros manuales **forzados** sobre comandas con un intento `autorizando` vencido sin evento | Se mide; sin meta | Es la consecuencia directa del supuesto de §2.5. Si sube, la consulta de estado de G-2 deja de ser una pregunta cómoda y pasa a ser urgente |
| Participación de la transferencia y de la tarjeta en los pagos en app | Se mide; sin meta | Son los dos únicos medios documentados en Chile (hecho 6). Mientras no haya billetera, es **la** mezcla de medios |

**Métricas suspendidas, no eliminadas:** la de PRD-002 §8 (*pagos con billetera
≥ 25 % de los pagos*) y **tres** filas de PRD-007 §6 —*≥ 50 % de los pagos
hechos donde la billetera se mostró*, *billeteras ofrecidas cuya hoja no se abre
< 1 %* y *pagos con Apple Pay rechazados por marca no soportada*—, las tres por
el mismo motivo: si ninguna billetera se ofrece, ninguna se mide. Con Google Pay sin lanzar y Apple Pay sin
confirmar, en Android no hay billetera y el denominador de la segunda es cero:
medirlas hoy no informa, y dejarlas como metas vigentes haría fracasar al
producto por algo que no decidió. Se reactivan cuando al menos una billetera
esté en producción, y la segunda se mide **por plataforma** desde entonces, para
que iOS no esconda a Android.

## 7. Decisiones abiertas

### Gate de piloto

**G-2 se reescribe.** Lo que la reunión del 2026-10-08 respondió sale de la
pregunta; lo que no, se queda nombrado:

| ID | Pregunta | Quién responde | Supuesto contra el que se construye | Qué se bloquea si no hay respuesta |
|---|---|---|---|---|
| **G-2** (reescrita por PRD-008) | Con Fintoc y Kushki: ¿**comisión por medio** y hay **cobro fijo por transacción**? ¿**Plazo de liquidación** por medio? ¿**Apple Pay está en producción en Chile**? ¿Hay **idempotencia** en la creación del cobro, **consulta de estado** de un intento y **devoluciones** por API (hecho 8)? ¿**Fecha estimada de Google Pay** (hecho 2)? Y **conservadas de la G-2 de PRD-007**, porque la reunión fue con Fintoc y nada las respondió: ¿**estado del Beta de Apple Pay de Kushki** —fecha, marcas, in-app—? ¿**comportamiento de Apple Pay en la web app instalada como PWA**? ¿**requisitos de alta del comercio** en cada proveedor? | Comercial y soporte técnico de Fintoc y Kushki | El reparto por medio de PRD-007 §2.1 menos Google Pay (§2.4). **Camino base: transferencia, tarjeta y tarjeta guardada por Fintoc**, con el respaldo automático de tarjeta en Kushki. Apple Pay, Google Pay y Webpay Plus **deshabilitados** (RF-A-18). Idempotencia **dentro de PAGAYA** y vencimiento por `checkout_session.expired` (§2.5). Devoluciones fuera de PAGAYA (D-15) | **Comisiones, cobro fijo y plazos de liquidación bloquean el arranque del piloto** (como ya lo dejó PRD-007 §7). El resto bloquea **solo lo que nombra**: Apple Pay bloquea Apple Pay; la fecha de Google Pay no bloquea nada porque el medio ya está deshabilitado; idempotencia, consulta y devoluciones no bloquean el piloto porque §2.5 les da un camino conservador, pero cada una que falte deja un cobro manual forzado donde podría no haberlo |

**Ninguna pregunta de G-2 se cae sin respuesta.** La reunión del 2026-10-08 fue
con Fintoc y respondió sobre Fintoc: lo que preguntaba por **Kushki** (el Beta
de Apple Pay) y lo que era **verificación técnica nuestra** (el caso PWA de
PRD-007 §2.3) sigue en la tabla con su nombre, igual que los requisitos de alta
del comercio, que vienen desde la G-2 original. De otro modo el respaldo manual
de Apple Pay y la regla de la PWA —que §0 declara sin cambios— quedarían sin la
pregunta que los libera.

**La regla de gate no cambia:** G-1 (propina, legal) y G-4 (datos personales,
legal) siguen siendo los gates duros (PRD-004 §5), la mitad comercial de G-2
—ahora comisiones, cobro fijo y plazos— sigue siendo condición de arranque
(PRD-007 §7), y G-3 (PIN) se resuelve el día de la puesta en marcha (PRD-003 §2).

### Decisiones de producto pendientes

| ID | Decisión | Impacto |
|---|---|---|
| D-6 | ¿Qué cuenta como visita? Supuesto vigente: comanda pagada, máx. una por día por local. | Niveles |
| D-9 | ¿Puede el administrador compartir con el mesero un comentario marcado "solo administración"? | Feedback, cultura interna |
| D-13 | Mecánica de los beneficios de producto: ¿los niveles superiores conservan la bebida de bienvenida? ¿Cómo se carga a la comanda y cómo se registra su costo real? | Niveles, reportes, app del mesero |
| D-15 | **¿Cómo se devuelve una transferencia cuenta a cuenta?** Sigue abierta: la guía pública no documenta devoluciones (hecho 8) y la pregunta pasa a G-2. Supuesto sin cambios (PRD-007 §7): la devolución ocurre **fuera de PAGAYA** y PAGAYA solo deja constancia. | Operación del local, reclamos |
| D-16 | ¿Puede el local alterar el orden de presentación de PRD-007 §2.3 o premiar al que paga por transferencia? Supuesto: no en el MVP. | Comisiones, pantalla de pago |
| D-17 | ¿Se le revierten la visita y el tope diario de descuento al participante cuya salida encolada se ejecuta después del webhook? Supuesto: no acumula ni consume; el monto cobrado no cambia. | Niveles, RF-A-17, RF-A-15 |
| **D-18** | **¿Quién recibe los fondos de un cobro y quién los liquida al local?** El modelo de subcomercios de §2.1 admite las dos lecturas: que el proveedor liquide directo al subcomercio, o que los reciba PAGAYA y los transfiera. Supuesto contra el que se construye: **el proveedor liquida directo al local y PAGAYA no toca el dinero** —es el que no necesita autorización que PAGAYA no tiene (D-20) y el que no convierte a PAGAYA en tesorería de sus clientes—. Si la respuesta fuera la otra, cambia el modelo de negocio, no una pantalla. | Modelo de negocio, legal, caja del local |
| **D-19** | **¿Quién paga las 2 UF mensuales de la cuenta apificada, y es una cuenta por local o una sola para PAGAYA?** El hecho 4 dice explícitamente que **no se precisó**. Supuesto contra el que se construye: **una sola cuenta apificada para PAGAYA, pagada por PAGAYA**, porque es lo coherente con integrar una vez (§2.1) y con que el alta de un local sea configuración. Si fuera una por local, 2 UF al mes son un costo fijo por local que el precio del producto hoy no contempla. | Costos, precio del producto, alta de locales |
| **D-20** | **¿Puede PAGAYA recibir dinero de terceros?** Si los fondos pasan por PAGAYA antes de llegar al local (D-18), PAGAYA está recibiendo dinero ajeno, y eso en Chile puede exigir una figura o autorización que hoy no tiene. Supuesto contra el que se construye: **no se opera así** —aplica el supuesto de D-18, el proveedor liquida directo al local—. **Esta decisión escala a gate duro del piloto si D-18 se resuelve en el sentido contrario:** no se mueve dinero real de terceros sin respuesta legal. No se cierra con una conversación comercial; necesita opinión legal. | Legal, modelo de negocio, arranque del piloto |

**Cerradas en este PRD:** **D-14** —la tarjeta guardada entra al MVP sobre la
tokenización de Fintoc (§2.3)— y el hecho equivocado de PRD-007 §1 y §2.1 sobre
Google Pay (§2.4).

## 8. Criterios de aceptación

1. **Android con Google Pay disponible en el dispositivo:** la pantalla de pago
   **no muestra Google Pay**. Abre con transferencia y tarjeta, y con la tarjeta
   guardada si el cliente tiene una. Reemplaza al criterio 2 de PRD-007 §8.
2. **iPhone con G-2 sin responder:** tampoco aparece ninguna billetera;
   transferencia, tarjeta y tarjeta guardada funcionan de punta a punta. Amplía
   el criterio 4 de PRD-007 §8.
3. **Pago por cualquier medio:** PAGAYA crea el Checkout Session con
   **únicamente** el `payment_method_types` del medio elegido y con el
   `business_profile` del local; el checkout no ofrece otros medios y muestra al
   restaurante como destinatario.
4. **Vuelta del checkout:** llegar a `success_url` **no** pasa la comanda a
   `pagada` —la app muestra la espera de RF-C-31— y llegar a `cancel_url`
   devuelve a la pantalla de medios sin dejar la comanda en un estado
   intermedio. Solo `payment_intent.succeeded` la cierra.
5. **`payment_intent.requires_action`:** el intento sigue `autorizando`, nadie
   puede iniciar otro cobro y el cobro manual no se ofrece.
6. **Transferencia vencida sin ningún evento del proveedor:** el intento sigue
   `autorizando`, el cobro manual **no se ofrece** y solo el mesero puede
   forzarlo con confirmación y motivo (§2.5, RF-M-18). Acota el criterio 8 de
   PRD-007 §8, que suponía una consulta de estado disponible.
7. **`checkout_session.expired`:** el intento pasa a `rechazado`, la mesa pasa a
   `pago_pendiente`, y el cliente puede reintentar o el mesero cobrar fuera de la
   app —uno de los dos, no ambos— por el monto calculado y con el mismo
   beneficiario (PRD-006 §2.9).
8. **Guardar la tarjeta:** el cliente paga con tarjeta nueva, marca guardarla, y
   en el pago siguiente la ve en la pantalla de medios arriba de la tarjeta
   nueva, con marca y últimos cuatro dígitos. En la base de datos **no hay
   número de tarjeta ni CVV**, solo el token del proveedor.
9. **No guardar la tarjeta:** si no marca la opción, no queda ningún medio
   guardado y el pago siguiente pide los datos otra vez.
10. **Eliminar la tarjeta guardada:** desaparece de la pantalla de medios de
    inmediato y los pagos ya hechos con ella **siguen auditables** por su
    `medio_guardado_id`.
11. **Alta de un local como subcomercio:** se da de alta guardando su
    `subcomercio_id` y los datos del destinatario, sin credenciales propias del
    local y sin desplegar una versión nueva de la app (RF-A-20).
12. **Habilitar un medio sin proveedor:** intentar habilitar Google Pay en la
    configuración de un local **falla** con un mensaje que dice que el medio no
    tiene proveedor; el valor `google_pay` sigue existiendo en el modelo de
    datos (RF-A-18, §2.4).
13. **Caída del proveedor principal de tarjeta antes de crear la sesión:** el
    intento se crea contra Kushki, queda `enrutado_a_respaldo` y el cliente no
    ve ningún cambio (criterio 11 de PRD-007 §8). **Si la caída ocurre después
    de la redirección**, no hay reenrutamiento y el cobro cae en el criterio 6.
14. **El beneficiario toca "No es mi mesa" con un cobro en curso, con
    cualquier medio:** la acción se encola, el intento **no** se rechaza y, si
    el webhook confirma, el cobro queda con la instantánea congelada (PRD-006
    §2.4). Extiende el criterio 7 de PRD-007 §8 a todos los medios y reemplaza
    al criterio 4 de PRD-006 §8.
15. **Lo que no cambió sigue en pie:** un webhook que confirma después de un
    cobro manual deja el manual `en_conflicto` con la alerta de RF-A-19, y ni
    las ventas ni el reporte de descuentos cuentan la comanda dos veces
    (criterio 10 de PRD-007 §8).
