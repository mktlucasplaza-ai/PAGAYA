# PRD-006 — El descuento por nivel se aplica por presencia, no por quien paga

| | |
|---|---|
| **Versión** | 006 |
| **Estado** | Vigente |
| **Fecha** | 2026-10-04 |
| **Reemplaza a** | PRD-005 (en las secciones indicadas; también modifica PRD-002 y PRD-003) |

---

## 0. Cambios en esta versión

**Motivo del cambio:** al escribir la arquitectura técnica
(`docs/arquitectura.md`, supuesto S-1) apareció una **contradicción entre PRDs
vigentes** sobre a quién se le aplica el descuento por nivel cuando en la mesa
hay varias personas y paga una que no es la del nivel:

- PRD-002 §2.2 define `descuento_nivel = consumo × % del nivel vigente del
  cliente que paga`.
- PRD-003 §5 y PRD-005 §3 condicionan el descuento a que exista *"un
  participante con `beneficio_activo`"*, es decir, **presente**, pague o no.
- RF-C-14, acotado por PRD-004 §4, permite que **cualquier comensal con cuenta**
  pague el total.

Las tres reglas no pueden cumplirse a la vez. Se registra como **D-12** y se
cierra en este PRD con dos reglas: **el descuento se aplica por presencia**, y
**hay un solo descuento por comanda** (los niveles no se suman).

### Se agregó
- **D-12** — ¿el descuento por nivel sigue a quien paga o a quien está sentado?
  Registrada y **cerrada** (§2).
- **D-13** — mecánica de los beneficios de producto (bebida o entrada de
  bienvenida): abierta (§3 y §9).
- **§2 Regla del beneficiario:** un solo descuento por comanda, el del mayor
  porcentaje entre los participantes con beneficio activo, elegido al congelar
  la comanda para el cobro; máximo un descuento por cliente por día por local.
- **RF-C-28** — el detalle de la cuenta muestra a nombre de quién se aplica el
  descuento (solo nombre de pila, solo a los participantes de esa comanda).
- **RF-A-17** — reporte de descuentos otorgados: monto, por nivel, por
  beneficiario, costo sobre ventas, y cuántas veces el beneficiario no fue quien
  pagó.
- **§7 Métricas:** costo del descuento sobre ventas y tasa "beneficiario ≠
  pagador".

### Se modificó
- **PRD-002 §2.2 (fórmula)** — antes: `% del nivel vigente del cliente que
  paga`. Ahora: `% del nivel del beneficiario` según §2, con tope opcional. El
  resto de la fórmula no cambia: la propina se calcula sobre el consumo menos el
  descuento **efectivamente aplicado**.
- **PRD-002 §4.1 / §4.2** — el descuento es **por comanda**; los beneficios de
  producto son **personales** (§3). Umbrales y porcentajes siguen configurables
  (RF-A-07).
- **RF-A-07** — agrega un **tope opcional de descuento por comanda** en pesos,
  configurable por el local; por defecto sin tope (§4).
- **PRD-003 §5 (modelo de datos, entidad Pago)** — la invariante se mantiene y
  se le agregan los campos que la hacen auditable: `beneficiario_id`,
  `nivel_aplicado`, `porcentaje_aplicado`, `monto_descuento_calculado` y
  `pagador_id`, congelados como instantánea (§6).
- **RF-A-15** — **se amplía**, no se reemplaza: a la vía de ingreso de cada
  comensal (PRD-003) se suma quién fue el beneficiario y quién pagó.
- **PRD-003 §3.5 (matriz de abuso)** — agrega el caso "un mismo cliente descuenta
  varias comandas el mismo día" y su cierre (§2, regla 7).
- **Supuesto S-1 de `docs/arquitectura.md`** — deja de ser supuesto: queda
  resuelto por este PRD con la lectura que proponía.

### Se eliminó
- Nada. **RF-C-14 se mantiene como lo acotó PRD-004 §4:** cualquier comensal
  **con cuenta** puede pagar el total; el comensal sin cuenta sigue sin poder
  pagar desde la app.

**Sin cambios:** todo lo no mencionado sigue vigente según los PRD-001 a 005 —
las reglas de seguridad del PAGAYA ID (el beneficio exige sesión activa del
beneficiario), el rechazo y recálculo del pago si la comanda cambia durante el
cobro (PRD-001 §10), registro obligatorio para pedir, visitas por persona (comanda
pagada, máximo una por día por local, con feedback cuando corresponde según
PRD-002 §4.3), propinas, medios de pago, PIN de mesa y gates de piloto.

---

## 1. Contexto

El programa de niveles premia **sentarse**: la visita se gana con la sesión
activa en una comanda pagada (PRD-001 §8, PRD-003 §3.2, PRD-005 §3), y el
reconocimiento del mesero ocurre al sentar al cliente, no al cobrarle. Atar el
descuento a *quien paga* rompía esa lógica: Camila, nivel Fiel, perdería su
beneficio la noche que invita a Tomás y él insiste en pagar — y el grupo
aprendería a hacer pagar siempre al del nivel, que es un juego, no fidelidad.

