# PRD-005 — El mesero también puede tomar el primer pedido

| | |
|---|---|
| **Versión** | 005 |
| **Estado** | Vigente |
| **Fecha** | 2026-09-26 |
| **Reemplaza a** | PRD-004 (en las secciones indicadas) |

---

## 0. Cambios en esta versión

**Motivo del cambio:** cerrar **D-1**. Se decide que el primer pedido de la mesa
lo puede tomar **el cliente desde la app o el mesero desde la suya**, y ambos
caminos confluyen en la misma comanda. El PRD-004 §4 ya dejó como camino
permanente que el mesero tome el pedido del comensal sin cuenta: en la práctica
el mesero ya toma pedidos, incluido el primero de una mesa donde nadie usa la
app. Prohibirle tomar el primero cuando sí hay clientes registrados sería una
regla que el local no puede cumplir y el sistema no gana nada con imponer.

### Se agregó
- **§2 Los dos caminos de apertura:** mesa abierta por el cliente (QR + PIN) o por
  el mesero (apertura manual + pedido), con el mismo resultado.
- **§3 Qué no cambia para el cliente registrado:** visitas, nivel y descuento no
  dependen de quién tomó el pedido.
- **§4 El costo para el registro:** el muro de PRD-004 §2.1 deja de ser el único
  momento en que se capta al cliente nuevo; se mide.
- **RF-M-17, RF-C-27** (§5).

### Se modificó
- **§6 del PRD-001 (flujo principal), pasos 1 y 2** — antes: el cliente escanea y
  abre la comanda; el pedido del mesero era una "alternativa operativa" sujeta a
  D-1. Ahora: la mesa la abre el primero que llegue a ella, cliente o mesero, y el
  primer pedido puede venir de cualquiera de los dos (§2).
- **RF-M-07** — antes (PRD-004): "el mesero toma el pedido de comensales sin
  cuenta". Ahora: el mesero puede cargar ítems a la comanda **en cualquier
  momento y para cualquier comensal**, tenga o no cuenta, incluido el primer
  pedido de la mesa.
- **RF-M-02** — el mesero no recibe notificación de "Mesa X agregó productos" por
  ítems que cargó él mismo.
- **RF-A-16 (embudo de registro)** — agrega el origen del primer pedido de cada
  mesa (app / mesero) (§4).
- **Decisión D-1** — **cerrada**.

### Se eliminó
- Nada.

**Sin cambios:** todo lo no mencionado sigue vigente según los PRD-001 a 004 —
registro obligatorio para pedir **desde la app**, PIN de mesa, PAGAYA ID y sus
reglas de seguridad, propinas, medios de pago, escala de niveles, exención de
feedback y gates de piloto.

---

## 1. Contexto

D-1 venía abierta desde el PRD-001 con un supuesto que nunca se contradijo:
ambos caminos existen. El PRD-004 lo volvió inevitable al confirmar RF-M-07 como
permanente. Lo que faltaba no era la decisión, sino escribir sus consecuencias:
cómo se abre la mesa cuando nadie escaneó, qué ve el cliente que llega después y
qué le pasa al registro cuando el mesero se adelanta.

La realidad del salón manda: el cliente que se sienta y le dice al mesero "un
pisco sour mientras vemos la carta" no va a sacar el teléfono primero. Hacerlo
esperar sería exactamente la fricción que PAGAYA existe para eliminar.

## 2. Los dos caminos de apertura

```
Camino A — cliente primero          Camino B — mesero primero
─────────────────────────           ─────────────────────────
Cliente escanea QR + PIN            Mesero abre la mesa (RF-M-09)
        ↓                                   ↓
Sesión de mesa abierta              Sesión de mesa abierta, PIN vigente
        ↓                                   ↓
Pedido desde la app                 Mesero carga el primer pedido
(con registro, PRD-004 §2.1)                ↓
        ↓                           Clientes se unen después por
        └──────────────┬────────────  QR + PIN o QR personal
                       ↓
           Una sola comanda de mesa
```

- La mesa se abre **una sola vez**, por quien llegue primero. Si el cliente
  escanea una mesa que el mesero ya abrió, se une a esa comanda con el PIN
  vigente; nunca se crea una segunda comanda para la misma mesa.
- Si el mesero intenta abrir una mesa que un cliente ya abrió, su app lo lleva a
  la comanda existente.
- Los ítems cargados por el mesero aparecen en la comanda en vivo como
  **"Cargado por el mesero"**, en la misma lista que los del resto de la mesa. El
  mesero puede asociarlos a un comensal ya presente en la comanda, pero no es
  obligatorio.
- Sentar por PAGAYA ID (PRD-002 §3.2, PRD-003 §3) funciona igual en los dos
  caminos: el mesero puede abrir la mesa, tomar el pedido y sentar al cliente
  frecuente en cualquier orden.

## 3. Qué no cambia para el cliente registrado

El programa de niveles depende de **la presencia del cliente en la comanda**, no
de quién tomó el pedido:

- **Visita:** acumula si el cliente tuvo sesión activa en la comanda, la comanda
  se pagó y, si corresponde, entregó feedback (PRD-001 §8, PRD-002 §4.3, PRD-003
  §3.2). Que todos los ítems los haya cargado el mesero no cambia nada.
