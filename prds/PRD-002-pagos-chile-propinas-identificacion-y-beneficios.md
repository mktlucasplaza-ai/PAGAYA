# PRD-002 — Pagos en Chile, propinas, identificación de mesa y beneficios por nivel

| | |
|---|---|
| **Versión** | 002 |
| **Estado** | Vigente |
| **Fecha** | 2026-09-25 |
| **Reemplaza a** | PRD-001 (en las secciones indicadas) |

---

## 0. Cambios en esta versión

**Motivo del cambio:** cerrar cuatro de las decisiones abiertas del PRD-001
(D-2, D-3, D-4, D-5 parcial) y agregar propinas, que en Chile son parte
inseparable del pago en restaurante.

### Se agregó
- **RF-C-15 a RF-C-18** — propina opcional en el pago: 0 %, 10 % sugerido o monto
  libre definido por el cliente (§2).
- **RF-C-19, RF-M-13, RF-M-14, RF-A-12** — identificación del cliente en la mesa:
  PIN de mesa y **PAGAYA ID** del cliente frecuente, que el mesero puede asignar
  a una mesa desde su app (§3).
- **RF-A-13, RF-A-14** — reporte de propinas por mesero y por turno (§2.4).
- **§4.3 Beneficio de exención de feedback** a partir de la 5.ª visita.
- **Capa de abstracción de medios de pago** (§5.2): el sistema no se acopla a una
  sola pasarela.
- Entidades nuevas al modelo de datos: `Propina`, `PAGAYA ID`, `PIN de mesa`,
  `Sesión de mesa` (§6).

### Se modificó
- **§5.2 "Fuera del MVP" del PRD-001** — las propinas salen de "fuera del MVP" y
  entran al alcance. La **división de cuenta sigue fuera** del MVP.
- **§10 Pagos del PRD-001** — se define Chile como mercado, MercadoPago como
  pasarela principal y Kushki como agregador para Webpay / Apple Pay / Google
  Pay. El total a cobrar pasa a ser `consumo − descuento + propina` (§2.2).
- **RF-C-09** — el detalle de cuenta ahora incluye la propina elegida y la
  muestra separada del consumo.
- **RF-C-10** — el pago admite tarjeta, Webpay, Apple Pay y Google Pay.
- **RF-C-11 (feedback)** — antes: totalmente opcional y omitible. Ahora: es el
  paso que **cierra la visita**; una visita cuenta para el nivel solo si el
  cliente entregó feedback, salvo que esté exento por nivel. El feedback **nunca
  bloquea el pago ni la salida del cliente** (§4.3).
- **RF-C-01 / RF-C-02** — el ingreso a la mesa exige PIN de mesa; el cliente con
  PAGAYA ID puede ser sentado por el mesero sin PIN (§3).
- **§8 Niveles del PRD-001** — la escala se reordena para que la exención de
  feedback coincida con un nivel: *Fiel* pasa de **8 a 5 visitas** y
  *Embajador* de 15 a **12** (§4.2).
- **Riesgo "Alguien escanea el QR de una mesa que no ocupa"** — mitigación
  definida: PIN de mesa rotativo (§3.1).
- **Decisiones abiertas del PRD-001:** D-2, D-3 y D-4 quedan **cerradas**; D-5
  queda **parcialmente cerrada** (§4.3). D-1, D-6 y D-7 siguen abiertas.

### Se eliminó
- Nada. Las propinas dejan de estar excluidas, pero ningún requisito del
  PRD-001 se elimina.

**Sin cambios:** todo lo no mencionado aquí sigue vigente según el PRD-001 —
flujo principal, notificaciones, roles, estados de mesa y comanda, requisitos no
funcionales y criterios de aceptación.

---

## 1. Contexto

El PRD-001 dejó el pago definido de forma genérica ("pago digital del total") y
sin mercado. Definido Chile como mercado del piloto, aparecen tres cosas que no
se pueden postergar: la propina (culturalmente obligatoria de ofrecer, aunque
sea voluntaria de pagar), los medios de pago locales (Webpay concentra buena
parte del débito con Redcompra) y la identificación del cliente en la mesa, que
es lo que hace posible todo el programa de niveles.