La lectura por presencia también tiene un costo: el local descuenta la cuenta
entera de una mesa de seis por un solo cliente fiel. Se acepta a conciencia y se
le ponen tres controles: el porcentaje por nivel (ya configurable), un tope
opcional por comanda (§4) y un máximo de un descuento por cliente por día (§2).
Los dos primeros son decisión del local; el tercero es del sistema.

## 2. Regla del beneficiario (cierra D-12)

1. **Un solo descuento por comanda.** Los porcentajes de distintos participantes
   no se suman ni se promedian. Es parte de la decisión D-12, no una
   consecuencia técnica.
2. **Candidato a beneficiario** es todo participante de la comanda con
   `beneficio_activo = true` (PRD-003 §3.2) **y porcentaje de descuento mayor
   que cero** en su nivel. Un participante de nivel Nuevo o Frecuente tiene
   beneficio activo pero no es candidato al descuento.
3. **El beneficiario es el candidato de mayor porcentaje.** Se compara el
   porcentaje configurado del nivel, no el nombre del nivel: los porcentajes
   son configurables (RF-A-07) y son lo que determina el monto. Empate: el que
   activó antes su beneficio en esta comanda.
4. **Se decide al congelar la comanda para el cobro** (PRD-001 §10, PRD-002
   §5.4): beneficiario, nivel, porcentaje y monto se guardan en el pago como
   instantánea. Lo que cambie después de `pagada` no modifica un cobro hecho.
5. **Si el beneficiario deja la comanda antes de iniciar el cobro** (hoy solo
   posible mediante "No es mi mesa", RF-C-21; quien entró por QR + PIN permanece
   hasta que cierre la sesión de mesa, PRD-002 §3.4), se recalcula con los
   candidatos que queden; si no queda ninguno, no hay descuento. La vista previa
   (RF-C-17) lo muestra en vivo.
6. **Si el beneficiario deja la comanda mientras está `cobrando`**, aplica
   PRD-001 §10 tal cual: la comanda cambió durante el cobro, el intento se
   rechaza y la cuenta se recalcula. No hay excepción para el descuento.
7. **Máximo un descuento por cliente por día por local**, el mismo tope que
   tiene la visita (PRD-001 §8). Un cliente que ya fue beneficiario de una
   comanda pagada hoy no es candidato en otra comanda del mismo día en el mismo
   local. Se agrega a la matriz de abuso de PRD-003 §3.5.
8. **Pague quien pague**, entre quienes pueden pagar (RF-C-14 según PRD-004 §4).
   El pagador puede no ser el beneficiario, y el comprobante lo dice (RF-C-28).
9. **Cobro fuera de la app** (PRD-002 §5.4): el mesero marca "cobrado fuera de
   app" **sobre la cuenta que el sistema calculó**, con el mismo beneficiario y
   la misma instantánea; no existe descuento manual ni ajuste del monto. El
   `pagador_id` queda nulo.

Ejemplo, con la escala de PRD-002 §4.2: mesa de seis, consumo $120.000. Camila
(Fiel, 10 %) y Tomás (Frecuente, 0 %) tienen sesión activa; los otros cuatro no
tienen cuenta. Candidata: solo Camila. Descuento: $12.000, uno solo. Paga Tomás
desde su app: el descuento se aplica igual y el comprobante dice *"Descuento
Fiel · a nombre de Camila"*.

## 3. Beneficios de producto (abre D-13)

El beneficio del nivel *Frecuente* (bebida o entrada de bienvenida, PRD-002
§4.2) **no es un descuento sobre la cuenta y no sigue la regla de §2**. Este
PRD fija una sola cosa: es **personal** — uno por participante con beneficio
activo cuyo nivel lo incluya — y no se transfiere ni se acumula a nivel de mesa.

Todo lo demás queda como **D-13**: si los niveles superiores conservan el
beneficio de *Frecuente*, cómo se carga a la comanda, cómo se registra su costo
real y qué pasa con una segunda comanda el mismo día. No se resuelve aquí para
no decidirlo a medias.

## 4. Controles del local

- **RF-A-07 (mod.):** además de umbrales y porcentajes, el administrador puede
  fijar un **tope en pesos del descuento por comanda**. Por defecto no hay tope.
- **Qué ve el cliente cuando aplica el tope:** la etiqueta del nivel y el monto
  efectivamente descontado (*"Descuento Fiel −$5.000"*). El tope no se explica
  al cliente; es una decisión de este PRD, no una omisión.
- **Qué guarda el sistema:** `porcentaje_aplicado` es el nominal del nivel;
  `monto_descuento_calculado` es el monto antes del tope; `monto_descuento` el
  efectivamente aplicado. La propina se calcula sobre `consumo −
  monto_descuento`.
- El local ve cuánto le cuesta el programa (RF-A-17) antes de ajustar
  porcentajes o tope. La decisión es suya; el sistema solo la hace visible.

## 5. Requisitos

