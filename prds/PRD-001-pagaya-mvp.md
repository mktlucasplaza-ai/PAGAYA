# PRD-001 — PAGAYA: pago rápido y autogestión de mesa en restaurantes

| | |
|---|---|
| **Versión** | 001 (PRD base) |
| **Estado** | Vigente |
| **Fecha** | 2026-09-25 |
| **Reemplaza a** | — |

> Este es el PRD base, por lo tanto no incluye sección de "Cambios en esta
> versión". Todo cambio posterior se documenta en un PRD nuevo.

---

## 1. Resumen ejecutivo

PAGAYA es una plataforma para restaurantes que elimina la fricción de la
experiencia en mesa: el cliente ve su comanda en vivo desde su propio teléfono,
agrega productos cuando quiere, llama al mesero con un botón, paga desde la app
sin esperar la máquina POS y deja feedback al final. El mesero deja de ser un
intermediario de pedidos y pagos, y pasa a ser quien entrega y atiende. El
administrador ve todo lo que ocurre en el salón y la caja.

El diferencial del modelo es la **fidelización por visita**: el cliente escala
de nivel según cuántas veces se sentó efectivamente en el local, y ese nivel le
da beneficios. Esto convierte un pago rápido en un motivo para volver.

## 2. Problema

- El cliente espera: para pedir de nuevo, para pedir la cuenta, para que llegue
  la máquina POS, para recibir el vuelto.
- El mesero gasta la mayor parte de su tiempo en ir y volver tomando pedidos y
  cobrando, no en atender.
- El restaurante pierde rotación de mesa en los últimos 10–15 minutos, que son
  puro trámite de pago.
- El restaurante no sabe quién es su cliente frecuente: el efectivo y el POS no
  dejan identidad.

## 3. Objetivos y métricas de éxito

| Objetivo | Métrica | Meta MVP |
|---|---|---|
| Reducir el tiempo de cierre de mesa | Minutos entre "pedir cuenta" y mesa liberada | < 2 min (baseline ~12 min) |
| Que el pago ocurra en la app | % de cuentas pagadas en PAGAYA vs POS/efectivo | ≥ 50 % de las mesas con app |
| Aumentar el ticket promedio | Ticket promedio de mesas con app vs sin app | +8 % |
| Fidelizar | % de clientes con 2+ visitas en 60 días | ≥ 25 % |
| Capturar experiencia | % de cuentas con feedback enviado | ≥ 40 % |
| No romper la operación | Comandas con corrección manual del mesero | < 5 % |

## 4. Usuarios y roles

El sistema tiene **tres roles**, cada uno con su propia experiencia:

### 4.1 Cliente (app móvil / web)
Quien come. Se sienta en una mesa, se une a la comanda, pide, pide asistencia,
paga y opina. Acumula visitas y niveles.

### 4.2 Mesero (app móvil)
Ve solo **las mesas a su cargo**. Recibe notificaciones de productos agregados,
de llamados de asistencia y de pago completado. Entrega lo pedido, marca estados
y puede crear o corregir comandas en nombre de la mesa.

### 4.3 Administrador (panel web + app)
Configura el local: carta, precios, disponibilidad, mesas, zonas, meseros y
asignaciones, reglas de niveles y beneficios, medios de pago. Ve el salón en
vivo, las ventas del día, el feedback recibido y los reportes.

> Fuera de alcance del MVP: rol de cocina/barra con pantalla propia (KDS). Ver
> §13.

## 5. Alcance

### 5.1 Dentro del MVP
- Ingreso del cliente a la mesa por QR y comanda compartida por mesa.
- Carta digital con categorías, precios, disponibilidad y notas del producto.
- Pedido incremental desde la app del cliente, con notificación al mesero.
- Botón "Llamar al mesero" (asistencia presencial).
- Vista de mesas a cargo para el mesero, con lo que pidió cada mesa.
- Pago digital total de la cuenta desde la app del cliente.
- Notificación al mesero de "cliente completó pago".
- Feedback post-pago.
- Programa de niveles por cantidad de visitas.
- Panel de administración: carta, mesas, meseros, salón en vivo, ventas, feedback.

