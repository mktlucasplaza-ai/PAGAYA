# PRD-007 — Fintoc y Kushki como pasarelas de pago

| | |
|---|---|
| **Versión** | 007 |
| **Estado** | Vigente |
| **Fecha** | 2026-10-04 |
| **Reemplaza a** | PRD-006 (en las secciones indicadas; también modifica PRD-001, PRD-002, PRD-003 y PRD-004) |

---

## 0. Cambios en esta versión

**Motivo del cambio:** cerrar la elección de pasarelas con la documentación de
cada proveedor en la mano. PRD-002 §5.2 apostó a **MercadoPago** como pasarela
principal y a **Kushki** como agregador de Webpay y de las billeteras; la
verificación que exige **G-2** encontró otro mapa. Quien activa Apple Pay y
Google Pay sin pedirlo es **Fintoc**; en **Kushki**, Apple Pay está en Beta,
limitado a Visa/Mastercard y a navegador web, y Google Pay no figura en su
documentación. Como la prioridad del proyecto es **pagar con billetera y
eliminar la fricción del POS**, la prioridad elige: Fintoc es la pasarela
principal, Kushki cubre lo que Fintoc no tiene (Webpay Plus) y respalda el
resto. MercadoPago queda descartado.

### Se agregó
- **§2.1 Reparto por medio y proveedor:** qué medio cobra cada proveedor, cuál
  es su respaldo y cuáles no tienen respaldo.
- **La transferencia cuenta a cuenta entra como medio del MVP** — es el medio
  más barato para el local y no exige que el cliente tenga tarjeta (§2.4).
- **§2.2 Respaldo automático solo donde es completo:** la tarjeta se reenruta
  sola al proveedor de respaldo; Apple Pay, cuyo respaldo es parcial, exige
  decisión explícita del administrador.
- **§2.3 Orden de presentación de la pantalla de pago** en tres grupos, y la
  regla de visibilidad **cerrada por defecto**, con el caso de la **web app
  instalada como PWA**.
- **§2.4 El ciclo de una transferencia:** plazo de espera, **consulta al
  proveedor** antes de ofrecer el cobro manual, estado del intento al vencer, y
  qué pasa con una confirmación tardía.
- **RF-C-29, RF-C-30, RF-C-31, RF-M-18, RF-A-18, RF-A-19** (§3).
- **D-14** (tokenización y medio guardado sin MercadoPago), **D-15** (devolución
  de una transferencia), **D-16** (si el local puede alterar el orden o premiar
  la transferencia) y **D-17** (qué pasa con la visita y el tope diario de
  descuento de un participante cuya salida quedó encolada hasta después del
  pago): abiertas, con el supuesto contra el que se construye (§7).
- Campos al modelo de datos: `enrutamiento_por_medio`,
  `plazo_confirmacion_transferencia`, `enrutado_a_respaldo`, y `forzado` y
  `en_conflicto` en el registro de cobro manual (§4).

### Se modificó
- **PRD-002 §5.1 (medios del MVP)** — antes: tarjetas de crédito y débito
  (*Redcompra incluido*), Webpay, Apple Pay y Google Pay. Ahora: se **agrega la
  transferencia cuenta a cuenta**, las tarjetas incluyen **prepago** y *Webpay*
  pasa a nombrarse **Webpay Plus**, que es el producto que Kushki ofrece.
  **Deja de afirmarse "Redcompra incluido" en el medio tarjeta**: con Fintoc no
  está verificado, y el camino de Redcompra pasa a ser Webpay Plus hasta que
  G-2 responda (§2.1, §2.5).
- **PRD-002 §5.2 (proveedores)** — antes: MercadoPago principal y Kushki como
  agregador de Webpay y billeteras. Ahora: **Fintoc principal** (transferencia,
  tarjetas, Apple Pay y Google Pay) y **Kushki** para Webpay Plus y como
  **respaldo** de tarjetas y de Apple Pay. El enrutamiento por medio y por local
  sigue siendo el que esa misma sección ya exige; este PRD lo llena (§2.1,
  RF-A-18).