## 2. Propinas

### 2.1 Comportamiento

La propina es **opcional y explícita**: se elige en la pantalla de pago, antes de
confirmar, nunca por omisión ni preseleccionada de forma que el cliente pague sin
darse cuenta.

| ID | Requisito | Prioridad |
|---|---|---|
| RF-C-15 | En la pantalla de pago el cliente elige propina: **Sin propina**, **10 % (sugerida)** o **Otro monto**. | Must |
| RF-C-16 | "Otro monto" acepta un monto en pesos definido por el cliente, con mínimo $0 y un máximo configurable por el local (por defecto 100 % del consumo, como tope anti-error). | Must |
| RF-C-17 | El total a pagar se recalcula en vivo y muestra siempre el desglose: consumo, descuento por nivel, propina y total. | Must |
| RF-C-18 | El comprobante en la app detalla la propina por separado del consumo. | Must |

- La opción sugerida se muestra destacada pero **"Sin propina" tiene la misma
  visibilidad y un toque de distancia**: no se esconde ni se penaliza.
- El porcentaje sugerido (10 % por defecto) es configurable por el administrador.
- Si el pago se reintenta, la propina elegida se conserva y puede modificarse.

### 2.2 Cálculo

```
consumo            = suma de ítems de la comanda (precios con IVA incluido)
descuento_nivel    = consumo × % del nivel vigente del cliente que paga
base_propina       = consumo − descuento_nivel
propina            = 0  |  base_propina × 10 %  |  monto libre del cliente
total_a_pagar      = consumo − descuento_nivel + propina
```

- La propina se calcula **sobre el consumo ya descontado**, no sobre el precio de
  lista: el cliente no paga propina sobre un descuento que recibió.
- La propina **no forma parte de la venta del local**: se registra como monto de
  paso, separado en reportes y en el comprobante.
- Redondeo: la propina sugerida se redondea al peso más cercano.

### 2.3 Distribución
- La propina queda **asociada a la comanda y al mesero a cargo de la mesa** en el
  turno, para que el reporte permita cualquier política de reparto.
- PAGAYA **no reparte ni transfiere propinas** en el MVP: entrega el reporte y el
  local paga según su política. La transferencia directa al mesero es candidata a
  un PRD posterior.

### 2.4 Reportes

| ID | Requisito | Prioridad |
|---|---|---|
| RF-A-13 | Ver propinas del día y del período: total, por mesero y por turno. | Must |
| RF-A-14 | Ver tasa de propina: % de cuentas con propina y propina promedio. | Should |

### 2.5 Legal
La propina en Chile es **voluntaria** y su cobro por medios electrónicos está
regulado (Ley 21.456 y normativa asociada). Antes del piloto hay que validar con
asesoría legal/contable chilena: (a) que la pantalla cumpla con ofrecerla y
permitir rechazarla, (b) el tratamiento tributario de la propina como monto de
paso y (c) si la propina debe ir o no en la boleta electrónica. Esto se registra
como **D-8**.

## 3. Identificación del cliente en la mesa

Hay dos caminos, y conviven. El QR dice *qué mesa es*; el PIN o el PAGAYA ID
dicen *que esta persona está sentada ahí*.

### 3.1 Camino 1 — PIN de mesa (cliente nuevo o sin ayuda del mesero)

- Cada mesa tiene un **PIN de 4 dígitos** visible solo en la mesa (impreso en el
  soporte del QR o en el vuelto del mantel individual del turno).
- El PIN **rota**: cambia al cerrarse la sesión de mesa (y al menos una vez por
  turno), de modo que un PIN visto ayer no sirve hoy.
- Flujo: escanear QR → ingresar PIN → unirse a la comanda.
- Límite de intentos por dispositivo y por mesa; al superarlo, solo el mesero
  puede sentar al cliente.

### 3.2 Camino 2 — PAGAYA ID (cliente frecuente, sentado por el mesero)