### 5.2 Fuera del MVP (candidatos a PRDs siguientes)
- División de cuenta entre comensales y propinas configurables.
- Pago en efectivo / POS registrado dentro de la app.
- Reservas, delivery y pedidos para llevar.
- Integración con POS o ERP del restaurante y facturación electrónica.
- KDS de cocina y barra, y tiempos de preparación.
- Multi-local con administración centralizada.
- Promociones y cupones más allá de los beneficios por nivel.
- Inventario y descuento de stock.

## 6. Flujo principal (end-to-end)

1. **Llegada y sentado.** El cliente se sienta. En la mesa hay un QR. Lo escanea
   y entra a la mesa: si no tiene cuenta, se registra (teléfono o email + OTP);
   si ya la tiene, entra directo. Al unirse queda **abierta la comanda de la
   mesa** y se registra la visita.
2. **Primer pedido.** El cliente pide por la carta. Los datos del pedido los
   toma la app y se genera la comanda dentro de PAGAYA. Alternativa operativa:
   el mesero toma el pedido en su app y queda en la misma comanda (ver §7.2 y la
   decisión abierta D-1).
3. **Pedidos adicionales.** El cliente quiere más comida o más tragos: los agrega
   desde la misma app. El mesero recibe la notificación
   *"Mesa 12 agregó productos"* y ve exactamente qué pidió.
4. **Entrega.** El mesero prepara/retira y lleva lo pedido, sin negociación ni
   fricción con el cliente. Marca los ítems como entregados.
5. **Asistencia.** El cliente necesita algo que no es un producto (servilletas,
   una consulta, cambiar algo). Toca **"Llamar al mesero"**. El mesero lo ve en
   su app y se dirige a la mesa.
6. **Pago.** El cliente quiere pagar: ve el detalle de la cuenta en su app y paga
   ahí mismo, sin POS ni efectivo.
7. **Cierre y feedback.** Al confirmarse el pago, el mesero recibe la última
   notificación de la mesa: **"Cliente completó pago"**, y va a preguntar cómo
   estuvo la experiencia. El cliente deja su feedback en la app, ve su visita
   acumulada y su nivel, y se va.
8. **Liberación.** La comanda queda cerrada y pagada; el mesero (o el sistema
   tras confirmar) libera la mesa para el siguiente turno.

## 7. Requisitos funcionales

### 7.1 Cliente

| ID | Requisito | Prioridad |
|---|---|---|
| RF-C-01 | Escanear QR de mesa y unirse a la comanda abierta de esa mesa. | Must |
| RF-C-02 | Registro e ingreso con teléfono o email y código OTP; sesión persistente. | Must |
| RF-C-03 | Ver la carta con categorías, foto, descripción, precio y disponibilidad. | Must |
| RF-C-04 | Armar pedido: cantidad, notas al ítem (ej. "sin cebolla") y opciones/variantes. | Must |
| RF-C-05 | Enviar el pedido a la mesa; una vez enviado no se edita ni cancela desde la app (solo el mesero puede corregir). | Must |
| RF-C-06 | Ver la comanda de la mesa en vivo: ítems, estado (enviado / en preparación / entregado), quién pidió cada ítem y total acumulado. | Must |
| RF-C-07 | Agregar productos a la comanda en cualquier momento mientras la mesa esté abierta. | Must |
| RF-C-08 | Botón "Llamar al mesero" con motivo opcional; muestra confirmación de que el mesero fue avisado y evita spam (1 llamado activo por mesa, cooldown configurable). | Must |
| RF-C-09 | Ver detalle de cuenta a pagar (subtotal, impuestos, beneficios por nivel aplicados, total). | Must |
| RF-C-10 | Pagar el total desde la app con medio de pago digital; recibir comprobante en la app. | Must |
| RF-C-11 | Dejar feedback post-pago: puntaje de comida, de atención, comentario libre opcional. | Must |
| RF-C-12 | Ver su perfil: visitas acumuladas, nivel actual, beneficios vigentes y cuánto falta para el siguiente nivel. | Must |
| RF-C-13 | Ver historial de visitas y cuentas pagadas. | Should |
| RF-C-14 | Varios clientes en la misma mesa comparten la misma comanda; cualquiera de ellos puede pagar el total. | Must |

