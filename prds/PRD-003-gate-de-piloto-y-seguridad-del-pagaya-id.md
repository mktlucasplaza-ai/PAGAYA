# PRD-003 — Gate de piloto y seguridad del PAGAYA ID

| | |
|---|---|
| **Versión** | 003 |
| **Estado** | Vigente |
| **Fecha** | 2026-09-26 |
| **Reemplaza a** | PRD-002 (en las secciones indicadas) |

---

## 0. Cambios en esta versión

**Motivo del cambio:** dos cosas. Primero, ordenar las decisiones abiertas del
PRD-002: tres de ellas no bloquean construir, solo salir a producción, y una no
es necesaria para el MVP. Segundo, escribir las reglas de seguridad del PAGAYA ID
que estaban implícitas en el diseño y no en el documento: sin ellas, el programa
de niveles es un descuento que cualquiera puede reclamar.

### Se agregó
- **§2 Gate de piloto:** las preguntas que deben responderse **antes del
  piloto** pero no antes de construir, cada una con el supuesto contra el cual se
  desarrolla mientras tanto y qué queda bloqueado si no hay respuesta.
- **§3 Seguridad del PAGAYA ID:** las dos reglas (identificador ≠ credencial, y
  beneficio con sesión presente), la matriz de abuso y qué ve el mesero.
- **RF-C-20, RF-C-21, RF-M-15, RF-M-16, RF-A-15** (§3.3).
- **Anexo:** [escenario completo de uso end-to-end](anexos/escenario-camila-septima-visita.md),
  referencia funcional para diseño y QA.

### Se modificó
- **§3.2 del PRD-002 (PAGAYA ID)** — antes: "código corto legible y su QR
  personal". Ahora se distinguen formalmente: el **código corto identifica** y
  **no autentica**; el **QR personal es un token de corta vida que sí
  autentica** (§3.1).
- **RF-M-13** — antes: sentar al cliente por QR **o** código tipeado quedaba
  igual en ambos casos. Ahora: el código tipeado sienta al cliente pero **no
  activa su beneficio de nivel** hasta que su propia sesión se une a la comanda
  (§3.2).
- **§4.1 / §4.2 del PRD-002 (beneficios)** — el descuento por nivel se aplica
  solo si la sesión del cliente beneficiario está activa en la comanda al momento
  de calcular la cuenta.
- **Decisiones D-8, D-3.1 y D-10** — pasan de "decisión abierta" a
  **pregunta de gate de piloto** (§2). No bloquean el desarrollo.
- **Decisión D-11** (propina al mesero atribuido vs. pool del turno) — **cerrada
  sin decisión: fuera del MVP.** PAGAYA atribuye y reporta; la política de
  reparto es del local y no requiere definición de producto (§4).

### Se eliminó
- Nada. **RF-A-13 y RF-A-14 (reportes de propina) se mantienen sin cambios**: la
  atribución de la propina al mesero de la mesa sigue existiendo, es justamente
  lo que permite que el local aplique cualquier política sin que PAGAYA opine.

**Sin cambios:** todo lo no mencionado sigue vigente según el PRD-002 y el
PRD-001 — flujo principal, propinas, medios de pago, PIN de mesa, escala de
niveles, exención de feedback, notificaciones y requisitos no funcionales.

---

## 1. Contexto

El PRD-002 dejó once decisiones anotadas en la misma lista, sin distinguir las
que impiden escribir código de las que solo impiden cobrarle a un cliente real.
Esa mezcla paraliza: un equipo que ve "esperando definición legal" asume que no
puede avanzar en la pantalla de pago, cuando en realidad puede construirla
completa y dejar la regla en configuración.

Además, al detallar el flujo de reconocimiento del cliente frecuente apareció un
hueco: si el PAGAYA ID se trata como una credencial, basta con decir un código en
voz alta para llevarse el descuento de otro. Eso no es un detalle de
implementación, es el modelo de fidelización entero.

## 2. Gate de piloto

Estas preguntas **no bloquean el desarrollo**. Bloquean la salida a producción
con clientes reales. Cada una se construye contra un supuesto explícito y
configurable, para que la respuesta se aplique cambiando configuración, no
código.

