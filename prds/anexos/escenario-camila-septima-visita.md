# Anexo — Escenario de uso end-to-end: la séptima visita de Camila

| | |
|---|---|
| **Tipo** | Anexo funcional (no modifica el alcance) |
| **PRD de referencia** | [PRD-003](../PRD-003-gate-de-piloto-y-seguridad-del-pagaya-id.md), sobre PRD-001 y PRD-002 |
| **Fecha** | 2026-09-26 |

> Este anexo no define alcance nuevo: narra el alcance ya definido. Sirve como
> referencia compartida para diseño de pantallas, guiones de QA y capacitación
> del personal del local. Si algo de aquí contradice un PRD, **manda el PRD**.

**Escenario:** bar-restaurante en Providencia, Santiago. 40 mesas, 6 meseros por
turno de noche. Viernes.
**Personajes:** **Camila**, clienta, 7.ª visita, nivel *Fiel* (≥5 visitas, 10 % de
descuento, exenta de feedback). **Tomás** y **Javiera**, acompañantes.
**Diego**, mesero de la zona B (mesas 10 a 18). **Rocío**, administradora.

---

## Parte 0 — La primera visita de Camila, cuatro meses antes

Esto importa porque **la fricción se paga una sola vez** y el contraste es el
producto.

Camila llega por primera vez, se sienta en la Mesa 7, escanea el QR del soporte
de la mesa, ingresa el **PIN 3182** impreso ahí mismo, se registra con su número
de teléfono y un código OTP. **40 segundos.** Pide, come, paga en la app.

Al terminar, la app le pide feedback: puntajes de comida y atención. Ella
responde. La app le dice: *"Visita 1 registrada. A las 5 visitas tienes 10 % de
descuento."* Es la única vez que escribirá un PIN o llenará un formulario.

## Parte 1 — La séptima visita, minuto a minuto

### 21:12 · Llegada
Camila entra con Tomás y Javiera. Diego los recibe y los lleva a la **Mesa 14**.

### 21:13 · El reconocimiento — el gesto central del producto
Camila abre PAGAYA y muestra su pantalla. Diego, desde su app, toca
**"Sentar cliente"** en la Mesa 14 y escanea el **QR personal** de Camila. Su
pantalla muestra, en menos de tres segundos:

```
┌──────────────────────────────┐
│  Camila                      │
│  Fiel · 7.ª visita           │
│  Aplicar 10 % de descuento   │
│                    [ Sentar ]│
└──────────────────────────────┘
```

Cuatro datos. **Diego no ve el teléfono de Camila, ni su email, ni cuánto gastó
las otras seis veces** (PRD-003 §3.4): necesita reconocerla, no perfilarla.

Diego levanta la vista: *"Camila, qué bueno verte de nuevo. ¿Te dejo la de la
ventana la próxima?"*

Eso es todo el producto en una frase. **No hubo PIN, no hubo formulario, no hubo
"¿tiene la app?".** Y el reconocimiento dejó de depender de que a Camila le
tocara el mesero que se acuerda de su cara: ahora es sistema, no azar.

En el teléfono de Camila aparece: **"Estás en la Mesa 14 — Ver mi comanda"**, con
un **"No es mi mesa"** al lado (RF-C-21). El QR que Diego escaneó ya está
quemado: un solo uso, 60 segundos de vida (RF-C-20).

### 21:14 · Los acompañantes — la mesa mixta, que es la realidad
- **Tomás** escanea el QR de la Mesa 14, ingresa el PIN **7431** del soporte y se
  une a la misma comanda.
- **Javiera** no quiere instalar nada. Le dice su pedido a Diego, que lo agrega a
  la comanda desde su app (RF-M-07).

Los tres conviven en **una sola cuenta de mesa**. El sistema nunca asume que
todos tienen la app.

### 21:16 · Primer pedido
Camila y Tomás piden desde sus teléfonos: dos pisco sours, una cerveza, una tabla
de quesos. A Diego le llega *"Mesa 14 agregó productos"* con el detalle. Lleva lo
pedido y marca los ítems como entregados.

En la app de Camila la comanda se ve en vivo: qué pidió cada uno, qué llegó y
cuánto va acumulado.

### 21:48 · Segunda ronda, sin buscar a nadie
Tomás agrega otro pisco sour y papas fritas desde la app, en medio de la
conversación. Diego recibe la notificación y lo lleva.

**Nadie levantó la mano. Nadie esperó a que pasara un mesero.** Ese es el minuto
que el producto le devuelve al cliente y a Diego.

### 22:05 · Asistencia
Se cae un vaso. Camila toca **"Llamar al mesero"**. Diego lo ve en su app, llega
con un paño y marca el llamado como atendido.

### 22:40 · El pago
Camila abre la cuenta:

```
Consumo                          $58.400
Descuento Fiel (10 %)            −$5.840
─────────────────────────────────────────
Subtotal                         $52.560

Propina    [ Sin propina ] [ 10 % ] [ Otro monto ]
Propina (10 %)                    $5.256
─────────────────────────────────────────
TOTAL                            $57.816
```