### 7.2 Mesero

| ID | Requisito | Prioridad |
|---|---|---|
| RF-M-01 | Ver solo las mesas asignadas a él en el turno, con estado de cada una. | Must |
| RF-M-02 | Recibir notificación push cuando una mesa agrega productos, con el detalle de lo agregado. | Must |
| RF-M-03 | Recibir notificación push de llamado de asistencia, y poder marcarlo como atendido. | Must |
| RF-M-04 | Recibir notificación de "cliente completó pago" como última notificación de esa mesa. | Must |
| RF-M-05 | Ver, por mesa, qué quiere cada cliente: lista de ítems pendientes de entrega ordenados por antigüedad. | Must |
| RF-M-06 | Marcar ítems como entregados (individual o todo el lote). | Must |
| RF-M-07 | Crear o agregar ítems a la comanda en nombre de la mesa (cliente sin app, pedido verbal). | Must |
| RF-M-08 | Corregir la comanda: quitar un ítem o cambiar cantidad, con motivo registrado. | Must |
| RF-M-09 | Abrir mesa manualmente y cerrar/liberar mesa tras el pago. | Must |
| RF-M-10 | Ver el estado de pago de cada mesa (pendiente / pagado) y el total. | Must |
| RF-M-11 | Ver el feedback dejado por sus mesas del turno. | Should |
| RF-M-12 | Marcar un producto como agotado desde su app (propaga a la carta del cliente). | Should |

### 7.3 Administrador

| ID | Requisito | Prioridad |
|---|---|---|
| RF-A-01 | Gestionar la carta: categorías, productos, precios, fotos, variantes, disponibilidad. | Must |
| RF-A-02 | Gestionar mesas y zonas, y generar/imprimir los QR por mesa. | Must |
| RF-A-03 | Gestionar usuarios del local y roles (mesero, administrador). | Must |
| RF-A-04 | Asignar mesas a meseros por turno y reasignar en caliente. | Must |
| RF-A-05 | Ver el salón en vivo: mesas abiertas, tiempo de ocupación, consumo, llamados pendientes, mesas pagadas sin liberar. | Must |
| RF-A-06 | Ver ventas del día y por período: total, por mesero, por producto, ticket promedio. | Must |
| RF-A-07 | Configurar el programa de niveles: cantidad de visitas por nivel y beneficio de cada nivel. | Must |
| RF-A-08 | Ver el feedback recibido, filtrable por fecha, mesero y puntaje. | Must |
| RF-A-09 | Configurar medios de pago, impuestos y datos del local. | Must |
| RF-A-10 | Ver el historial de correcciones de comanda y anulaciones (auditoría). | Should |
| RF-A-11 | Exportar ventas y feedback a CSV. | Could |

## 8. Programa de niveles por visita

El cliente escala según **cuántas veces visitó el lugar y se sentó**.

- **Qué cuenta como visita:** una comanda de mesa **cerrada y pagada** en la que
  el cliente participó. Máximo **una visita por día por local**, para evitar
  inflado. Una comanda sin pago (mesa abandonada, anulada) no cuenta.
- **Niveles base (configurables por el administrador):**

