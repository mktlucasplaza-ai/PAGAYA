# PRD-004 — Registro obligatorio para pedir

| | |
|---|---|
| **Versión** | 004 |
| **Estado** | Vigente |
| **Fecha** | 2026-09-26 |
| **Reemplaza a** | PRD-003 (en las secciones indicadas) |

---

## 0. Cambios en esta versión

**Motivo del cambio:** cerrar **D-7**. Se decide exigir registro para pedir. Sin
identidad no hay visitas, y sin visitas no hay programa de niveles: el modelo de
fidelización, que es el diferencial del producto, deja de existir si se permite
pedir como invitado.

### Se agregó
- **§2 Dónde se exige el registro:** el muro aparece al **enviar el primer
  pedido**, no al entrar a la mesa (§2.1).
- **§3 Registro mínimo:** tres campos, un OTP, sin contraseña (RF-C-25).
- **§4 El comensal que no se registra:** sigue siendo atendido; queda definido
  qué pierde y quién paga su consumo.
- **§5 Consecuencia de datos personales:** exigir registro convierte a PAGAYA en
  responsable de datos personales de todo comensal que use la app. Nace la
  pregunta de gate **G-4** y el derecho de eliminación (RF-C-23).
- **RF-C-23, RF-C-24, RF-C-25, RF-C-26, RF-A-16** (§6).

### Se modificó
- **RF-C-02** — antes: "registro e ingreso con teléfono o email y código OTP".
  Ahora: el registro es **obligatorio antes de enviar el primer pedido**, con
  formulario mínimo definido (§3), y se explicita **una cuenta por número de
  teléfono**.
- **RF-C-05** — antes: "enviar el pedido a la mesa". Ahora: enviar un pedido
  requiere cuenta activa; sin cuenta, el botón lleva al registro conservando el
  carro armado.
- **RF-C-03** — la carta se puede ver **completa y sin registro**: explorar nunca
  exige identidad (§2.2).
- **RF-C-01 / PRD-002 §3** — unirse a la mesa por QR + PIN **no exige registro**;
  lo exige pedir. El PIN sigue siendo el control de "estoy sentado acá".
- **§3.2 del PRD-001 (rol mesero)** y **RF-M-07** — se confirma como camino
  permanente, no como parche: el mesero puede tomar el pedido de un comensal sin
  cuenta (§4).
- **Decisión D-7** — **cerrada**: se exige registro para pedir.

### Se eliminó
- La opción de **pedir como invitado**. No estaba implementada; queda
  explícitamente descartada para que no vuelva a discutirse sin un PRD que la
  reabra.

**Sin cambios:** todo lo no mencionado sigue vigente según los PRD-001 a 003 —
flujo principal, propinas, medios de pago, PIN de mesa, PAGAYA ID y sus reglas de
seguridad, escala de niveles, exención de feedback y notificaciones.

---

## 1. Contexto

La alternativa era permitir pedir como invitado y registrarse al pagar. Se
descarta: un comensal que pide sin identidad no acumula visita, y el momento del
pago es el peor instante posible para pedirle datos a alguien que ya tiene la
tarjeta en la mano y quiere irse. Registrar al final es la forma más segura de no
registrar a nadie.

El costo de esta decisión es real y se asume: **la primera visita tiene
fricción**. Todo lo que sigue existe para cobrar esa fricción una sola vez, en el
mejor momento posible, y nunca más.

## 2. Dónde se exige el registro

### 2.1 En el envío del primer pedido, no en la puerta

La regla es **registro para pedir**, y se aplica literalmente: el muro aparece
cuando el cliente toca **"Enviar pedido"**, no cuando escanea el QR.

```
Escanear QR  →  PIN de mesa  →  Ver la carta  →  Armar el pedido
                                                        ↓
                                              [ Enviar pedido ]
                                                        ↓
                                         ┌──────────────────────────┐
                                         │  REGISTRO (3 campos)     │
                                         └──────────────────────────┘
                                                        ↓
                                              Pedido enviado
```

Esto importa más de lo que parece. En el muro de la puerta, el cliente se
registra para *ver si valdrá la pena*; en el muro del envío, ya eligió su pisco
sour y lo quiere. La motivación está en su punto más alto y el registro pasa a
ser un trámite de camino, no un peaje de entrada.

- El carro armado **se conserva**: al terminar el registro, el pedido se envía sin
  que el cliente vuelva a armarlo. Perder el carro en el registro es la forma
  más eficiente de perder al cliente.
- Si el cliente abandona el registro, vuelve a la carta con su carro intacto y
  puede pedirle a un mesero (§4).

### 2.2 Lo que nunca exige registro