| ID | Pregunta | Quién responde | Supuesto contra el que se construye | Qué se bloquea si no hay respuesta |
|---|---|---|---|---|
| **G-1** (ex D-8) | Tratamiento legal y tributario de la propina electrónica en Chile: ¿la pantalla cumple con ofrecerla y permitir rechazarla? ¿La propina es monto de paso? ¿Va o no en la boleta? | Asesoría legal/contable chilena | Propina voluntaria, rechazable en un toque, registrada como monto de paso, separada del consumo en comprobante y reportes, fuera de la boleta (que está fuera del MVP). | Cobrar propina real en producción. El desarrollo del selector, el cálculo y los reportes avanza completo. |
| **G-2** (ex D-3.1) | Disponibilidad real de Apple Pay y Google Pay en Chile por proveedor, comisiones por medio, plazos de liquidación y requisitos de alta del comercio. | Comercial, con MercadoPago y Kushki | Interfaz única de proveedor de pago (PRD-002 §5.2). Tarjeta vía MercadoPago como camino base siempre disponible; Webpay, Apple Pay y Google Pay detrás de *feature flag* por proveedor y por local. | Habilitar los medios no confirmados y firmar el plan de comisiones. El desarrollo del pago avanza completo con el camino base. |
| **G-3** (ex D-10) | ¿El PIN de mesa se imprime en el soporte del QR (rota por turno) o se muestra en un elemento del turno (rota por sesión de mesa)? | Operación del local piloto | Ambas soportadas: la rotación es configurable (RF-A-12). Por defecto **rotación por sesión de mesa**, que es la más segura; si el local elige impreso, se degrada a rotación por turno. | Nada del desarrollo. Solo la logística de impresión y la capacitación del personal del local. |

**Regla de gate:** el piloto no arranca con G-1 y G-2 sin respuesta. G-3 puede
resolverse el mismo día de la puesta en marcha, porque es una elección de
operación entre dos comportamientos ya implementados.

## 3. Seguridad del PAGAYA ID

### 3.1 Regla 1 — El código corto identifica; no autentica

El PAGAYA ID tiene dos representaciones y **no son equivalentes**:

| | **Código corto** (`PG-4K7Q`) | **QR personal** |
|---|---|---|
| Qué es | Un **identificador público** y estable del cliente | Un **token de corta vida** generado por la app |
| Para qué sirve | Nombrar al cliente: tipearlo, buscarlo en un reporte, decirlo en voz alta | Probar que el teléfono del cliente está presente en este momento |
| Vigencia | Permanente | **60 segundos**, se regenera solo |
| ¿Autentica? | **No** | **Sí** |
| Si un tercero lo conoce | No obtiene nada | No sirve: ya expiró |

Que alguien escuche el código de otro no le da acceso a nada, del mismo modo que
conocer un número de cliente no permite usar su cuenta. La autenticación vive
donde siempre vivió: en la sesión del cliente en su propio teléfono.

- El QR se genera en el dispositivo y se valida en el servidor contra ventana de
  tiempo y un solo uso: un QR ya canjeado no se vuelve a aceptar.
- El QR debe poder mostrarse **sin conexión** (el token se pre-genera con
  tolerancia de reloj), porque en un restaurante lleno la señal es mala.
- El código corto no es adivinable por fuerza bruta útil, pero **aunque lo
  fuera, no serviría**: su valor de ataque es cero por diseño. La seguridad no
  descansa en que sea secreto.

### 3.2 Regla 2 — El beneficio requiere la sesión del cliente presente

**El descuento y el conteo de visita se activan solo si la sesión del propio
cliente está activa en la comanda.**

Por lo tanto, las dos vías de sentado no son equivalentes en consecuencias:

| Vía de sentado | Cliente queda en la comanda | Beneficio de nivel activo | Visita acumula |
|---|---|---|---|
| Cliente escanea QR de mesa + PIN | Sí | Sí | Sí |
| Mesero escanea el **QR personal** del cliente | Sí | Sí | Sí |
| Mesero **tipea el código corto** | Sí (para atenderlo bien) | **No**, hasta que la sesión del cliente se una | No, hasta lo mismo |

El caso del código tipeado no es un error: es el camino para atender bien a
alguien cuyo teléfono se quedó sin batería o que no logra escanear. El mesero lo
sienta, lo atiende, le toma el pedido a mano (RF-M-07) y la mesa funciona. Lo
único que no ocurre es regalar un descuento a quien no puede probar que es quien
dice ser.

La app del mesero lo dice de frente al tipear el código: *"Cliente sentado. El
beneficio se aplica cuando abra su app en la mesa."* Nadie descubre el problema
recién al momento de pagar.

### 3.3 Requisitos

| ID | Requisito | Prioridad |
|---|---|---|
| RF-C-20 | El QR personal es un token de un solo uso con vigencia de 60 s, se regenera automáticamente y funciona sin conexión. | Must |
| RF-C-21 | Al ser sentado por el mesero, la app del cliente muestra de forma prominente **en qué mesa quedó** y ofrece **"No es mi mesa"**, que lo saca de esa comanda al instante y avisa al mesero. | Must |
| RF-C-22 | El cliente puede regenerar su PAGAYA ID (código corto nuevo) si lo considera comprometido, conservando sus visitas y su nivel. | Should |
| RF-M-15 | Al sentar por código corto tipeado, la app del mesero indica que el beneficio queda pendiente de que el cliente abra su app. | Must |
| RF-M-16 | La vista de mesa del mesero distingue los comensales con sesión activa de los sentados manualmente. | Should |
| RF-A-15 | El panel registra, por cada comensal de cada comanda, la vía de ingreso (PIN / QR personal / código tipeado / agregado por mesero) para auditoría de descuentos. | Must |