| Nivel | Visitas | Beneficio sugerido |
|---|---|---|
| Nuevo | 1 | Acceso a pedido y pago desde la app |
| Frecuente | 3 | Bebida o entrada de bienvenida |
| Fiel | 8 | 10 % de descuento en la cuenta |
| Embajador | 15 | 15 % de descuento + prioridad de atención visible para el mesero |

- Los niveles y las visitas son **por local** en el MVP (no hay acumulación
  entre restaurantes distintos).
- El beneficio se aplica automáticamente al calcular la cuenta y se muestra
  desglosado antes de pagar.
- No hay pérdida de nivel por inactividad en el MVP.
- El mesero ve el nivel de la mesa en su app, para reconocer al cliente frecuente.

## 9. Notificaciones

Las notificaciones son el canal operativo entre cliente y mesero. Todas llegan
al mesero asignado a la mesa; si no hay asignación o no confirma en X minutos
(configurable), escalan al administrador de turno.

| Evento | Destinatario | Contenido | Urgencia |
|---|---|---|---|
| Mesa agregó productos | Mesero de la mesa | Mesa + ítems agregados | Alta |
| Llamado de asistencia | Mesero de la mesa | Mesa + motivo opcional | Muy alta |
| Cliente completó pago | Mesero de la mesa | Mesa + total pagado | Alta |
| Pago fallido / rechazado | Cliente (y mesero si persiste) | Motivo y reintento | Alta |
| Producto agotado en un pedido enviado | Cliente | Ítem no disponible, ajuste de comanda | Media |
| Mesa pagada sin liberar hace > N min | Administrador | Mesa | Baja |
| Llamado sin atender hace > N min | Administrador | Mesa | Alta |

Cada notificación push tiene su equivalente **en vivo dentro de la app** (la
lista de mesas del mesero se actualiza sola): el push es un aviso, no la única
vía de enterarse.

## 10. Pagos

- Pago **digital del total de la cuenta** desde la app del cliente: tarjeta de
  crédito/débito y billetera digital, según lo que habilite la pasarela elegida.
- El cliente puede guardar su medio de pago tokenizado para visitas siguientes.
- PAGAYA **no almacena datos de tarjeta**: la captura la hace la pasarela
  (checkout o SDK), y el sistema guarda solo el token y el identificador de la
  transacción.
- Flujo de estados de pago: `pendiente → autorizando → pagado` o
  `rechazado → reintento`. El pago se considera efectivo únicamente con la
  **confirmación del webhook** de la pasarela, no con la respuesta del cliente.
- Idempotencia obligatoria: una comanda no puede cobrarse dos veces aunque el
  cliente toque pagar varias veces o se corte la red.
- Si la comanda cambia mientras el pago está en curso, el pago se rechaza y se
  recalcula la cuenta (la comanda se congela al iniciar el cobro).
- Si el pago digital falla de forma definitiva, la mesa queda en
  `pago_pendiente` y el mesero cobra por la vía tradicional y lo marca como
  cobrado fuera de app (registro manual, sin conciliación automática en el MVP).
- Reembolsos y anulaciones: en el MVP se resuelven desde el panel de la
  pasarela; el administrador solo deja constancia en PAGAYA.
- Propinas y división de cuenta quedan fuera del MVP (§5.2).

## 11. Feedback

- Se solicita al cliente inmediatamente después del pago confirmado, en la misma
  pantalla de comprobante.
- Campos: puntaje de comida (1–5), puntaje de atención (1–5), comentario libre
  opcional. Todo el feedback es opcional y omitible.
- El feedback queda asociado a la comanda, la mesa, el mesero del turno y el
  cliente, para poder medir por mesero y por producto pedido.
- El mesero ve que la mesa dejó feedback, pero el comentario libre se muestra
  sin exponer al cliente como conflicto: el detalle crudo lo ve el
  administrador (decisión abierta D-5).

## 12. Modelo de datos (entidades principales)

- **Local (restaurante):** datos, impuestos, medios de pago, configuración de
  niveles.