- **Ver la carta completa**, con precios, fotos y disponibilidad.
- **Unirse a la mesa** por QR + PIN: el PIN controla presencia física, no
  identidad.
- **Ver la comanda de la mesa** y el total acumulado.
- **Llamar al mesero.** Pedir asistencia presencial jamás se condiciona a tener
  cuenta: es una persona levantando la mano.

Explorar y pedir ayuda son gratis. Lo que cuesta identidad es generar consumo a
nombre de la mesa.

## 3. Registro mínimo

**Tres campos, un OTP, sin contraseña.** El objetivo declarado es **menos de 40
segundos** de punta a punta.

| Campo | Obligatorio | Para qué |
|---|---|---|
| Nombre de pila | Sí | Que el mesero pueda saludarlo por su nombre (PRD-003 §3.4) |
| Teléfono | Sí | Identidad, OTP y una cuenta por persona |
| Código OTP | Sí | Verificación, sin contraseña que recordar |

- **Nada más.** Ni apellido, ni RUT, ni fecha de nacimiento, ni email, ni género,
  ni aceptar comunicaciones comerciales como condición.
- **Sin contraseña:** la sesión queda persistente en el dispositivo y se recupera
  con OTP. Una contraseña en un restaurante es una barrera sin beneficio.
- **Una cuenta por número de teléfono.** Cierra el farmeo de niveles con cuentas
  múltiples, y hace que el PAGAYA ID signifique una persona.
- El email es **opcional y posterior**, ofrecido desde el perfil, nunca en el
  registro.
- El OTP por SMS tiene costo por mensaje y es el principal costo variable de
  captar un cliente nuevo. El canal es configurable (SMS por defecto, con
  alternativa por email o mensajería) para poder optimizarlo sin tocar el flujo.

## 4. El comensal que no se registra

Nadie se queda sin comer por no querer instalar ni registrar nada. El camino del
PRD-001 (RF-M-07) queda confirmado como **permanente**:

- El mesero le toma el pedido y lo agrega a la comanda de la mesa desde su app.
- El consumo entra a la **misma cuenta** que el resto de la mesa.
- **Qué pierde:** no acumula visita, no tiene nivel ni descuento, no ve la
  comanda en su teléfono, no puede pagar desde la app ni llamar al mesero desde
  ella.
- **Quién paga lo suyo:** cualquier comensal registrado de la mesa paga el total
  (PRD-001 RF-C-14), o el local cobra por la vía tradicional con registro manual
  (PRD-002 §5.4). *La división de cuenta sigue fuera del MVP.*

**Basta con que una persona de la mesa esté registrada** para que la mesa entera
tenga la experiencia PAGAYA. Ese es el piso real de adopción: no se necesita
convertir a todos, se necesita a uno.

## 5. Consecuencia: datos personales

Exigir registro significa que PAGAYA pasa a tener nombre y teléfono de **todo**
comensal que use la app, no solo de quien quiso dejarlos. Eso no es un detalle
de formulario, es una responsabilidad legal que nace con esta decisión.

- **Consentimiento informado** en el registro, con finalidad declarada en una
  línea legible —operar la mesa y el programa de visitas—, y enlace a la política
  de privacidad. Sin casillas pre-marcadas.
- **Los datos se usan para operar el servicio.** Cualquier uso comercial
  (campañas, promociones, cesión a terceros) exige consentimiento separado y
  opcional, y no puede condicionar el registro ni el pedido.
- **Derecho de eliminación** desde la app (RF-C-23): al eliminar la cuenta se
  borran los datos personales y se anonimizan las visitas; las transacciones de
  pago se conservan por obligación tributaria y contable.
- **Minimización:** no se recoge nada que el producto no use hoy.

### G-4 — nueva pregunta de gate de piloto

| ID | Pregunta | Quién responde | Supuesto contra el que se construye | Qué se bloquea |
|---|---|---|---|---|
| **G-4** | Cumplimiento de la normativa chilena de datos personales (Ley 19.628 y Ley 21.719, con su entrada en vigencia y sus obligaciones): base de licitud, texto de consentimiento, política de privacidad, plazos de conservación y ejercicio de derechos del titular. | Asesoría legal chilena | Consentimiento explícito, finalidad única de operación del servicio, minimización a tres campos, eliminación a solicitud del titular, sin uso comercial de los datos. | Registrar clientes reales en producción. El desarrollo del flujo avanza completo. |

Se suma a G-1, G-2 y G-3 del PRD-003. **G-4 y G-1 son ahora los dos gates
duros del piloto**, y a diferencia de los otros, este no se puede resolver el día
de la puesta en marcha: requiere textos legales redactados antes.

