# Backlog — Fase 1: núcleo de mesa

| | |
|---|---|
| **Fase** | 1 de [PRD-001 §18](../prds/PRD-001-pagaya-mvp.md) — QR, ingreso, carta, comanda en vivo, pedido incremental, notificaciones al mesero, vista de mesas del mesero y entrega |
| **Alcance según** | PRD-001 a PRD-005 (RF vigentes, con sus modificaciones aplicadas) |
| **Estimación** | Pendiente |
| **Fecha** | 2026-09-26 |

> Este backlog **no define alcance**: lo traduce a tareas. Si algo de aquí
> contradice un PRD, manda el PRD. Las tareas sin RF propio son habilitantes y
> citan la sección del PRD que las exige.

---

## E0 · Fundaciones

| ID | Tarea | RF / referencia | Depende de |
|---|---|---|---|
| F1-01 | Monorepo, CI y ambientes (dev, staging) | PRD-001 §13 | — |
| F1-02 | Modelo multi-tenant aislado por local, con zona horaria del local | PRD-001 §13 | F1-01 |
| F1-03 | Roles (cliente, mesero, admin) y sesiones; acceso a la comanda limitado a la mesa y al personal del local | PRD-001 §14 | F1-02 |
| F1-04 | Registro de auditoría append-only, escrito en la misma transacción que el cambio | PRD-001 §14; datos para RF-A-10 y RF-A-15 | F1-02 |
| F1-05 | Carga inicial del local piloto por script: carta, mesas, QR, meseros y asignaciones | Sustituye por ahora a RF-A-01 a 04 (Fase 4) | F1-02 |

## E1 · Mesa y sesión de mesa

| ID | Tarea | RF / referencia | Depende de |
|---|---|---|---|
| F1-10 | Mesa y sesión de mesa con sus estados; como máximo una comanda abierta por mesa | PRD-001 §15, PRD-002 §3.4, PRD-005 §6 | F1-02 |
| F1-11 | El QR de la mesa lleva al local y a la mesa correctos | RF-C-01 | F1-10 |
| F1-12 | PIN de mesa: generación, rotación por sesión (supuesto de G-3), límite de intentos por dispositivo y por mesa | RF-C-01 (mod.), PRD-002 §3.1 | F1-10 |
| F1-13 | Unirse a la mesa con QR + PIN **sin registro**; guardar `via_ingreso = PIN` | RF-C-01, RF-C-24; dato para RF-A-15 | F1-11, F1-12 |
| F1-14 | El mesero abre la mesa y carga el primer pedido en el mismo flujo; si la mesa ya está abierta, su app lo lleva a esa comanda | RF-M-09 (abrir), RF-M-17 | F1-10, F1-43 |
| F1-15 | Cierre de la sesión de mesa: expira el acceso de todos los dispositivos y rota el PIN. En Fase 1 lo dispara una anulación o un cierre manual; desde Fase 2, el pago | PRD-002 §3.4 | F1-12 |

## E2 · Identidad y registro

| ID | Tarea | RF / referencia | Depende de |
|---|---|---|---|
| F1-20 | OTP: canal configurable (SMS por defecto), expiración, límite de intentos, límite de envíos por número y por dispositivo | RF-C-02, PRD-004 §3 y §8, PRD-001 §14 | F1-03 |
| F1-21 | Registro con nombre de pila, teléfono y OTP; una cuenta por teléfono; sesión persistente sin contraseña; menos de 40 s en gama baja | RF-C-02 (mod.), RF-C-25 | F1-20 |
| F1-22 | Consentimiento informado con versión, sin casillas pre-marcadas (texto provisional hasta G-4) | RF-C-26 | F1-21 |
| F1-23 | Muro de registro en "Enviar pedido" que conserva el carro y envía el pedido al terminar el registro | RF-C-05 (mod.) | F1-21, F1-31 |

## E3 · Carta

| ID | Tarea | RF / referencia | Depende de |
|---|---|---|---|
| F1-30 | Carta para el cliente: categorías, foto, descripción, precio y disponibilidad; sin registro; liviana para gama baja y mala señal | RF-C-03 (mod.), RF-C-24, PRD-001 §14 | F1-05 |
| F1-31 | Armado del pedido: cantidad, notas y variantes; el carro sobrevive a recargas de la página | RF-C-04 | F1-30 |
| F1-32 | El mesero marca un producto como agotado, el cambio llega a la carta y se avisa al cliente si ya lo había pedido | RF-M-12 (Should), PRD-001 §9 | F1-30, F1-70 |

## E4 · Comanda y pedidos