- **Usuario:** identidad, teléfono/email, rol (`cliente` | `mesero` | `admin`),
  local al que pertenece (meseros y admin).
- **Mesa:** número, zona, QR, estado (`libre` | `ocupada` | `pago_pendiente` |
  `pagada` | `bloqueada`).
- **Asignación de mesas:** mesero ↔ mesas ↔ turno.
- **Producto:** categoría, nombre, descripción, foto, precio, variantes,
  disponible sí/no.
- **Comanda (cuenta de mesa):** mesa, local, apertura, cierre, estado
  (`abierta` | `cobrando` | `pagada` | `anulada`), total.
- **Participante de comanda:** cliente ↔ comanda (quién está sentado).
- **Ítem de comanda:** producto, cantidad, notas, precio al momento del pedido,
  quién lo pidió, estado (`enviado` | `en_preparacion` | `entregado` |
  `anulado`), timestamps.
- **Llamado de asistencia:** comanda, mesa, motivo, estado (`pendiente` |
  `atendido`), mesero que atendió, timestamps.
- **Pago:** comanda, monto, medio, estado, id de transacción de la pasarela,
  timestamps.
- **Visita:** cliente, local, comanda, fecha (una por día por local).
- **Nivel y beneficio:** definición por local; nivel vigente calculado por
  visitas.
- **Feedback:** comanda, cliente, puntajes, comentario, mesero del turno.
- **Registro de auditoría:** quién anuló o corrigió qué, cuándo y por qué.

## 13. Consideraciones técnicas

- **Clientes:** app móvil para cliente y mesero; panel web para administrador.
  El cliente debe poder operar **sin instalar nada** (web app desde el QR) para
  no perder la primera visita; el mesero usa app instalada con push.
- **Tiempo real:** la comanda, la lista de mesas del mesero y el salón del
  administrador se actualizan en vivo (websocket o equivalente), con
  reconexión y refresco por polling como respaldo.
- **Offline y red inestable:** el pedido del cliente se envía con idempotencia y
  reintento; el mesero debe poder ver la última comanda conocida sin conexión.
- **Multi-tenant desde el día uno:** todos los datos aislados por local, aunque
  el MVP opere con un local piloto.
- **Zona horaria y turnos** por local, porque "visita del día" y "ventas del
  día" dependen de eso.
- **Sin KDS:** en el MVP los ítems los ve el mesero y él los transmite a cocina
  o barra por el medio actual del local.

## 14. Requisitos no funcionales

- **Latencia percibida:** un pedido enviado o un llamado de asistencia debe
  aparecer en la app del mesero en < 3 s en condiciones normales.
- **Disponibilidad en servicio:** > 99,5 % en horario de operación; una caída no
  debe impedir cobrar (el local siempre puede caer al cobro tradicional).
- **Seguridad:** OTP con expiración y límite de intentos; sesiones por rol;
  acceso a la comanda limitado a la mesa y al personal del local; datos de pago
  solo en la pasarela; cifrado en tránsito y en reposo.
- **Privacidad:** el mesero ve nombre de pila y nivel del cliente, no sus datos
  de contacto ni su historial de otras visitas.
- **Auditoría:** toda anulación, corrección y pago queda registrada con actor y
  timestamp.
- **Accesibilidad y desempeño móvil:** la carta debe ser usable en gama baja y
  con conexión pobre; textos legibles, contraste suficiente, imágenes livianas.
- **Idioma:** español en el MVP, con la app preparada para más idiomas.

## 15. Estados de mesa y comanda

```
Mesa:    libre → ocupada → pago_pendiente → pagada → libre
                     ↑____________ (comanda anulada) ____|

Comanda: abierta → cobrando → pagada
              └→ anulada (por admin/mesero, con motivo)

Ítem:    enviado → en_preparacion → entregado
              └→ anulado (con motivo, por mesero o admin)

Llamado: pendiente → atendido
```