- Todo cliente registrado tiene un **PAGAYA ID**: un código corto legible (6
  caracteres, ej. `PG-4K7Q`) y su **QR personal**, visibles en su perfil.
- El mesero, desde su app, en la mesa: **"Sentar cliente"** → escanea el QR del
  cliente o tipea su código → el cliente queda unido a la comanda de esa mesa,
  sin PIN.
- Es un gesto de reconocimiento, no un trámite: el mesero ve el nombre y el nivel
  del cliente al escanearlo, y por eso funciona bien con el frecuente.
- El cliente también puede **pedir sentarse desde su app** ("Estoy en el local"):
  queda en una lista de espera de sentado que el mesero ve y resuelve asignándole
  la mesa con un toque. Útil cuando el cliente ya llegó y el QR está ocupado o
  ilegible.

### 3.3 Requisitos

| ID | Requisito | Prioridad |
|---|---|---|
| RF-C-19 | Ver su PAGAYA ID y su QR personal en el perfil, y poder mostrarlo sin conexión. | Must |
| RF-C-01 (mod.) | Unirse a la mesa escaneando el QR e ingresando el PIN de mesa vigente. | Must |
| RF-M-13 | "Sentar cliente": unir a un cliente a una mesa a su cargo escaneando su QR personal o tipeando su PAGAYA ID, sin PIN. | Must |
| RF-M-14 | Ver y resolver solicitudes de "estoy en el local" de clientes presentes sin mesa asignada. | Should |
| RF-A-12 | Configurar la rotación del PIN de mesa y ver el PIN vigente de cada mesa. | Must |

### 3.4 Sesión de mesa
La **sesión de mesa** es lo que vincula mesa, comanda y clientes sentados. Se
abre al primer ingreso (por PIN o por el mesero) y se cierra con el pago y la
liberación. Al cerrarse: expira el acceso de todos los dispositivos a esa
comanda y rota el PIN. Nadie puede ver una comanda cerrada salvo desde su propio
historial de cuentas.

## 4. Beneficios por nivel

### 4.1 Tipo de beneficio
El beneficio principal es **descuento sobre la cuenta**, aplicado automáticamente
al calcular el total y mostrado desglosado antes de pagar (cierra D-4). El costo
del descuento lo absorbe el local; PAGAYA no financia beneficios.

### 4.2 Escala (reemplaza la tabla de §8 del PRD-001)

| Nivel | Visitas | Beneficio |
|---|---|---|
| Nuevo | 1 | Pedido y pago desde la app |
| Frecuente | 3 | Bebida o entrada de bienvenida |
| **Fiel** | **5** | **10 % de descuento en la cuenta + exención de feedback** |
| Embajador | 12 | 15 % de descuento + prioridad de atención visible para el mesero |

Los umbrales y los porcentajes siguen siendo configurables por el administrador
(RF-A-07). *Fiel* baja de 8 a 5 visitas para que coincida con la exención de
feedback pedida por negocio.

### 4.3 Exención de feedback (modifica RF-C-11)

Para que "irse sin dar feedback" sea un beneficio, el feedback deja de ser
puramente opcional y pasa a ser el **paso que cierra la visita**:

- Tras el pago confirmado, la app pide el feedback (comida, atención, comentario
  opcional). **El pago ya está hecho y el cliente puede irse en cualquier
  momento: el feedback nunca bloquea nada.**
- Lo que se condiciona es el **conteo de la visita para el nivel**: una visita
  suma al nivel si el cliente entregó feedback. Si lo omite, la visita queda
  registrada pero **no acumula** para subir de nivel, y la app lo dice de frente:
  *"Cuéntanos cómo fue para que esta visita cuente"*.
- El feedback omitido puede completarse **hasta 24 h después**, desde el
  historial; si lo completa en ese plazo, la visita acumula.
- A partir del nivel **Fiel (5 visitas)**, el cliente queda **exento**: se le
  agradece y sus visitas acumulan sin feedback. Se le ofrece opinar, nunca se le
  insiste.