- **PRD-002 §5.3 (billeteras)** — se mantiene la regla ("si no está disponible
  en el contexto del cliente, la opción no se muestra") y se le **agrega el caso
  de la web app instalada como PWA** (§2.3). Su cláusula **"tarjeta como camino
  siempre disponible"** se sostiene con el **respaldo automático** de §2.2, y
  queda **acotada** a lo único que ningún diseño puede evitar: si ninguno de los
  dos proveedores de tarjeta responde, la tarjeta no se muestra y la salida es
  el cobro manual (PRD-001 §16).
- **PRD-002 §10, criterio 7** — antes: "en un dispositivo sin Apple Pay ni
  Google Pay, esas opciones no se muestran y el pago con tarjeta y **Webpay**
  funciona". Ahora el criterio equivalente es con **transferencia y tarjeta**
  (§8.3): Webpay Plus depende de que el local lo tenga habilitado, que depende
  de G-2.
- **PRD-002 §6 y PRD-003 §5 (configuración del local)** — el "enrutamiento por
  proveedor" de PRD-002 §6 y los *feature flags* de medios por proveedor de
  PRD-003 §5 quedan **reemplazados por un único campo**,
  `enrutamiento_por_medio` (§4): medio → proveedor principal + proveedor de
  respaldo + si está habilitado. Un flag por proveedor decía menos de lo que
  hace falta.
- **PRD-001 §10 (cobro manual)** — antes: el cobro manual se habilita si el pago
  digital falla **de forma definitiva**. Ahora también cuando **vence la espera**
  de una transferencia, que es un fallo *no* definitivo, y solo después de
  consultar al proveedor (§2.4).
- **PRD-001 §10 y PRD-006 §2.6 (rechazo del pago si la comanda cambia durante el
  cobro)** — con un medio de confirmación diferida esa regla es inejecutable: una
  transferencia ya autorizada en el banco no se puede rechazar. Ahora, mientras
  un intento está `autorizando`, la comanda está congelada **también en sus
  participantes**: "No es mi mesa" (RF-C-21) se encola y se ejecuta al resolverse
  el intento; y si el webhook llega tarde, manda la **instantánea** congelada
  (PRD-006 §2.4). Para los demás medios, PRD-006 §2.6 sigue tal cual (§2.4).
- **PRD-001 §19, criterio 5 ("ninguna cuenta se cobra dos veces")** — queda
  **acotado**: sigue siendo invariante del sistema, con **una sola excepción
  documentada**, el cobro manual **forzado** por el mesero, que queda registrado
  con motivo y levanta la alerta de RF-A-19 (§2.4).
- **PRD-002 §8 (métrica de billeteras, ≥ 25 % de los pagos)** — **se mantiene**
  y se le **suma** una métrica de otro denominador: pagos con billetera sobre los
  pagos hechos donde la billetera sí se mostró (§6). No es la misma meta con dos
  números.
- **PRD-003 §2 y PRD-004 §5 (regla de gate)** — PRD-003 §2 dice que el piloto no
  arranca sin G-1 y G-2; PRD-004 §5 dice que los gates duros son G-1 y G-4. Las
  dos no pueden ser ciertas a la vez para G-2: se **resuelve** separando lo que
  G-2 pregunta (§7).
- **PRD-003 §6, criterio 7** — antes: "con G-2 sin responder, el pago con
  **tarjeta** funciona de punta a punta y las billeteras no aparecen como
  opción". Ahora el camino base son **transferencia y tarjeta** por Fintoc; las
  billeteras siguen sin aparecer (§8.4).
- **G-2 de PRD-003 §2** (ex D-3.1) — **se reescribe** para Fintoc y Kushki:
  disponibilidad real de Apple Pay y Google Pay por proveedor, estado del Beta
  de Kushki, comisiones por medio, plazos de liquidación y comportamiento de
  Apple Pay si la web app se instala como PWA. Se **conserva** la pregunta por
  los requisitos de alta del comercio, que ya estaba en la G-2 original (§7).
  G-1, G-3 y G-4 no cambian de contenido.
- **RF-C-10** — antes (PRD-002): tarjeta, Webpay, Apple Pay y Google Pay. Ahora
  incluye **transferencia cuenta a cuenta** y **prepago**, nombra Webpay Plus y
  queda explícitamente condicionado a lo que el local habilite y a lo que ese
  dispositivo pueda pagar.
- **RF-A-09** — sigue siendo del administrador configurar medios de pago; este
  PRD lo detalla en RF-A-18, no lo reemplaza.
- **Pago (PRD-002 §6)** — `proveedor` pasa de (`mercadopago` | `kushki`) a
  (`fintoc` | `kushki`), `medio` agrega `transferencia` y el valor `webpay` pasa
  a `webpay_plus` (§4).
- **`docs/arquitectura.md` §7** — decía que el enrutamiento MercadoPago/Kushki
  estaba decidido en PRD-002 §5.2; pasa a apuntar a este PRD (§5).

### Se eliminó
- **MercadoPago como proveedor de pago.** Queda descartado: no se enruta ningún
  medio por él, sale de la configuración del local y el valor `mercadopago` deja
  de existir en el campo `proveedor`.
- **Ningún requisito se elimina.** Los medios que MercadoPago iba a cobrar los
  cobra Fintoc. La única cosa que MercadoPago sostenía y que nadie recoge todavía
  es la **tokenización y el medio de pago guardado** de PRD-001 §10: no se
  elimina, queda **abierta como D-14** con su supuesto (§7).

**Sin cambios:** la **interfaz única de proveedor de pago** (PRD-002 §5.2) —
ninguna regla de negocio conoce el nombre de la pasarela—, **un solo cobro con
la propina incluida** en el mismo intento (PRD-002 §5.4), la **confirmación del
pago solo por webhook**, la **idempotencia del cobro dentro de PAGAYA** —a lo
más un pago en `autorizando` o `pagado` por comanda; su promesa operativa es la
que queda acotada en "Se modificó", no la invariante—, el **congelamiento de la
comanda** al iniciar el pago (que §2.4 extiende a los participantes, no
relaja), **que el local siempre puede cobrar** por la vía tradicional (PRD-001
§14 y §16, PRD-002 §5.4): el cobro manual **nunca se bloquea**, solo cambia
cuándo se ofrece sin fricción (§2.4, RF-M-18). Y que **PAGAYA no almacena datos
de tarjeta**. Todo lo demás sigue vigente según los PRD-001 a 006: propinas, PIN
de mesa, PAGAYA ID y sus reglas de seguridad, registro obligatorio para pedir,
apertura de mesa por el mesero, escala de niveles, exención de feedback y la
regla del beneficiario por presencia (PRD-006 §2).

---

## 1. Contexto

Lo que cada proveedor ofrece en Chile, verificado el **2026-10-04** en su propia
documentación. Es la base de la decisión y no se reinterpreta:

| Proveedor | Lo que ofrece en Chile | Fuente |
|---|---|---|
| **Fintoc** | **Transferencia cuenta a cuenta** —su medio más barato, con fondos **al día siguiente**—, **tarjetas** de crédito, débito y prepago, y **Apple Pay y Google Pay activados automáticamente** en su *Smart Checkout* en dispositivos compatibles. **No ofrece Webpay.** | `fintoc.com/cl/producto/payment-methods` |
| **Kushki** | **Tarjetas** y **Webpay Plus**. **Apple Pay en Beta**, solo **Visa/Mastercard**, solo desde **navegador web** (no in-app) y con **verificación de dominio** exigida. **Google Pay no figura** en su documentación. | `soporte.kushkipagos.com`, artículo *"How to accept Apple Pay from customers"* |

Tres consecuencias se leen solas:

1. **La billetera decide el proveedor principal.** La promesa del producto es
   pagar sin esperar la máquina POS (PRD-001 §2 y §3): el pago de un toque es
   Apple Pay y Google Pay. Fintoc los trae encendidos; Kushki tiene uno en Beta
   y el otro no documentado. Fintoc es la principal.
2. **Webpay Plus solo existe en Kushki.** Fintoc no ofrece Webpay, y Webpay es
   el camino con más penetración en débito en Chile (PRD-002 §5.1). Kushki no es
   opcional: es el único camino a ese medio.
3. **Por eso son dos, no una.** No es redundancia por prolijidad; es que ningún
   proveedor cubre solo la lista de medios que el MVP necesita. La **interfaz
   única de proveedor** que PRD-002 §5.2 ya exige es lo que hace que esto no
   cueste nada en el dominio.

Y una que no se lee sola: la transferencia cuenta a cuenta es el medio **más
barato para el local** y el único que no exige que el cliente tenga una tarjeta.
PRD-002 §5.1 no la tenía porque la pasarela elegida entonces no la ofrecía. Con
Fintoc, dejarla fuera sería pagar comisión de tarjeta por gusto.

## 2. Alcance del cambio

### 2.1 Reparto por medio y proveedor (modifica PRD-002 §5.1 y §5.2)

| Medio | Proveedor principal | Respaldo | Nota |
|---|---|---|---|
| **Transferencia cuenta a cuenta** | Fintoc | — | El más barato para el local; fondos al día siguiente (§2.4) |
| **Apple Pay** | Fintoc | Kushki, **parcial y manual** | El respaldo es Beta, solo Visa/Mastercard y solo navegador web (§2.2) |
| **Google Pay** | Fintoc | — | No figura en la documentación de Kushki |
| **Tarjeta** (crédito, débito, prepago) | Fintoc | Kushki, **completo y automático** | Es lo que ambos ofrecen igual: por eso se reenruta solo (§2.2) |
| **Webpay Plus** | Kushki | — | Fintoc no ofrece Webpay. Es el camino de Redcompra mientras G-2 no diga otra cosa (§2.5) |

El **enrutamiento es configurable por medio y por local** (RF-A-18), que es
exactamente lo que PRD-002 §5.2 ya exige: esta tabla es el valor por defecto, no
una constante en el código. Cambiar de proveedor un medio es configuración; no
toca la app ni el dominio.

### 2.2 Cuando un proveedor no responde

- **Respaldo automático solo donde el respaldo es completo.** La **tarjeta** la
  ofrecen los dos proveedores igual: si el principal no responde, el intento se
  reenruta **solo** al de respaldo y queda marcado `enrutado_a_respaldo`. Eso es
  lo que sostiene la cláusula de PRD-002 §5.3 —*tarjeta como camino siempre
  disponible*— sin que nadie tenga que estar mirando.
- **Respaldo parcial, decisión explícita.** **Apple Pay** por Kushki cambia de
  alcance: Beta, solo Visa/Mastercard, solo navegador web. Un reenrutamiento
  automático cambiaría en silencio lo que el cliente puede pagar, así que exige
  que el administrador lo active (RF-A-18). Mientras no lo haga, Apple Pay
  simplemente no se muestra.
- **Medio sin respaldo:** si el proveedor configurado de un medio no responde,
  **ese medio desaparece de la pantalla** (RF-C-30), no se muestra roto. El
  cliente paga con otro de los que quedan.
- **Fintoc caído** deja al local sin transferencia, sin Google Pay y sin Apple
  Pay (su respaldo no se activa solo). La **tarjeta sigue cobrando** por Kushki,
  reenrutada sola, y Webpay Plus también **si el local lo tiene habilitado**
  —que depende de G-2 (§7)—. El servicio no se detiene; lo que se pierde es el
  pago de un toque, que es el costo de que Google Pay tenga un solo proveedor.
- **Kushki caído** deja al local sin Webpay Plus y sin respaldo de tarjeta.
  Quedan transferencia, tarjeta y ambas billeteras por Fintoc.
- **Si ningún proveedor responde**, la pantalla de pago se queda sin medios y
  aplica PRD-001 §16 tal cual: el cobro tradicional **siempre está disponible**,
  con registro manual. Ninguna caída impide cobrar (PRD-001 §14).
- **Apple Pay enrutado al respaldo:** PAGAYA ofrece el botón, pero **no puede
  saber qué marca de tarjeta elegirá el cliente dentro de la hoja de Apple Pay**.
  Con Kushki, una tarjeta que no sea Visa o Mastercard se rechaza en la
  autorización y el cliente vuelve a la pantalla de medios con transferencia y
  tarjeta disponibles. Es una limitación del Beta, no un defecto de la detección,
  y por eso §6 la mide **aparte** de los fallos de detección.

### 2.3 Orden de presentación y visibilidad (modifica PRD-002 §5.3)

La pantalla de pago (RF-C-09, RF-C-15 a RF-C-18) presenta los medios en tres
grupos, en este orden:

1. **Billeteras** — Apple Pay o Google Pay, **solo si el dispositivo las
   soporta**. Es el primer grupo porque es el pago de un toque, que es la razón
   de ser del producto.
2. **Transferencia cuenta a cuenta** — **opción visible**, no escondida en "más
   medios". Es el medio más barato para el local y el único que no exige
   tarjeta.
3. **Tarjeta y Webpay Plus** — el camino de respaldo. La tarjeta es el medio que
   siempre está, sostenido por el reenrutamiento automático de §2.2; Webpay Plus
   aparece solo si el local lo tiene habilitado.

Reglas de visibilidad, que se mantienen y se aprietan:

- **Nunca se muestra un medio que ese dispositivo no pueda pagar** (PRD-002 §5.3
  tal cual). Nunca una opción que falla al tocarla.
- **Cerrado por defecto:** si la detección **no puede afirmar** que el entorno
  soporta la billetera, la billetera **no se muestra**. La duda no se resuelve
  mostrando el botón y viendo qué pasa.
- **Web app instalada como PWA (caso nuevo):** el cliente puede entrar por web
  app desde el QR (PRD-001 §13) y puede instalarla por su cuenta. El
  comportamiento de Apple Pay en ese contexto **no está verificado**, y es una
  de las preguntas de **G-2** (§7). Mientras no haya respuesta, una PWA
  instalada cuenta como entorno **no confirmado**: no se ofrece ninguna
  billetera ahí, y el cliente paga por transferencia o tarjeta en la misma
  pantalla. Nadie queda sin poder pagar; se pierde el toque único, no el pago.
- **Si la hoja de la billetera no se abre** pese a la detección, la app vuelve a
  la pantalla de medios con el resto disponible y el evento se registra: es la
  métrica que dice si la detección está bien hecha (§6).

### 2.4 El ciclo de una transferencia

- **Flujo:** el cliente elige transferencia, autentica en su propio banco y
  vuelve a PAGAYA. La propina va **en el mismo monto**: sigue siendo **un solo
  cobro** (PRD-002 §5.4), no una transferencia por el consumo y otra por la
  propina.
- **Confirmación:** solo el **webhook** pasa la comanda a `pagada` (PRD-001
  §10). La vuelta del cliente desde su banco no confirma nada, igual que no lo
  confirma la respuesta de una tarjeta.
- **Congelamiento ampliado a los participantes.** Mientras el intento está
  `autorizando`, la comanda está congelada en su consumo (PRD-001 §10) **y
  también en sus participantes**: "No es mi mesa" (RF-C-21) se encola y se
  ejecuta al resolverse el intento. La razón es que PRD-001 §10 y PRD-006 §2.6
  mandan rechazar el intento si la comanda cambia durante el cobro, y una
  transferencia ya autorizada en el banco **no se puede rechazar**. Para los
  demás medios, PRD-006 §2.6 sigue aplicándose tal cual.
- **Una salida encolada que se ejecuta después del pago abre una pregunta.** Si
  el webhook confirma antes de que la cola se vacíe, ese participante quedó en
  una comanda pagada de la que ya había pedido salirse. Qué se le anota
  entonces —su **visita** (PRD-001 §8) y el consumo de su **tope de un descuento
  por día por local** (PRD-006 §2.7)— es **D-17** (§7). Supuesto contra el que
  se construye: **la visita no acumula y el descuento diario no se consume**
  para un participante cuya salida estaba encolada antes del webhook. **El monto
  cobrado no cambia**: la instantánea ya estaba congelada (PRD-006 §2.4) y el
  cliente pagó lo que vio.
- **Plazo de espera:** si el webhook no llega dentro del plazo configurado
  (RF-A-18, 3 minutos por defecto), PAGAYA deja de esperar. El plazo **no
  confirma ni cancela el cobro en el banco**.
- **Al vencer se consulta al proveedor.** La interfaz única de proveedor ya
  incluye *consultar* (PRD-002 §5.2). De ahí salen dos caminos y uno solo:
  - **La consulta dice que el pago no está hecho:** el intento pasa a
    `rechazado` (PRD-001 §15), lo que libera el índice de idempotencia; la mesa
    pasa a `pago_pendiente`; el cliente puede reintentar con otro medio
    (RF-C-31) y el mesero puede cobrar manual (RF-M-18), **sobre la cuenta que
    el sistema calculó** y con el mismo beneficiario (PRD-006 §2.9). El primero
    que arranca toma la comanda: el índice —a lo más un pago en `autorizando` o
    `pagado`— es lo que lo hace cumplir, no la interfaz.
  - **La consulta dice que el pago sí está hecho:** el intento **sigue en
    `autorizando`**. Nadie puede iniciar otro cobro —ni el cliente ni el
    mesero—, la app sigue esperando el webhook y la comanda cierra con él. La
    consulta no confirma el pago; solo evita un segundo cobro sobre uno que ya
    ocurrió.
- **El cobro manual nunca se bloquea.** Antes de que venza el plazo no se
  *ofrece*, porque ofrecerlo es invitar al doble cobro; pero el mesero puede
  **forzarlo** con una confirmación que le dice que hay un pago en curso, y
  queda registrado con motivo y actor (RF-M-18, PRD-001 §14 criterio de
  auditoría). Es la única manera de tener dos cobros sobre una comanda, y por
  eso PRD-001 §19 criterio 5 queda acotado con esa excepción y no con un
  asterisco difuso.
- **Confirmación tardía:** si el webhook llega después, el pago **se registra
  igual** (`docs/arquitectura.md` §5 ya lo define: el sistema nunca se
  "des-cobra" solo) y manda la **instantánea** congelada del descuento (PRD-006
  §2.4). Si el mesero ya cobró fuera de la app, ese registro manual queda
  **`en_conflicto`** y el administrador recibe la alerta de **RF-A-19**. PAGAYA
  no decide la devolución: no hay conciliación automática en el MVP (PRD-001
  §10).
- **El registro `en_conflicto` no suma.** No cuenta en ventas (RF-A-06) ni en el
  reporte de descuentos (RF-A-17) hasta que el administrador lo resuelva: el
  descuento de esa comanda se cuenta **una vez**, el de la instantánea del pago
  que quedó `pagado`.
- **Liquidación al día siguiente:** los fondos de la transferencia llegan al
  local T+1. Eso es materia de caja del local, **no bloquea nada en la app**: la
  mesa se libera con el webhook, como con cualquier otro medio. Los plazos de
  liquidación de los demás medios se confirman en G-2.
- **Devolución:** una transferencia cuenta a cuenta no se reversa como una
  tarjeta. Queda como **D-15** (§7).

### 2.5 Supuestos explícitos de este PRD

Decisiones que este PRD toma y que no vienen ni de un PRD anterior ni de la
documentación verificada. Están acá para que se puedan discutir, no enterradas
en el cuerpo:

- **Webpay Plus va en el tercer grupo**, junto a la tarjeta y bajo la
  transferencia (§2.3). El orden de los dos primeros grupos es decisión del
  producto; dónde cae Webpay Plus no estaba definido y se decide acá: es el
  camino de respaldo del débito, no el camino rápido.
- **El débito de Fintoc y Redcompra:** no está verificado si las tarjetas de
  débito de Fintoc cubren Redcompra, que PRD-002 §5.1 daba por incluido. Se
  construye asumiendo que **Webpay Plus por Kushki es el camino de Redcompra**,
  con los dos medios implementados —su habilitación en producción depende de G-2
  (§7)—. Se confirma en la misma conversación comercial de G-2; si el débito de
  Fintoc cubre Redcompra, Webpay Plus pasa a ser prescindible y eso se decide
  con comisiones a la vista, no antes.
- **La detección de billetera es nuestra, no del checkout del proveedor.** Fintoc
  activa las billeteras dentro de su *Smart Checkout*, pero la regla de PRD-002
  §5.3 obliga a decidir **antes** de mostrar la opción. PAGAYA detecta la
  capacidad en el dispositivo y solo entonces ofrece la entrada a la billetera;
  el checkout confirma. Si el checkout no la renderiza, el cliente tiene
  transferencia y tarjeta en la misma pantalla: no hay callejón sin salida.
- **Plazo de espera de la transferencia: 3 minutos por defecto**, configurable
  por local (RF-A-18). Es un número elegido para que el cliente no quede
  esperando de pie; se ajusta con datos del piloto.
- **El reenrutamiento automático se limita a la tarjeta** (§2.2), porque es el
  único medio con respaldo equivalente. Cualquier otro respaldo cambia lo que el
  cliente puede pagar y por eso no se activa sin que alguien lo decida.
- **PAGAYA no invita a instalar la web app** en el MVP. Si el cliente la instala
  por su cuenta, aplica la regla de §2.3.

## 3. Requisitos funcionales

| ID | Requisito | Prioridad |
|---|---|---|
| RF-C-10 (mod.) | Pagar el total desde la app con **transferencia cuenta a cuenta, tarjeta (crédito, débito, prepago), Webpay Plus, Apple Pay o Google Pay**, según lo que el local habilite y lo que ese dispositivo pueda pagar; recibir comprobante en la app. | Must |
| RF-C-29 | Pagar por **transferencia cuenta a cuenta**: elegir el medio, autenticar en su banco y volver a la app. La propina va en el mismo monto (un solo cobro) y la comanda pasa a `pagada` solo con el webhook. | Must |
| RF-C-30 | La pantalla de pago presenta los medios en los tres grupos de §2.3 y **no muestra** un medio que ese dispositivo no pueda pagar, que el local no tenga habilitado, o cuyo proveedor —principal o de respaldo, según §2.2— no esté disponible. Si la detección no puede afirmar que el entorno soporta la billetera, la billetera no se muestra. | Must |
| RF-C-31 | Mientras una transferencia está en curso, la app muestra *"esperando la confirmación de tu banco"*. Al vencer el plazo ofrece pagar con otro medio **solo si el intento quedó rechazado** (§2.4); si el pago ya está hecho en el proveedor, sigue esperando y no ofrece reintentar. Nunca da por pagado lo que el webhook no confirmó. | Must |
| RF-M-18 | La mesa en cobro muestra al mesero el medio elegido y el tiempo transcurrido. El cobro manual **no se ofrece** mientras hay un intento vivo, y al vencer el plazo se ofrece solo si la consulta al proveedor dice que el pago no está hecho (§2.4). El mesero **siempre puede forzarlo**, con confirmación explícita y motivo registrado (PRD-001 §16), y siempre sobre la cuenta calculada (PRD-006 §2.9). | Must |
| RF-A-09 (conf.) | Configurar medios de pago, impuestos y datos del local sigue siendo del administrador. RF-A-18 lo detalla; no lo reemplaza. | Must |
| RF-A-18 | Configurar, **por local y por medio**: si el medio está habilitado, el **proveedor principal**, el **proveedor de respaldo** y si ese respaldo es **automático** (tarjeta) o requiere activación explícita (Apple Pay), y el **plazo de espera de la transferencia**. Cambiar de proveedor un medio no requiere cambios en la app. | Must |
| RF-A-19 | Alertar al administrador cuando un webhook confirma el pago de una comanda **ya cobrada fuera de la app**, dejando ambos registros en auditoría con actor, motivo y timestamp, y el manual marcado `en_conflicto`. Sin conciliación automática en el MVP. | Must |

## 4. Impacto en el modelo de datos

- **Pago (mod. de PRD-002 §6):**
  - `proveedor`: de (`mercadopago` | `kushki`) a (**`fintoc`** | `kushki`).
  - `medio`: agrega **`transferencia`** y `webpay` pasa a `webpay_plus` →
    (`transferencia` | `tarjeta` | `webpay_plus` | `apple_pay` | `google_pay` |
    `manual_fuera_de_app`).
  - agrega `enrutado_a_respaldo` (booleano): lo produce el reenrutamiento
    automático de la tarjeta (§2.2) y lo consume la métrica de §6. Sin él, una
    caída del proveedor principal se ve igual que un día normal.
  - el registro de cobro manual (`manual_fuera_de_app`) agrega `forzado`
    (booleano, con motivo en auditoría) y admite el estado **`en_conflicto`**,
    que levanta RF-A-19, no suma en ventas ni en reportes y no se resuelve solo
    (§2.4).
- **Configuración del local (reemplaza campos de PRD-002 §6 y PRD-003 §5):**
  `enrutamiento_por_medio` —medio → habilitado, proveedor principal, proveedor
  de respaldo y si el respaldo es automático— sustituye al "enrutamiento por
  proveedor" de PRD-002 §6 y a los *feature flags* de medios por proveedor de
  PRD-003 §5. Se agrega `plazo_confirmacion_transferencia` (segundos, por
  defecto 180). `medios_habilitados` queda absorbido por el mismo campo.
- **Registro de auditoría:** la alerta de RF-A-19 queda con los dos pagos
  involucrados, el actor y el motivo del cobro manual y el timestamp del
  webhook.
- **Sin cambios:** Comanda, Participante de comanda, Propina, Visita, PAGAYA ID,
  PIN de mesa y Sesión de mesa. Los campos de descuento del pago que agregó
  PRD-006 §6 tampoco cambian —el beneficiario no depende del medio de pago— y la
  regla de que el descuento se cuenta una sola vez por comanda la sostiene el
  estado `en_conflicto` (§2.4).

## 5. Impacto en otros flujos o roles

- **Cliente:** gana un medio que no exige tarjeta. Importa para el cliente de
  gama baja y conexión pobre que PRD-001 §14 obliga a sostener: la transferencia
  no depende de que tenga una tarjeta registrada ni de que su teléfono soporte
  una billetera. A cambio, durante una transferencia en curso no puede salirse
  de la comanda (§2.4); la acción se encola, no se pierde.
- **Mesero:** RF-M-18 es todo lo que cambia. Nunca conoció el nombre de la
  pasarela y sigue sin conocerlo; ve el medio, el tiempo y cuándo el sistema le
  recomienda cobrar. Nunca pierde la capacidad de cobrar.
- **Administrador:** RF-A-18 y RF-A-19. La configuración de enrutamiento es la
  palanca que PRD-002 §5.2 prometió y que acá se usa de verdad.
- **PRD-006 §2.9 (cobro fuera de la app sobre la cuenta calculada):** se
  mantiene y ahora también cubre el vencimiento de una transferencia. No existe
  monto manual ni descuento manual, tampoco en el cobro forzado.
- **`docs/arquitectura.md` §7:** la línea que decía que el enrutamiento
  MercadoPago/Kushki estaba decidido en PRD-002 §5.2 pasa a apuntar a este PRD.
  Su §5 no cambia y este PRD lo usa tal cual: congelamiento por versión,
  idempotencia como restricción, el webhook como única vía a `pagada` y la
  alerta de conciliación del webhook vencido, que es la que RF-A-19 formaliza.
- **Boleta electrónica (PRD-002 §5.5):** sigue fuera del MVP. La transferencia
  agrega un valor más de `medio` que el registro de pagos debe guardar para
  poder emitirla después.
- **D-3 de PRD-001** (país y pasarela) **sigue cerrada.** Cambia la respuesta,
  no el estado: este PRD es la respuesta vigente.

## 6. Métricas de éxito del cambio

| Métrica | Meta | Por qué |
|---|---|---|
| Pagos en app con billetera, sobre los pagos hechos en dispositivos donde la billetera **sí se mostró** | ≥ 50 % | Es la razón de poner a Fintoc como principal. Si es baja, el orden de §2.3 no está comprando nada |
| Participación de la transferencia en los pagos en app | Se mide; sin meta | Es el medio más barato: su participación es dinero que el local no paga en comisión |
| Transferencias iniciadas que no confirman dentro del plazo | < 5 % | Si sube, el plazo está mal elegido o el medio no aguanta a una mesa que se quiere ir |
| Pagos que caen al cobro manual, sobre los **cobros iniciados en la app** | ≤ 3 % | Mide si el reparto por medio de §2.1 aguanta el servicio real. No se compara con la meta de PRD-001 §3, que mide cuántas cuentas llegan a la app |
| Pagos con tarjeta `enrutado_a_respaldo` | Se mide; sin meta | Es el termómetro de la disponibilidad del proveedor principal. Si deja de ser cero, el respaldo automático de §2.2 ya pagó su costo |
| Billeteras ofrecidas cuya **hoja no se abre** | < 1 % de las veces que se ofreció | Mide la detección de RF-C-30: dice si "cerrado por defecto" quedó bien implementado |
| Pagos con Apple Pay **rechazados por marca no soportada** en el respaldo | Se mide; sin meta | No es un fallo de la app sino del alcance del Beta de Kushki (§2.2). Es el número con el que se decide si ese respaldo vale la pena |
| Alertas de RF-A-19 (webhook después del cobro manual) | < 0,5 % de los cobros | Cada una es un cliente que pudo pagar dos veces. Las palancas son la consulta al proveedor de §2.4, el plazo, y cuántas veces se fuerza el cobro |
| Comisión promedio sobre ventas pagadas en app | Se mide; meta al responder G-2 | No se puede fijar antes de tener las comisiones por medio de los dos proveedores |

La métrica de PRD-002 §8 —*pagos con billetera ≥ 25 % de los pagos*— **sigue
vigente** y mide otra cosa: la mezcla de medios sobre el total de pagos. La
primera fila de esta tabla tiene otro denominador, los pagos hechos donde la
billetera se mostró, y mide si el orden de §2.3 convierte. Son complementarias.

## 7. Decisiones abiertas

### Gate de piloto

**G-2 se reescribe:**

| ID | Pregunta | Quién responde | Supuesto contra el que se construye | Qué se bloquea si no hay respuesta |
|---|---|---|---|---|
| **G-2** (ex D-3.1, reescrita por PRD-007) | Con **Fintoc y Kushki**: ¿disponibilidad real de **Apple Pay y Google Pay por proveedor**? ¿En qué **estado está el Beta de Apple Pay de Kushki** —fecha de salida, marcas soportadas, in-app—? ¿**Comisiones por medio**? ¿**Plazos de liquidación** por medio? ¿Cómo se **comporta Apple Pay si la web app se instala como PWA**? ¿**Requisitos de alta del comercio** en cada proveedor (pregunta conservada de la G-2 original)? | Comercial, con Fintoc y Kushki. El caso PWA es verificación técnica nuestra, no de un tercero | Interfaz única de proveedor (PRD-002 §5.2) y el reparto de §2.1. **Camino base: transferencia y tarjeta por Fintoc**, con el respaldo automático de tarjeta en Kushki. Billeteras, Webpay Plus y el respaldo manual de Apple Pay quedan **deshabilitados en la configuración** del local (RF-A-18). En PWA instalada, **ninguna billetera** hasta que haya respuesta (§2.3) | Las **comisiones y los plazos de liquidación** bloquean el arranque del piloto. El resto bloquea **solo los medios que nombra**: billeteras y Webpay Plus. El desarrollo del pago avanza completo con transferencia y tarjeta |

**Regla de gate: se resuelve una contradicción entre PRDs vigentes.** PRD-003 §2
dice que *"el piloto no arranca con G-1 y G-2 sin respuesta"*; PRD-004 §5 dice
que *"G-4 y G-1 son ahora los dos gates duros del piloto"*. Las dos frases no
pueden ser ciertas a la vez para G-2. Como este PRD reescribe G-2, lo cierra
separando lo que G-2 pregunta:

- **G-1 (propina, legal) y G-4 (datos personales, legal) son los gates duros**,
  tal como los dejó PRD-004 §5: no se resuelven el día de la puesta en marcha.
- **De G-2, las comisiones por medio y los plazos de liquidación también son
  duros:** no se cobra dinero real sin saber cuánto cuesta cada cobro y cuándo
  llega la plata. Esa mitad mantiene a G-2 como condición de arranque.
- **El resto de G-2** —disponibilidad de billeteras, estado del Beta de Kushki,
  Webpay Plus, requisitos de alta y el caso PWA— **bloquea solo esos medios**,
  no el piloto: con transferencia y tarjeta por Fintoc el local cobra en la app
  desde el primer día.
- **G-3 (PIN)** sigue resolviéndose el mismo día de la puesta en marcha
  (PRD-003 §2).

### Decisiones de producto pendientes

| ID | Decisión | Impacto |
|---|---|---|
| D-6 | ¿Qué cuenta como visita? Supuesto vigente: comanda pagada, máx. una por día por local. | Niveles |
| D-9 | ¿Puede el administrador compartir con el mesero un comentario marcado "solo administración"? | Feedback, cultura interna |
| D-13 | Mecánica de los beneficios de producto: ¿los niveles superiores conservan la bebida de bienvenida? ¿Cómo se carga a la comanda y cómo se registra su costo real? ¿Qué pasa con una segunda comanda el mismo día? | Niveles, reportes, app del mesero |
| **D-14** | **¿Qué proveedor sostiene el medio de pago guardado (tokenización) que pide PRD-001 §10, y sigue en el MVP?** Era de MercadoPago y MercadoPago salió; la documentación verificada de Fintoc y Kushki no lo responde. Supuesto contra el que se construye: **no está en el camino crítico** —las billeteras ya dan el pago de un toque y la transferencia autentica en el banco cada vez—; la tarjeta guardada se habilita si el proveedor elegido la soporta, y hasta entonces la tarjeta pide los datos en cada pago. Se responde en la misma conversación de G-2. | Pagos, repetición de compra |
| **D-15** | **¿Cómo se devuelve una transferencia cuenta a cuenta?** No se reversa como una tarjeta. Supuesto contra el que se construye: la devolución ocurre **fuera de PAGAYA** —transferencia bancaria del local— y PAGAYA solo deja constancia, igual que ya hace con los reembolsos de PRD-001 §10. | Operación del local, reclamos |
| **D-16** | **¿Puede el local alterar el orden de presentación de §2.3 o premiar al cliente que paga por transferencia?** La tensión es real: la billetera elimina fricción y la transferencia es el medio más barato; §2.3 eligió fricción. Supuesto contra el que se construye: **no en el MVP** —el local configura habilitación y enrutamiento (RF-A-18), nunca el orden—. | Costo de comisiones, pantalla de pago |
| **D-17** | **Cuando una salida "No es mi mesa" encolada (RF-C-21, §2.4) se ejecuta después de que el webhook confirmó el pago, ¿se le revierten a ese participante la visita y el consumo del tope de un descuento por día por local (PRD-006 §2.7)?** Supuesto contra el que se construye: **la visita no acumula y el descuento diario no se consume** para un participante cuya salida estaba encolada antes del webhook; **el monto cobrado no cambia**. Queda por decidir el caso incómodo: si ese participante era el beneficiario, el local pagó un descuento a nombre de alguien que no se anota ni la visita ni el consumo del tope. | Niveles, reporte de descuentos (RF-A-17), auditoría (RF-A-15) |

**Cerradas en este PRD:** la elección de pasarelas (D-3 de PRD-001 ya estaba
cerrada por PRD-002 y sigue cerrada: cambia su respuesta, §5) y la contradicción
de la regla de gate entre PRD-003 §2 y PRD-004 §5.

## 8. Criterios de aceptación

1. **iPhone compatible en Safari, con las billeteras habilitadas (G-2
   respondida):** la pantalla de pago muestra Apple Pay primero, transferencia
   después, y tarjeta con Webpay Plus al final. Google Pay no aparece.
2. **Android con Google Pay disponible y habilitado:** Google Pay primero, con
   el mismo orden detrás. Apple Pay no aparece.
3. **Dispositivo sin ninguna billetera:** la pantalla abre con transferencia y
   tarjeta, y no muestra ninguna opción que falle al tocarla. Reemplaza al
   criterio 7 de PRD-002 §10, que nombraba tarjeta y Webpay.
4. **Con G-2 sin responder:** transferencia y tarjeta funcionan de punta a punta
   y **ninguna billetera aparece** como opción. Amplía PRD-003 §6, criterio 7,
   que decía lo mismo cuando el único camino base era la tarjeta.
5. **Web app instalada como PWA, con G-2 sin responder:** no se ofrece ninguna
   billetera; transferencia y tarjeta sí, y el cliente completa el pago.
6. **Pago por transferencia:** el monto cobrado es `consumo − descuento +
   propina` en **un solo cobro**, y la comanda pasa a `pagada` únicamente cuando
   llega el webhook; la vuelta del cliente desde su banco no la mueve.
7. **El beneficiario toca "No es mi mesa" con una transferencia `autorizando`:**
   la acción se encola, el intento no se rechaza y, si el webhook confirma, el
   cobro queda con la instantánea congelada (PRD-006 §2.4). Con cualquier otro
   medio, sigue aplicando PRD-006 §2.6 tal cual.
8. **Transferencia vencida y no pagada en el proveedor:** la consulta dice que
   no está hecha, el intento pasa a `rechazado`, la mesa pasa a
   `pago_pendiente`, y el cliente puede reintentar o el mesero cobrar fuera de
   la app —uno de los dos, no ambos— por el monto que calculó el sistema y con
   el mismo beneficiario (PRD-006 §2.9).
9. **Transferencia vencida pero pagada en el proveedor:** no se ofrece el cobro
   manual ni el reintento, la app sigue esperando y el webhook cierra la
   comanda.
10. **Cobro forzado:** con un intento vivo, el mesero fuerza el cobro manual
    tras una confirmación explícita; el cobro se registra con motivo y actor. Si
    el webhook confirma después, el pago digital queda `pagado`, el registro
    manual queda `en_conflicto`, el administrador recibe la alerta de RF-A-19, y
    ni las ventas ni el reporte de descuentos cuentan esa comanda dos veces. El
    sistema no elige por el local qué devolver.
11. **Caída del proveedor principal de tarjeta:** los pagos con tarjeta se
    reenrutan solos a Kushki, quedan marcados `enrutado_a_respaldo` y el cliente
    no ve ningún cambio en la pantalla.
12. **Caída de Fintoc completa:** transferencia, Google Pay y Apple Pay
    desaparecen de la pantalla; la tarjeta sigue cobrando por el respaldo, y si
    ningún proveedor responde, el mesero cobra por la vía tradicional sin que
    nada se lo impida (PRD-001 §14 y §16).
13. **Cambio de proveedor por configuración:** deshabilitar Fintoc para tarjeta
    enruta los pagos con tarjeta a Kushki sin desplegar una versión nueva de la
    app ni tocar ninguna regla de negocio (PRD-002 §5.2).
14. **Apple Pay enrutado a Kushki:** se ofrece solo si el administrador activó
    ese respaldo y solo en navegador web; en cualquier otro contexto no se
    muestra. Si el cliente elige en la hoja una tarjeta que no es Visa ni
    Mastercard, el pago se rechaza y vuelve a la pantalla de medios con
    transferencia y tarjeta disponibles, sin dejar la comanda en un estado
    intermedio.
15. **MercadoPago no existe:** no hay referencia a MercadoPago en la
    configuración del local ni en el enrutamiento, y un pago con
    `proveedor = mercadopago` no es representable en el modelo de datos.