## 16. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El cliente se va sin pagar ("mesa fugada") | El mesero ve el estado de pago en vivo; la mesa no se libera hasta pago confirmado o cobro manual registrado; alerta al admin por mesa abierta sin actividad. |
| Alguien escanea el QR de una mesa que no ocupa | Vincular el ingreso a la apertura de mesa vigente y expirar el acceso al cerrarse; el mesero confirma la mesa ocupada (decisión abierta D-2). |
| Pedidos duplicados por mala red | Idempotencia por pedido y confirmación visible en la app del cliente. |
| El mesero no ve la notificación | Redundancia: push + lista en vivo + escalamiento al admin si no se atiende. |
| Resistencia del personal (miedo a perder propina o control) | Posicionar al mesero como quien atiende, no como quien tramita; el nivel del cliente y el feedback por mesero refuerzan su rol. Propinas en PRD posterior. |
| El cliente no quiere instalar una app | Web app desde el QR, sin instalación. |
| Pasarela caída en hora punta | Cobro tradicional siempre disponible con registro manual. |

## 17. Decisiones abiertas

| ID | Decisión | Impacto |
|---|---|---|
| D-1 | ¿El primer pedido lo toma siempre el cliente por la app, o el mesero puede tomarlo y el cliente se une después? Supuesto del PRD: ambos caminos existen y confluyen en la misma comanda. | Flujo principal, app del mesero |
| D-2 | ¿Cómo se valida que quien escanea el QR está realmente en esa mesa (código rotativo, confirmación del mesero, PIN de mesa)? | Seguridad, fricción de ingreso |
| D-3 | País y pasarela de pago (define medios disponibles, comisiones y requisitos de facturación). | Pagos, legal |
| D-4 | ¿El beneficio por nivel es descuento sobre la cuenta o producto de regalo? ¿Quién absorbe el costo? | Niveles, márgenes |
| D-5 | ¿El mesero ve el comentario libre del feedback o solo el administrador? | Feedback, cultura interna |
| D-6 | ¿La visita cuenta por comanda pagada o también por sentarse sin consumir? Supuesto del PRD: solo comanda pagada. | Niveles |
| D-7 | ¿Se exige registro para pedir, o se permite pedir como invitado y registrarse al pagar? | Conversión, fidelización |

## 18. Roadmap por fases

- **Fase 1 — Núcleo de mesa:** QR, ingreso, carta, comanda en vivo, pedido
  incremental, notificaciones al mesero, vista de mesas del mesero, entrega.
- **Fase 2 — Cierre sin fricción:** cálculo de cuenta, pago digital, webhook,
  notificación de pago completado, feedback, liberación de mesa.
- **Fase 3 — Fidelización:** visitas, niveles, beneficios aplicados a la cuenta,
  perfil del cliente, nivel visible para el mesero.
- **Fase 4 — Administración:** panel de carta, mesas, meseros y asignaciones,
  salón en vivo, ventas, feedback, auditoría.
- **Fase 5 — Piloto:** un local real en operación, medición de las métricas de §3
  y ajustes vía PRDs nuevos.

## 19. Criterios de aceptación del MVP

El MVP está listo cuando, en un local piloto y sin intervención del equipo de
producto:

1. Un cliente escanea, se registra, pide, recibe, agrega productos, llama al
   mesero, paga en la app y deja feedback en una sola sesión de mesa.
2. El mesero ejecuta todo el servicio desde su app y recibe las tres
   notificaciones clave: productos agregados, llamado de asistencia y pago
   completado.
3. Un cliente que vuelve tres veces sube de nivel y ve su beneficio aplicado en
   la cuenta antes de pagar.
4. El administrador puede cambiar la carta, asignar mesas y ver ventas y
   feedback del día.
5. Ninguna cuenta se cobra dos veces y ninguna mesa se libera sin pago
   confirmado o cobro manual registrado.