| ID | Requisito | Prioridad |
|---|---|---|
| RF-C-28 | El detalle de la cuenta y el comprobante muestran el descuento con el **nombre de pila** del beneficiario, visible solo para los participantes de esa comanda (*"Descuento Fiel · a nombre de Camila"*). | Must |
| RF-C-17 (conf.) | El desglose se recalcula en vivo cuando cambia el beneficiario (entra, sale o activa su beneficio). | Must |
| RF-A-07 (mod.) | Configurar, por local, umbrales por nivel, porcentaje por nivel y tope opcional de descuento por comanda. | Must |
| RF-A-15 (mod.) | La auditoría de cada comanda con descuento muestra, además de la vía de ingreso de cada comensal, quién fue el beneficiario y quién pagó. | Must |
| RF-A-17 | Reporte de descuentos por período: monto calculado y aplicado, por nivel, por beneficiario, costo sobre ventas, y tasa de comandas donde el beneficiario no fue quien pagó. | Should |

Decisión de exposición (RF-C-28): mostrar el nombre de pila del beneficiario a
su propia mesa es la misma contención que ya ve el mesero (PRD-003 §3.4) y no
agrega datos personales nuevos al sistema (PRD-004 §5); se registra aquí como
decisión y no como supuesto.

## 6. Impacto en el modelo de datos

- **Pago:** agrega `beneficiario_id` (participante, nulo si no hubo descuento),
  `nivel_aplicado`, `porcentaje_aplicado` (nominal), `monto_descuento_calculado`
  (antes del tope) y `pagador_id` (participante; nulo en cobro fuera de la app).
  Todos congelados con la comanda. La invariante de PRD-003 §5 se expresa sobre
  `beneficiario_id`: `monto_descuento > 0` **solo si** `beneficiario_id` apunta a
  un participante que era candidato al congelar. Sigue siendo invariante del
  cálculo, no validación de interfaz.
- **Participante de comanda:** agrega `beneficio_activado_en` (timestamp), para
  el desempate de §2.3.
- **Configuración del local:** agrega `tope_descuento_comanda` (pesos, opcional).
- **Visita:** sin cambios.

## 7. Métricas de éxito del cambio

| Métrica | Meta | Por qué |
|---|---|---|
| Costo del descuento / ventas de mesas con app | ≤ 4 % | Es lo que el local paga por el programa; si se dispara, se ajusta % o tope |
| Comandas con descuento donde beneficiario ≠ pagador | Se mide; sin meta | Dice cuánto importaba D-12. Si es ~0 %, era teórica; si es alta, el tope pasa a ser relevante |
| Comandas con más de un candidato | Se mide | Mide cuánto "se pierde" por no sumar porcentajes, para una conversación futura con datos |
| Intentos de cobro rechazados por cambio de beneficiario durante el cobro | < 1 % de los cobros | Si sube, hay un problema de interfaz en RF-C-21, no en la regla |

## 8. Criterios de aceptación

1. Mesa con dos candidatos de distinto porcentaje: se aplica solo el mayor, una
   vez, y el pago registra a ese participante como beneficiario.
2. Paga un comensal **con cuenta** que no es el beneficiario: el descuento se
   aplica y el comprobante nombra al beneficiario.
3. El beneficiario toca "No es mi mesa" antes del cobro: la vista previa pierde
   el descuento en vivo; si había otro candidato, pasa a ese.
4. El beneficiario toca "No es mi mesa" con la comanda en `cobrando`: el intento
   se rechaza y la cuenta se recalcula sin su descuento (PRD-001 §10).
5. Dos participantes *Frecuente* y ninguno de nivel superior: ningún descuento
   sobre la cuenta; cada uno conserva su beneficio personal.
6. Con tope de $5.000 y descuento calculado de $12.000: se cobra con $5.000 de
   descuento, el comprobante muestra −$5.000 sin explicar el tope, y el reporte
   muestra ambos montos.
7. Un cliente que ya fue beneficiario en una comanda pagada hoy no obtiene
   descuento en una segunda comanda del mismo día en el mismo local.
8. Un pago con `monto_descuento > 0` y `beneficiario_id` nulo, o apuntando a un
   participante que no era candidato al congelar, es imposible de generar y el
   intento queda en auditoría.
9. Cobro fuera de la app: el monto registrado es el calculado por el sistema,
   con el mismo beneficiario; no se puede ingresar otro monto.

## 9. Decisiones abiertas

**Gate de piloto:** G-1 (propina, legal), G-4 (datos personales, legal), G-2
(pasarelas), G-3 (PIN).

**Decisiones de producto pendientes:**

| ID | Decisión | Impacto |
|---|---|---|
| D-6 | ¿Qué cuenta como visita? Supuesto vigente: comanda pagada, máx. una por día por local. | Niveles |
| D-9 | ¿Puede el administrador compartir con el mesero un comentario marcado "solo administración"? | Feedback, cultura interna |
| **D-13** | Mecánica de los beneficios de producto: ¿los niveles superiores conservan la bebida de bienvenida? ¿Cómo se carga a la comanda y cómo se registra su costo real? ¿Qué pasa con una segunda comanda el mismo día? | Niveles, reportes, app del mesero |

**Cerradas en este PRD:** D-12.