> Se aceptó a conciencia el sesgo que esto introduce: el feedback de las primeras
> 5 visitas tiene un incentivo detrás, y el del cliente frecuente es
> voluntario. Se mide por separado (feedback incentivado vs. espontáneo) para no
> leer mal los promedios.

### 4.4 Visibilidad del comentario libre (cierra D-5 parcialmente)
El comentario libre lo ve el **administrador** completo. El mesero ve los
puntajes de sus mesas y el comentario **solo si el cliente no marcó "enviar solo
a administración"**. Queda por decidir si el administrador puede compartir un
comentario puntual con el mesero de forma explícita (**D-9**).

## 5. Pagos en Chile (reemplaza §10 del PRD-001 en lo indicado)

### 5.1 Medios de pago del MVP
- **Tarjetas** de crédito y débito (Redcompra incluido).
- **Webpay** (Transbank), por su penetración en débito.
- **Apple Pay** y **Google Pay**, por ser el camino más corto al pago sin
  fricción, que es la promesa del producto.

### 5.2 Proveedores y abstracción

- **MercadoPago** como pasarela principal: checkout, tokenización de tarjetas,
  medios guardados y webhooks.
- **Kushki** como agregador para lo que MercadoPago no cubra o cubra peor en
  Chile, en particular **Webpay** y las billeteras **Apple Pay / Google Pay**.
- El sistema define una **interfaz única de proveedor de pago** (crear intento,
  confirmar, consultar, reembolsar, recibir webhook) con una implementación por
  proveedor. Ninguna regla de negocio conoce el nombre de la pasarela.
- El administrador configura, por local, **qué medios están habilitados y por
  qué proveedor se enruta cada uno**. Si un proveedor falla, se puede enrutar al
  otro sin cambiar la app.
- **Verificación previa obligatoria (D-3.1):** confirmar con cada proveedor la
  disponibilidad real de Apple Pay y Google Pay en Chile, comisiones por medio,
  plazos de liquidación y requisitos de alta del comercio. La arquitectura no
  depende de la respuesta, pero el plan comercial sí.

### 5.3 Requisitos técnicos de las billeteras
- **Apple Pay** en web exige dominio verificado, certificado de comerciante y
  Safari/iOS; en la app nativa, el SDK correspondiente. Si no está disponible en
  el contexto del cliente, **la opción no se muestra** (nunca una opción que
  falla al tocarla).
- **Google Pay** exige alta de comerciante y navegador compatible; misma regla de
  visibilidad condicional.
- Como el cliente puede entrar por web app desde el QR (PRD-001 §13), la app
  detecta el entorno y ofrece solo los medios que ese dispositivo puede pagar,
  con tarjeta como camino siempre disponible.

### 5.4 Reglas que se mantienen del PRD-001
Idempotencia del cobro, congelamiento de la comanda al iniciar el pago,
confirmación de pago **solo por webhook**, caída al cobro tradicional con
registro manual, y no almacenar datos de tarjeta en PAGAYA. La propina entra en
el mismo intento de pago que el consumo: **un solo cobro**, no dos.

### 5.5 Boleta electrónica
La emisión de boleta electrónica (SII) **sigue fuera del MVP**, pero el registro
de pagos debe guardar lo necesario para emitirla después (neto, IVA, propina
separada, RUT del local, folio del pago). Se aborda en un PRD propio.

## 6. Impacto en el modelo de datos

Entidades nuevas:
- **Sesión de mesa:** mesa, comanda, apertura, cierre, PIN vigente, clientes
  sentados y por qué vía ingresó cada uno (PIN / mesero / solicitud).
- **PIN de mesa:** mesa, valor, vigencia, intentos fallidos.
- **PAGAYA ID:** cliente, código corto, QR, estado.
- **Propina:** pago, monto, tipo (`sin_propina` | `sugerida_10` | `monto_libre`),
  mesero atribuido.
- **Solicitud de sentado:** cliente, local, timestamp, estado, mesa resuelta.

Entidades modificadas:
- **Pago:** agrega `monto_consumo`, `monto_descuento`, `monto_propina`,
  `proveedor` (`mercadopago` | `kushki`) y `medio` (`tarjeta` | `webpay` |
  `apple_pay` | `google_pay` | `manual_fuera_de_app`).