### 3.4 Qué ve el mesero al escanear (y qué no)

Al escanear el QR personal, la app del mesero muestra exactamente cuatro cosas:
**nombre de pila, nivel, número de visita y el beneficio a aplicar.**

No muestra teléfono, email, consumo histórico ni qué pidió otras veces. Esa
contención es deliberada: el mesero necesita **reconocer** al cliente, no
perfilarlo. Cualquier dato adicional exigiría consentimiento explícito del
cliente y un PRD propio.

### 3.5 Matriz de abuso

| Intento | Qué lo cierra |
|---|---|
| Alguien dice "soy PG-4K7Q" para llevarse el 15 % | Regla 2: sin sesión del cliente en la comanda, no hay descuento. |
| Captura de pantalla del QR de otra persona | Regla 1: el token ya expiró (60 s, un solo uso). |
| Mesero aplica descuentos a conocidos usando códigos ajenos | Regla 2 + RF-A-15: el descuento requiere sesión del titular y la vía de ingreso queda auditada. |
| Sentar a un cliente en la mesa equivocada y hacerle pagar otra cuenta | RF-C-21: la app del cliente muestra la mesa y permite salir; además el pago siempre lo confirma el cliente. |
| Reusar el PIN de mesa de otro turno | PRD-002 §3.4: el PIN rota al cerrarse la sesión de mesa. |
| Farmear visitas sentándose varias veces al día | PRD-001 §8: máximo una visita por día por local, y solo con comanda pagada. |

## 4. Propinas: D-11 fuera del MVP

La pregunta de si la propina va al mesero atribuido o a un pool del turno **no
requiere respuesta de producto para el MVP**. PAGAYA hace una sola cosa:
registrar cada propina con el mesero a cargo de esa mesa en ese turno, y
entregar el reporte (RF-A-13, RF-A-14). Con ese dato el local aplica la política
que quiera —individual, pool por turno, pool general— sin que el sistema la
imponga.

Si en el futuro PAGAYA transfiere propinas directamente al mesero, entonces sí
hay que decidirlo, y será un PRD propio.

## 5. Impacto en el modelo de datos

Entidades modificadas:
- **PAGAYA ID:** agrega `token_actual`, `vigencia_token`, `usado` y
  `codigo_regenerado_en`. El código corto y el token quedan como campos
  distintos, nunca derivable uno del otro.
- **Participante de comanda:** agrega `sesion_activa` (booleano) y
  `beneficio_activo` (booleano), además de la `via_ingreso` ya definida en el
  PRD-002.
- **Pago:** el `monto_descuento` solo puede ser mayor que cero si existe un
  participante con `beneficio_activo = true`. Es una **invariante del cálculo**,
  no una validación de interfaz.
- **Visita:** acumula solo si el participante tuvo `sesion_activa` en la comanda.
- **Configuración del local:** agrega los *feature flags* de medios de pago por
  proveedor que exige G-2.

## 6. Criterios de aceptación

1. Un QR personal escaneado dos veces es rechazado la segunda vez, y uno de hace
   dos minutos es rechazado siempre.
2. Un cliente nivel Fiel sentado por **código tipeado** no recibe descuento; al
   abrir su app en la mesa, el descuento aparece en la cuenta sin que el mesero
   haga nada más.
3. Un cliente sentado por error en otra mesa toca "No es mi mesa", sale de la
   comanda en el acto y el mesero recibe el aviso.
4. Un pago con `monto_descuento > 0` sin ningún participante con
   `beneficio_activo` es imposible de generar, y el intento queda registrado.
5. El panel muestra, para cualquier comanda con descuento, quién lo originó y por
   qué vía ingresó.
6. Un cliente regenera su código corto y conserva sus visitas y su nivel.
7. Con G-2 sin responder, el pago con tarjeta funciona de punta a punta y las
   billeteras no aparecen como opción.
8. El QR personal se muestra correctamente con el teléfono en modo avión.

## 7. Decisiones abiertas

**Gate de piloto:** G-1, G-2, G-3 (§2).

**Decisiones de producto pendientes** (heredadas del PRD-001):

| ID | Decisión | Impacto |
|---|---|---|
| D-1 | ¿El primer pedido lo toma siempre el cliente por la app, o el mesero también puede tomarlo? | Flujo principal, app del mesero |
| D-6 | ¿Qué cuenta como visita? Supuesto vigente: comanda pagada, máx. una por día por local. | Niveles |
| D-7 | ¿Se exige registro para pedir, o se permite pedir como invitado y registrarse al pagar? | Conversión de la primera visita |
| D-9 | ¿Puede el administrador compartir con el mesero un comentario marcado "solo administración"? | Feedback, cultura interna |