## 6. Requisitos

| ID | Requisito | Prioridad |
|---|---|---|
| RF-C-02 (mod.) | Registro obligatorio antes de enviar el primer pedido: nombre de pila, teléfono y OTP. Una cuenta por número de teléfono. Sin contraseña, con sesión persistente. | Must |
| RF-C-05 (mod.) | Enviar un pedido exige cuenta activa; sin cuenta, "Enviar pedido" abre el registro **conservando el carro** y envía el pedido al completarlo. | Must |
| RF-C-24 | Ver la carta completa, la comanda de la mesa y llamar al mesero **sin registro**. | Must |
| RF-C-25 | El registro completo, incluido el OTP, se puede terminar en menos de 40 s en un teléfono de gama baja. | Must |
| RF-C-26 | Consentimiento informado visible en el registro, con finalidad declarada y enlace a la política de privacidad; sin casillas pre-marcadas ni consentimiento comercial obligatorio. | Must |
| RF-C-23 | Eliminar la cuenta desde la app: borra datos personales, anonimiza visitas y conserva las transacciones de pago exigidas por normativa. | Must |
| RF-M-07 (conf.) | El mesero toma el pedido de comensales sin cuenta y lo agrega a la comanda de la mesa. | Must |
| RF-A-16 | Ver el embudo de registro: ingresos a mesa, registros iniciados, registros completados y pedidos enviados. | Should |

## 7. Métricas de éxito del cambio

| Métrica | Meta | Por qué |
|---|---|---|
| Registros completados / iniciados | ≥ 85 % | Mide si el formulario es realmente mínimo |
| Tiempo medio de registro | < 40 s | Mide la fricción real, no la percibida |
| Mesas con al menos un comensal registrado | ≥ 80 % | El piso de adopción del §4 |
| Abandono en el muro de registro (vuelve a la carta y no vuelve a intentar) | ≤ 10 % | La señal de alarma: si sube, el muro está mal puesto |
| Comensales atendidos por el mesero por no registrarse | ≤ 25 % | Cuánta carga sigue cayendo en el mesero |
| Entrega de OTP en < 30 s | ≥ 95 % | El SMS que no llega es el registro que se cae |

**Regla de revisión:** si el abandono en el muro supera el 20 % en el piloto, la
decisión de D-7 se reabre con un PRD nuevo. Registrar para pedir es una apuesta
medible, no un dogma.

## 8. Impacto en el modelo de datos

- **Usuario:** agrega `nombre_pila`, `telefono` (único), `estado_verificacion`,
  `consentimiento` (texto y versión aceptada, timestamp) y
  `eliminacion_solicitada_en`.
- **Participante de comanda:** ya distingue vía de ingreso (PRD-003); se agrega
  `comensal_sin_cuenta` para el consumo que el mesero carga a nombre de un
  comensal no registrado.
- **Verificación OTP:** teléfono, canal, intentos, expiración. Límite de envíos
  por número y por dispositivo, para que el OTP no sea un grifo de costo abierto.
- **Configuración del local:** canal de OTP por defecto.

## 9. Criterios de aceptación

1. Un cliente escanea, ingresa el PIN, ve la carta completa y arma un pedido
   **sin registrarse**.
2. Al tocar "Enviar pedido" se le pide registro; al completarlo, el pedido que
   ya había armado se envía solo, sin rearmarlo.
3. Si abandona el registro, vuelve a la carta con su carro intacto.
4. El botón "Llamar al mesero" funciona sin cuenta.
5. Un segundo registro con el mismo número de teléfono entra a la cuenta
   existente en lugar de crear otra.
6. Un comensal sin cuenta come, su consumo entra a la comanda de la mesa vía el
   mesero, y otro comensal registrado paga el total.
7. Un cliente elimina su cuenta: sus datos personales desaparecen, sus visitas
   quedan anonimizadas y los pagos permanecen en los registros contables.
8. El panel muestra el embudo desde ingreso a mesa hasta pedido enviado.

## 10. Decisiones abiertas

**Gate de piloto:** G-1 (propina, legal), **G-4 (datos personales, legal)**,
G-2 (pasarelas), G-3 (PIN).

**Decisiones de producto pendientes:**

| ID | Decisión | Impacto |
|---|---|---|
| D-1 | ¿El primer pedido lo toma siempre el cliente por la app, o el mesero también puede tomarlo? | Flujo principal, app del mesero |
| D-6 | ¿Qué cuenta como visita? Supuesto vigente: comanda pagada, máx. una por día por local. | Niveles |
| D-9 | ¿Puede el administrador compartir con el mesero un comentario marcado "solo administración"? | Feedback, cultura interna |