- **Visita:** agrega `acumula_para_nivel` (booleano) y `motivo_no_acumula`
  (`feedback_pendiente`), más `feedback_exento`.
- **Configuración del local:** agrega % de propina sugerida, tope de propina
  libre, medios habilitados y enrutamiento por proveedor, política de rotación
  de PIN.

## 7. Impacto en otros flujos y roles

- **Cliente:** el ingreso gana un paso (PIN) que desaparece cuando el mesero lo
  sienta por PAGAYA ID; la pantalla de pago gana el selector de propina; el
  cierre explica qué gana entregando feedback.
- **Mesero:** gana "Sentar cliente" y la bandeja de solicitudes de sentado, y ve
  las propinas de su turno. Sentar al frecuente por su ID es el momento de
  reconocimiento que antes no existía.
- **Administrador:** configura propina, PIN y enrutamiento de medios; suma
  reportes de propina.
- **Notificaciones:** sin cambios. La notificación de "cliente completó pago"
  incluye ahora el total con propina.

## 8. Métricas de éxito del cambio

| Métrica | Meta |
|---|---|
| % de cuentas con propina | ≥ 60 % |
| Propina promedio | ≥ 8 % del consumo |
| Abandono en la pantalla de pago (propina como fricción) | ≤ 5 % |
| Ingresos a mesa bloqueados por PIN incorrecto | < 2 % de los ingresos |
| Clientes frecuentes sentados por PAGAYA ID | ≥ 50 % de las visitas de nivel Fiel+ |
| % de cuentas con feedback (visitas 1 a 4) | ≥ 70 % |
| Pagos con billetera (Apple/Google Pay) | ≥ 25 % de los pagos |

## 9. Decisiones abiertas

Siguen abiertas del PRD-001: **D-1** (quién toma el primer pedido), **D-6**
(qué cuenta como visita), **D-7** (registro obligatorio o invitado).

Nuevas:

| ID | Decisión | Impacto |
|---|---|---|
| D-8 | Validación legal y contable en Chile de la propina electrónica y su tratamiento tributario. | Pagos, contabilidad |
| D-9 | ¿Puede el administrador compartir con el mesero un comentario marcado "solo administración"? | Feedback, cultura interna |
| D-3.1 | Confirmar con MercadoPago y Kushki: disponibilidad real de Apple Pay / Google Pay en Chile, comisiones por medio y plazos de liquidación. | Pagos, plan comercial |
| D-10 | ¿El PIN de mesa se imprime en el soporte del QR (rota por turno) o se muestra en un display/comanda del turno (rota por sesión)? Afecta operación del local. | Operación, seguridad |
| D-11 | ¿La propina se paga al mesero atribuido o va a un pool del turno? PAGAYA solo reporta, pero el reporte debe calzar con la política. | Reportes, relación laboral |

## 10. Criterios de aceptación

1. Un cliente paga con propina sugerida de 10 % y el comprobante muestra consumo,
   descuento, propina y total por separado, en un solo cobro.
2. Un cliente elige "Sin propina" en dos toques y paga sin ningún reintento ni
   fricción adicional.
3. Un cliente ingresa a la mesa con el PIN vigente; el mismo PIN, usado después
   de cerrada la sesión de mesa, es rechazado.
4. Un mesero sienta a un cliente frecuente escaneando su QR personal, ve su nivel
   y el cliente queda en la comanda sin ingresar PIN.
5. Un cliente con 4 visitas omite el feedback: la visita queda registrada y **no**
   acumula; al completarlo dentro de 24 h desde su historial, acumula y sube a
   *Fiel*.
6. Un cliente nivel *Fiel* paga, ve su 10 % de descuento aplicado, no recibe
   requerimiento de feedback y su visita acumula igual.
7. En un dispositivo sin Apple Pay ni Google Pay disponibles, esas opciones no
   se muestran y el pago con tarjeta y Webpay funciona.
8. El administrador cambia el % de propina sugerida y el cambio se refleja en la
   siguiente pantalla de pago.