- **Descuento:** se calcula sobre el consumo de toda la comanda
  (PRD-002 §2.2), con la misma invariante de PRD-003 §5: requiere un participante
  con `beneficio_activo`. Un pedido cargado por el mesero no activa ni desactiva
  beneficios.
- **Pago:** cualquier comensal con cuenta paga el total desde la app, igual que
  antes.

El pedido cargado por el mesero **nunca es una vía para activar un beneficio**:
activa consumo, no identidad.

## 4. El costo para el registro

El PRD-004 puso el muro de registro en "Enviar pedido" porque es el momento de
mayor motivación del cliente. Si el mesero toma el primer pedido, el cliente
nuevo **no pasa por ese momento**: su próxima razón para registrarse es ver la
comanda, pedir la segunda ronda desde el teléfono o pagar en la app. La última
es, según el propio PRD-004 §1, el peor momento para pedirle datos a alguien.

Se acepta a conciencia, por dos razones:

1. La alternativa —que el mesero se niegue a tomar el primer pedido— no es
   operable en un local real y dañaría la experiencia que el producto promete.
2. El piso de adopción del PRD-004 §4 sigue intacto: basta con un comensal
   registrado para que la mesa entera tenga la experiencia PAGAYA.

Para que no sea un costo invisible, el embudo lo muestra (RF-A-16 mod.) y se
fija una regla de revisión (§7).

## 5. Requisitos

| ID | Requisito | Prioridad |
|---|---|---|
| RF-M-07 (mod.) | El mesero carga ítems a la comanda de una mesa a su cargo en cualquier momento, para cualquier comensal con o sin cuenta, incluido el primer pedido de la mesa. | Must |
| RF-M-17 | Desde "Abrir mesa", el mesero puede cargar el primer pedido en el mismo flujo, sin que ningún cliente se haya unido. Si la mesa ya está abierta, la app lo lleva a la comanda existente. | Must |
| RF-M-02 (mod.) | El mesero no recibe notificación de productos agregados por ítems que cargó él mismo. | Must |
| RF-C-27 | Al unirse a una mesa ya abierta, el cliente ve la comanda completa, con los ítems cargados por el mesero identificados como tales. | Must |
| RF-A-16 (mod.) | El embudo de registro distingue el origen del primer pedido de cada mesa (app / mesero) y cuántas mesas abiertas por el mesero terminan con al menos un comensal registrado. | Should |

## 6. Impacto en el modelo de datos

- **Comanda:** agrega `abierta_por` (`cliente` | `mesero`) y
  `origen_primer_pedido` (`app` | `mesero`).
- **Ítem de comanda:** el campo "quién lo pidió" (PRD-001 §12) admite
  `mesero` como origen, con referencia opcional al participante al que se asocia.
- **Mesa / Sesión de mesa:** sin cambios; la apertura por el mesero ya estaba
  prevista en PRD-002 §3.4. Se refuerza la invariante: **como máximo una comanda
  abierta por mesa**.

## 7. Métricas de éxito del cambio

| Métrica | Meta | Por qué |
|---|---|---|
| Mesas con primer pedido tomado por el mesero | Se mide, sin meta | Línea base para el piloto |
| Mesas abiertas por el mesero que terminan con ≥ 1 comensal registrado | ≥ 70 % | Si baja, el mesero se está volviendo el canal y la app el accesorio |
| Comandas duplicadas para una misma mesa | 0 | Invariante del §6 |

**Regla de revisión:** si en el piloto las mesas cuyo primer pedido tomó el
mesero terminan con ≥ 1 comensal registrado en menos del 50 % de los casos, se
abre un PRD nuevo para revisar cómo se capta al cliente en ese camino (por
ejemplo, qué le ofrece el mesero al tomar el pedido). No se reabre D-1: el mesero
seguirá pudiendo tomar el primer pedido.

## 8. Criterios de aceptación

1. Un mesero abre la Mesa 5 y carga dos ítems sin que ningún cliente haya
   escaneado; la comanda existe y el PIN de la mesa está vigente.
2. Un cliente escanea después la Mesa 5 con el PIN y ve esos dos ítems marcados
   como "Cargado por el mesero".
3. Un cliente escanea una mesa libre y, segundos después, el mesero intenta
   abrirla: su app lo lleva a la comanda ya abierta y no se crea una segunda.
4. El mesero no recibe notificación de "agregó productos" por los ítems que
   cargó él.
5. Un cliente nivel Fiel se une por QR personal a una mesa cuyos ítems cargó
   todos el mesero: el 10 % se aplica y la visita acumula.
6. El embudo del panel muestra, para el día, cuántas mesas tuvieron su primer
   pedido por app y cuántas por mesero.

## 9. Decisiones abiertas

**Gate de piloto:** G-1 (propina, legal), G-4 (datos personales, legal), G-2
(pasarelas), G-3 (PIN).

**Decisiones de producto pendientes:**

| ID | Decisión | Impacto |
|---|---|---|
| D-6 | ¿Qué cuenta como visita? Supuesto vigente: comanda pagada, máx. una por día por local. | Niveles |
| D-9 | ¿Puede el administrador compartir con el mesero un comentario marcado "solo administración"? | Feedback, cultura interna |