| ID | Tarea | RF / referencia | Depende de |
|---|---|---|---|
| F1-40 | Envío del pedido con idempotencia y confirmación visible; el cliente no puede editarlo después | RF-C-05, PRD-001 §16 | F1-13, F1-23 |
| F1-41 | Comanda compartida en vivo: ítems, estado, quién pidió y consumo acumulado | RF-C-06, RF-C-14, RF-C-27 | F1-40, F1-70 |
| F1-42 | Pedido incremental mientras la mesa esté abierta | RF-C-07 | F1-40 |
| F1-43 | El mesero carga ítems para cualquier comensal, tenga cuenta o no; aparecen como "Cargado por el mesero", con asociación opcional a un participante | RF-M-07 (mod.), PRD-004 §4 | F1-10 |
| F1-44 | Corrección de la comanda por el mesero, con motivo y auditoría | RF-M-08 | F1-04, F1-40 |
| F1-45 | Estados del ítem: enviado → en preparación → entregado, o anulado | PRD-001 §15 | F1-40 |

## E5 · Asistencia

| ID | Tarea | RF / referencia | Depende de |
|---|---|---|---|
| F1-50 | "Llamar al mesero" sin registro, con motivo opcional, un llamado activo por mesa y cooldown configurable | RF-C-08, RF-C-24 | F1-13 |
| F1-51 | El mesero ve el llamado y lo marca como atendido | RF-M-03 | F1-50, F1-72 |

## E6 · App del mesero

| ID | Tarea | RF / referencia | Depende de |
|---|---|---|---|
| F1-60 | Mesas asignadas del turno, con el estado de cada una | RF-M-01 | F1-05, F1-10 |
| F1-61 | Ítems pendientes de entrega por mesa, ordenados por antigüedad | RF-M-05 | F1-41 |
| F1-62 | Marcar como entregado, de a uno o todo el lote | RF-M-06 | F1-45 |
| F1-63 | Última comanda conocida disponible sin conexión | PRD-001 §13 | F1-61 |
| F1-64 | El mesero ve solo el nombre de pila del cliente, nunca sus datos de contacto | PRD-001 §14, PRD-003 §3.4 | F1-60 |

## E7 · Notificaciones y tiempo real

| ID | Tarea | RF / referencia | Depende de |
|---|---|---|---|
| F1-70 | Base de tiempo real: outbox, WebSocket, versión de la comanda, reconexión con polling de respaldo; menos de 3 s | PRD-001 §13 y §14 | F1-02 |
| F1-71 | Push "Mesa X agregó productos" con el detalle, sin avisarle al mesero lo que cargó él mismo | RF-M-02 (mod.) | F1-70, F1-40 |
| F1-72 | Push del llamado de asistencia | RF-M-03 | F1-70, F1-50 |
| F1-73 | Escalar al administrador de turno si la mesa no tiene asignación o si el mesero no confirma en N minutos | PRD-001 §9 | F1-71, F1-72 |

## E8 · Instrumentación

| ID | Tarea | RF / referencia | Depende de |
|---|---|---|---|
| F1-80 | Eventos del embudo: ingreso a la mesa, registro iniciado, registro completado, pedido enviado, origen del primer pedido. El panel que los muestra llega en Fase 4 | Datos para RF-A-16 (mod.), PRD-004 §7, PRD-005 §7 | F1-13, F1-21, F1-40 |

---

## Cobertura

Todos los RF Must de Fase 1 tienen al menos una tarea:

- **Cliente:** RF-C-01 a 08, 14, 24 a 27.
- **Mesero:** RF-M-01, 02, 03, 05, 06, 07, 08, 09 (solo abrir) y 17. También el
  Should RF-M-12.

**Camino crítico:** F1-02 → F1-10 → F1-12/13 → F1-40 → F1-70 → F1-71. El
contrato con el proveedor de SMS (F1-20) depende de un tercero y conviene
gestionarlo desde el primer día.

## Fuera de Fase 1

- **Fase 2 (pago y cierre):** RF-C-09 a 11, RF-C-15 a 18, RF-M-04, RF-M-09
  (cerrar y liberar), RF-M-10, RF-M-11.
- **Fase 3 (fidelización):** RF-C-12, 13, 19 a 22 y RF-M-13 a 16: sentar por
  PAGAYA ID, QR personal y "No es mi mesa".
- **Fase 4 (panel de administración):** todos los RF-A, incluida la
  configuración de la rotación del PIN (RF-A-12).
- **Antes del piloto, sin fase asignada:** RF-C-23 (eliminar cuenta), cuando
  existan visitas y pagos que anonimizar o conservar. Lo exige G-4.

## Supuestos de planificación

1. **Sentar por PAGAYA ID va en Fase 3.** Técnicamente es una forma de ingreso,
   pero su valor es reconocer al cliente frecuente, y sin niveles no hay nada que
   reconocer. Adelantarlo a Fase 1 agrega RF-M-13, RF-M-15, RF-C-20 y RF-C-21.
2. **La carta, las mesas y las asignaciones se cargan por script (F1-05)** hasta
   que exista el panel en Fase 4.
3. **El texto del consentimiento (F1-22) es provisional**; el texto final queda
   bloqueado por G-4.
4. **Las tareas asumen la arquitectura propuesta** (outbox, versión de la
   comanda, stack). Si el stack cambia, las tareas se mantienen y solo cambia su
   implementación.