El 10 % de descuento se aplicó porque **la sesión de Camila está activa en la
comanda** (PRD-003 §3.2). Toca *10 %* de propina — calculada sobre los $52.560 ya
descontados, no sobre el precio de lista — y paga con **Apple Pay**. Dos
segundos. Comprobante en pantalla, con la propina detallada aparte del consumo.

**Un solo cobro. Sin POS. Sin "¿efectivo o tarjeta?". Sin esperar el vuelto.**

### 22:41 · La última notificación
A Diego le llega: **"Mesa 14 completó pago — $57.816"**. Va a la mesa:
*"¿Cómo estuvo todo?"*

Camila, por ser nivel *Fiel*, **está exenta de feedback**: su app no le pide
nada, solo le muestra *"Visita 7 registrada"*. Así que la pregunta de Diego no es
un formulario repetido — es una conversación, y ahí es donde el local se entera de
lo que un puntaje del 1 al 5 nunca le va a decir.

*(Si Camila fuera nivel Nuevo o Frecuente, la app le pediría feedback y le diría
que esa visita cuenta para su nivel cuando lo entregue, con 24 h de plazo. El
pago ya está hecho: irse siempre es posible.)*

### 22:47 · Salida y cierre de mesa
Camila se levanta y sale. Diego libera la Mesa 14. El PIN rota a **2096**: el
7431 que usó Tomás ya no sirve para nadie (PRD-002 §3.4). Las sesiones de los
tres teléfonos en esa comanda expiran; la cuenta queda en el historial personal
de cada uno.

### 22:48 · Rocío, en el panel
- Mesa 14 cerrada en **95 minutos**, consumo $58.400, propina $5.256 atribuida a
  Diego.
- Camila con **7 visitas**; Tomás con su primera.
- Descuento de $5.840 con su origen auditado: Camila, ingreso por QR personal
  (RF-A-15).

Rocío sabe quién es su clienta frecuente. Con efectivo y máquina POS, Camila era
literalmente invisible: seis visitas anteriores sin nombre, sin nivel, sin nadie
que supiera que volvió.

---

## Parte 2 — Los casos que sí pasan un viernes a las 22:00

### El teléfono de Camila murió
Diego toca "Sentar cliente" y **tipea su código corto `PG-4K7Q`**. Camila queda
sentada y atendida: Diego le toma el pedido a mano. Su app le avisa:
*"Cliente sentado. El beneficio se aplica cuando abra su app en la mesa."*

**El 10 % no se aplica**, porque el código identifica pero no autentica
(PRD-003 §3.1–3.2). Si Camila consigue un cargador y abre la app en la mesa, el
descuento aparece solo. Si no, paga el total sin descuento o Diego lo escala a
Rocío. Es incómodo, y es a propósito: si bastara decir un código en voz alta, el
programa de niveles sería un descuento abierto para cualquiera que escuche.

### Alguien intenta usar el nivel de Camila
Un cliente en la Mesa 9 dice ser `PG-4K7Q`. Diego lo sienta por código: sin la
sesión de Camila, **no hay descuento**. Si muestra una captura del QR de Camila,
el token ya expiró y el escaneo se rechaza.

### Diego se equivoca de mesa
Sienta a Camila en la Mesa 12 en vez de la 14. El teléfono de Camila dice
**"Estás en la Mesa 12"**; ella toca **"No es mi mesa"**, sale de esa comanda en
el acto y Diego recibe el aviso. Y aunque no lo notara, Camila jamás pagaría una
cuenta ajena sin darse cuenta: el pago siempre lo confirma ella, viendo el
detalle.

### Se cae la pasarela de pago
Camila intenta pagar y el pago falla definitivamente. La mesa queda en
`pago_pendiente`, Diego cobra con la máquina del local y lo marca como cobrado
fuera de app. **La caída de PAGAYA nunca impide que el restaurante cobre**
(PRD-001 §14, PRD-002 §5.4).

### La tabla de quesos se agotó después de pedida
La app de Camila le avisa que el ítem no está disponible y la comanda se ajusta.
Diego se lo confirma en la mesa.

---

## Parte 3 — Lo que se eliminó de la noche

| Momento tradicional | En PAGAYA |
|---|---|
| Buscar al mesero con la mirada para pedir otra ronda | El cliente agrega desde su teléfono; al mesero le llega |
| "¿Nos trae la cuenta, por favor?" y esperar | La cuenta está siempre visible en la app |
| Esperar la máquina POS, que otro mesero la tiene | No hay máquina |
| "¿Efectivo o tarjeta?", buscar vuelto | Apple Pay, dos segundos |
| Calcular la propina mentalmente o a ojo | Sugerida, editable, sobre el consumo ya descontado |
| Que nadie sepa que es tu séptima vez | Diego lo sabe antes de abrir la boca |

Los **15 minutos finales de puro trámite** —los que el local pierde en rotación y
el cliente en paciencia— se convierten en 2 minutos, y uno de ellos es Diego
preguntando cómo estuvo la comida.
