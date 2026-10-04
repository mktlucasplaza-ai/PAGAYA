# Arquitectura del MVP — decisiones técnicas

| | |
|---|---|
| **Alcance según** | PRD-001 a PRD-005 (RF vigentes, con sus modificaciones aplicadas) |
| **Cubre** | Fases 1 a 3 de [PRD-001 §18](../prds/PRD-001-pagaya-mvp.md); la Fase 4 reusa lo mismo |
| **Estado** | Propuesta vigente. Se edita cuando un PRD nuevo la contradiga |
| **Fecha** | 2026-10-04 |

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

El hilo común: **las reglas que involucran dinero o identidad no viven en la
interfaz**. Viven en una transacción de base de datos, porque es el único lugar
donde "imposible" significa imposible (PRD-003 §5).

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

Lo que aquí se decidió sin que lo decidiera un PRD. **S-1 era la única pregunta
de producto y ya la cerró el PRD-006**; se conserva la fila como registro. Las
demás son valores por defecto técnicos y viven en configuración.

| ID | Supuesto | Por qué, y qué pasa si se resuelve distinto |
|---|---|---|
| **S-1** | **Cerrado por [PRD-006](../prds/PRD-006-beneficiario-del-descuento-por-presencia.md):** el beneficiario es el participante con `beneficio_activo` y mayor porcentaje presente en la comanda, pague él o no; un solo descuento por comanda, decidido al congelar. | Era una contradicción entre PRD-002 §2.2 ("el cliente que paga") y PRD-003 §5 / PRD-005 §3 ("un participante con `beneficio_activo`"). PRD-006 adopta presencia y agrega al pago `beneficiario_id`, `pagador_id`, `nivel_aplicado`, `porcentaje_aplicado` y `monto_descuento_calculado` como instantánea, más un tope opcional por comanda (RF-A-07 mod.) y máximo un descuento por cliente por día. `calcular_cuenta` elige al beneficiario al congelar (AT-3) y la restricción de AT-4 pasa a referenciar `beneficiario_id`. |
| S-2 | Vencimiento del congelamiento: **15 minutos**, configurable por local. | Ningún PRD fija el plazo. Muy corto, se cancelan pagos con 3-D Secure lento; muy largo, la mesa queda bloqueada para el mesero. Se mide en el piloto. |
| S-3 | Plazos de escalamiento al administrador (la "X minutos" de PRD-001 §9): **3 min** para llamado de asistencia, **5 min** para productos agregados. | PRD-001 §9 los deja configurables sin fijar valor. Son configuración por local; se calibran con la operación real. |
| S-4 | Entrega **al menos una vez**, no exactamente una vez. | No existe "exactamente una vez" de punta a punta con un proveedor de push de terceros. Se compensa con idempotencia del consumidor y con la lista en vivo como fuente de verdad (PRD-001 §9). |
| S-5 | Retención del outbox: **30 días** los eventos entregados; los fallidos no se purgan. | Equilibrio entre tamaño de la tabla y poder reconstruir qué pasó en una noche concreta. |

---

## 7. Qué no se decide aquí

- **Proveedor concreto de push y de SMS**, y el plan de nube y despliegue: están
  detrás de una interfaz (AT-1) justamente para no decidirlos hoy. El canal de
  OTP ya es configurable por exigencia de PRD-004 §3.
- **Enrutamiento entre Fintoc y Kushki**: ya está decidido en **PRD-007 §2.1**
  (Fintoc principal, Kushki para Webpay Plus y como respaldo; MercadoPago queda
  descartado), sobre la interfaz única de proveedor que exige PRD-002 §5.2. Su
  habilitación depende de **G-2**, reescrita en PRD-007 §7; aquí no se agrega
  nada. El plazo de confirmación de la transferencia y el conflicto entre un
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
