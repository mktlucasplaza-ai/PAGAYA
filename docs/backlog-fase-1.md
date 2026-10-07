# Backlog — Fase 1: núcleo de mesa

| | |
|---|---|
| **Fase** | 1 de [PRD-001 §18](../prds/PRD-001-pagaya-mvp.md) — QR, ingreso, carta, comanda en vivo, pedido incremental, notificaciones al mesero, vista de mesas del mesero y entrega |
| **Alcance según** | PRD-001 a PRD-005 (RF vigentes, con sus modificaciones aplicadas) |
| **Estimación** | **133 días-persona** de un desarrollador senior (suma de esfuerzo, no plazo de calendario; ver supuestos 5 a 8) |
| **Fecha** | 2026-09-26 (estimación agregada el 2026-10-04) |

> Este backlog **no define alcance**: lo traduce a tareas. Si algo de aquí
> contradice un PRD, manda el PRD. Las tareas sin RF propio son habilitantes y
> citan la sección del PRD que las exige.

---

## E0 · Fundaciones

| ID | Tarea | RF / referencia | Depende de | Estimación |
|---|---|---|---|---|
| F1-01 | Monorepo, CI y ambientes (dev, staging) | PRD-001 §13 | — | 5 d |
| F1-02 | Modelo multi-tenant aislado por local, con zona horaria del local | PRD-001 §13 | F1-01 | 5 d |
| F1-03 | Roles (cliente, mesero, admin) y sesiones; acceso a la comanda limitado a la mesa y al personal del local | PRD-001 §14 | F1-02 | 5 d |
| F1-04 | Registro de auditoría append-only, escrito en la misma transacción que el cambio | PRD-001 §14; datos para RF-A-10 y RF-A-15 | F1-02 | 2 d |
| F1-05 | Carga inicial del local piloto por script: carta, mesas, QR, meseros y asignaciones | Sustituye por ahora a RF-A-01 a 04 (Fase 4) | F1-02 | 3 d |
| F1-06 | Migración 0003 con las tablas que el archivo de carga escribe y que F1-10 y F1-30 leen | PRD-001 §12; las tablas de RF-A-01 a RF-A-04, sustituidos por ahora por F1-05 | F1-02, F1-05 | 3 d |

**Subtotal E0: 23 d**

## E1 · Mesa y sesión de mesa

| ID | Tarea | RF / referencia | Depende de | Estimación |
|---|---|---|---|---|
| F1-10 | Mesa y sesión de mesa con sus estados; como máximo una comanda abierta por mesa | PRD-001 §15, PRD-002 §3.4, PRD-005 §6 | F1-02 | 4 d |
| F1-11 | El QR de la mesa lleva al local y a la mesa correctos | RF-C-01 | F1-10 | 1 d |
| F1-12 | PIN de mesa: generación, rotación por sesión (supuesto de G-3), límite de intentos por dispositivo y por mesa | RF-C-01 (mod.), PRD-002 §3.1 | F1-10 | 4 d |
| F1-13 | Unirse a la mesa con QR + PIN **sin registro**; guardar `via_ingreso = PIN` | RF-C-01, RF-C-24; dato para RF-A-15 | F1-11, F1-12 | 3 d |
| F1-14 | El mesero abre la mesa y carga el primer pedido en el mismo flujo; si la mesa ya está abierta, su app lo lleva a esa comanda | RF-M-09 (abrir), RF-M-17 | F1-10, F1-43 | 3 d |
| F1-15 | Cierre de la sesión de mesa: expira el acceso de todos los dispositivos y rota el PIN. En Fase 1 lo dispara una anulación o un cierre manual; desde Fase 2, el pago | PRD-002 §3.4 | F1-12 | 2 d |

**Subtotal E1: 17 d**

## E2 · Identidad y registro

| ID | Tarea | RF / referencia | Depende de | Estimación |
|---|---|---|---|---|
| F1-20 | OTP: canal configurable (SMS por defecto), expiración, límite de intentos, límite de envíos por número y por dispositivo | RF-C-02, PRD-004 §3 y §8, PRD-001 §14 | F1-03 | 5 d |
| F1-21 | Registro con nombre de pila, teléfono y OTP; una cuenta por teléfono; sesión persistente sin contraseña; menos de 40 s en gama baja | RF-C-02 (mod.), RF-C-25 | F1-20 | 5 d |
| F1-22 | Consentimiento informado con versión, sin casillas pre-marcadas (texto provisional hasta G-4) | RF-C-26 | F1-21 | 2 d |
| F1-23 | Muro de registro en "Enviar pedido" que conserva el carro y envía el pedido al terminar el registro | RF-C-05 (mod.) | F1-21, F1-31 | 4 d |

**Subtotal E2: 16 d**

## E3 · Carta

| ID | Tarea | RF / referencia | Depende de | Estimación |
|---|---|---|---|---|
| F1-30 | Carta para el cliente: categorías, foto, descripción, precio y disponibilidad; sin registro; liviana para gama baja y mala señal | RF-C-03 (mod.), RF-C-24, PRD-001 §14 | F1-05 | 6 d |
| F1-31 | Armado del pedido: cantidad, notas y variantes; el carro sobrevive a recargas de la página | RF-C-04 | F1-30 | 4 d |
| F1-32 | El mesero marca un producto como agotado, el cambio llega a la carta y se avisa al cliente si ya lo había pedido | RF-M-12 (Should), PRD-001 §9 | F1-30, F1-70 | 3 d |

**Subtotal E3: 13 d**

## E4 · Comanda y pedidos

| ID | Tarea | RF / referencia | Depende de | Estimación |
|---|---|---|---|---|
| F1-40 | Envío del pedido con idempotencia y confirmación visible; el cliente no puede editarlo después | RF-C-05, PRD-001 §16 | F1-13, F1-23 | 4 d |
| F1-41 | Comanda compartida en vivo: ítems, estado, quién pidió y consumo acumulado | RF-C-06, RF-C-14, RF-C-27 | F1-40, F1-70 | 5 d |
| F1-42 | Pedido incremental mientras la mesa esté abierta | RF-C-07 | F1-40 | 1 d |
| F1-43 | El mesero carga ítems para cualquier comensal, tenga cuenta o no; aparecen como "Cargado por el mesero", con asociación opcional a un participante | RF-M-07 (mod.), PRD-004 §4 | F1-10 | 5 d |
| F1-44 | Corrección de la comanda por el mesero, con motivo y auditoría | RF-M-08 | F1-04, F1-40 | 3 d |
| F1-45 | Estados del ítem: enviado → en preparación → entregado, o anulado | PRD-001 §15 | F1-40 | 3 d |

**Subtotal E4: 21 d**

## E5 · Asistencia

| ID | Tarea | RF / referencia | Depende de | Estimación |
|---|---|---|---|---|
| F1-50 | "Llamar al mesero" sin registro, con motivo opcional, un llamado activo por mesa y cooldown configurable | RF-C-08, RF-C-24 | F1-13 | 3 d |
| F1-51 | El mesero ve el llamado y lo marca como atendido | RF-M-03 | F1-50, F1-72 | 2 d |

**Subtotal E5: 5 d**

## E6 · App del mesero

| ID | Tarea | RF / referencia | Depende de | Estimación |
|---|---|---|---|---|
| F1-60 | Mesas asignadas del turno, con el estado de cada una | RF-M-01 | F1-05, F1-10 | 4 d |
| F1-61 | Ítems pendientes de entrega por mesa, ordenados por antigüedad | RF-M-05 | F1-41 | 3 d |
| F1-62 | Marcar como entregado, de a uno o todo el lote | RF-M-06 | F1-45 | 2 d |
| F1-63 | Última comanda conocida disponible sin conexión | PRD-001 §13 | F1-61 | 5 d |
| F1-64 | El mesero ve solo el nombre de pila del cliente, nunca sus datos de contacto | PRD-001 §14, PRD-003 §3.4 | F1-60 | 1 d |

**Subtotal E6: 15 d**

## E7 · Notificaciones y tiempo real

| ID | Tarea | RF / referencia | Depende de | Estimación |
|---|---|---|---|---|
| F1-70 | Base de tiempo real: outbox, WebSocket, versión de la comanda, reconexión con polling de respaldo; menos de 3 s | PRD-001 §13 y §14 | F1-02 | 10 d |
| F1-71 | Push "Mesa X agregó productos" con el detalle, sin avisarle al mesero lo que cargó él mismo | RF-M-02 (mod.) | F1-70, F1-40 | 5 d |
| F1-72 | Push del llamado de asistencia | RF-M-03 | F1-70, F1-50 | 2 d |
| F1-73 | Escalar al administrador de turno si la mesa no tiene asignación o si el mesero no confirma en N minutos | PRD-001 §9 | F1-71, F1-72 | 3 d |

**Subtotal E7: 20 d**

## E8 · Instrumentación

| ID | Tarea | RF / referencia | Depende de | Estimación |
|---|---|---|---|---|
| F1-80 | Eventos del embudo: ingreso a la mesa, registro iniciado, registro completado, pedido enviado, origen del primer pedido. El panel que los muestra llega en Fase 4 | Datos para RF-A-16 (mod.), PRD-004 §7, PRD-005 §7 | F1-13, F1-21, F1-40 | 3 d |

**Subtotal E8: 3 d**

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
5. **Qué incluye cada estimación.** Días-persona de **un** desarrollador senior
   ya familiarizado con el stack de [arquitectura.md](arquitectura.md): diseño
   técnico, implementación en servidor y cliente, pruebas automatizadas del
   criterio de aceptación que la tarea cubre y las iteraciones de revisión de
   código. **No** incluye diseño de interfaz, QA manual, redacción de los textos
   legales (G-4), capacitación del personal del local ni provisión de la
   infraestructura de producción.
6. **Se estima en días-persona absolutos, no en puntos de historia.** La
   alternativa descartada —puntos y velocidad— necesita velocidad histórica de
   un equipo que todavía no existe: los puntos no se convertirían en fechas y la
   estimación no serviría para la decisión que se quiere tomar (¿cuánto dura la
   Fase 1?). El costo asumido es que un día-persona de un senior es una unidad
   discutible; se discute una vez y vale para todo el backlog.
7. **El total es suma de esfuerzo, no plazo de calendario.** 133 días-persona no
   son 133 días hábiles de proyecto. Con la columna "Depende de" como grafo, la
   cadena de dependencias más larga suma **46 d**:
   `F1-01 → F1-02 → F1-03 → F1-20 → F1-21 → F1-23 → F1-40 → F1-41 → F1-61 →
   F1-63`. Es decir: ni un equipo infinito termina la Fase 1 en menos de ~46
   días hábiles sin cambiar el alcance o romper una dependencia.
   **Observación:** esa cadena no coincide con el "camino crítico" declarado en
   §Cobertura, que se escribió sin estimaciones y recorre el tiempo real
   (F1-70/F1-71). Con estos números, lo que domina el plazo es la cadena de
   identidad y registro (F1-20 → F1-21 → F1-23) seguida del offline del mesero
   (F1-61 → F1-63), no el tiempo real. La línea de §Cobertura se mantiene como
   está: cambiarla es trabajo de otra tarea, no de la estimación.
8. **Los números son el caso esperado, sin colchón de contingencia.** No hay un
   porcentaje de riesgo repartido sobre el total: el riesgo está nombrado tarea
   por tarea en "Riesgos de estimación", con su rango. Si se necesita una cifra
   con colchón para comprometerla con un tercero, el rango pesimista de esas
   cinco tareas suma **+41 d** sobre el esperado (174 d).

## Riesgos de estimación

Las cinco tareas donde el número tiene más varianza. No son las cinco más
grandes: son las cinco donde el esperado y el pesimista se separan más, porque
algo que la tarea necesita **todavía no está decidido, medido o firmado**. Cada
una dice qué información cerraría el rango.

| ID | Esperado | Rango | Por qué el número es incierto |
|---|---|---|---|
| **F1-70** — base de tiempo real | 10 d | 8–22 d | Es la tarea más grande y la única que se estima contra una **propuesta** y no contra código existente: outbox, repartidor con `FOR UPDATE SKIP LOCKED`, `LISTEN/NOTIFY`, versión de la comanda, reconexión y polling de respaldo ([arquitectura.md](arquitectura.md) AT-2 y AT-3). El requisito que la cierra no es funcional sino de latencia —menos de 3 s (PRD-001 §14)— y eso no se declara terminado, se mide: si el primer prototipo no entra en el presupuesto, el trabajo que sigue es de perfilamiento y rediseño, no de implementación. Además ocho tareas dependen de ella (cuatro de forma directa), así que su error no se queda en su fila. **Qué cierra el rango:** un prototipo de punta a punta que mida el atraso del repartidor bajo la carga de un local lleno, antes de estimar el resto de E7. |
| **F1-20** — OTP | 5 d | 3–12 d | Lo incierto no es el código, es el tercero. Alta del comercio con un proveedor de SMS chileno, remitente aprobado, precio por mensaje y, sobre todo, la meta de PRD-004 §7: entrega en menos de 30 s en el 95 % de los casos. Eso no depende de nuestra implementación y no se puede verificar sin tráfico real; si el proveedor elegido no la cumple, la tarea pasa a incluir un segundo proveedor y la lógica de respaldo entre ambos. La propia §Cobertura ya avisa que conviene gestionarlo desde el primer día. **Qué cierra el rango:** una prueba de entrega con tráfico real de dos proveedores antes de comprometer la fecha. |
| **F1-30** — carta del cliente | 6 d | 4–14 d | La parte funcional (categorías, foto, precio, disponibilidad) es predecible; la parte que no lo es viene de RF-C-03 (mod.) y PRD-001 §14: "liviana para gama baja y mala señal". **Ningún PRD define el teléfono de referencia, la red de referencia ni el umbral de primer pintado**, y [arquitectura.md](arquitectura.md) AT-1 convierte ese presupuesto en requisito de aceptación. Según dónde se fije la vara, esto es una lista con imágenes diferidas o un trabajo completo de pipeline de imágenes, CDN y renderizado en servidor. Es la primera pantalla de la primera visita, la que PRD-004 §1 dice que se cobra una sola vez, así que no es un lugar donde recortar. **Qué cierra el rango:** fijar dispositivo, red y umbral de referencia antes de empezar; es una decisión técnica, no un PRD. |
| **F1-63** — comanda sin conexión | 5 d | 3–13 d | PRD-001 §13 pide una sola frase —"el mesero debe poder ver la última comanda conocida sin conexión"— y deja fuera todo lo que determina el costo: cuánto tiempo sin conexión hay que sostener, qué pasa con las acciones que el mesero intenta mientras está caído (marcar entregado, cargar un ítem) y cómo se reconcilia al volver. Si el alcance es solo lectura en caché, son 3 d; si hay que aceptar escrituras y reconciliarlas contra `comanda.version` (AT-3), es otra tarea. El offline es donde las estimaciones se rompen, y encima está al final de la cadena más larga del supuesto 7. **Qué cierra el rango:** decidir explícitamente "solo lectura en Fase 1" —y escribirlo— o aceptar el rango alto. |
| **F1-23** — muro de registro | 4 d | 3–10 d | La tarea parece de interfaz y es de sesiones. Un dispositivo entra a la mesa **sin registro** (F1-13, RF-C-24), arma su carro y en "Enviar pedido" se convierte en un usuario registrado: hay que migrar la sesión anónima a la del usuario sin perder el carro, sin duplicar el participante en la comanda y sin romper la idempotencia del envío (F1-40, PRD-001 §16) cuando el cliente abandona el registro y lo reintenta. Encima el resultado se mide contra RF-C-25 —menos de 40 s de punta a punta en gama baja, con el OTP adentro—, que depende de F1-20 y no de esta tarea. **Qué cierra el rango:** una prueba del camino completo anónimo → registrado → pedido enviado, con reintentos y abandono, escrita antes de la implementación. |

**Rozaron la lista, y por qué quedaron fuera:** F1-71 (el proveedor de push y los
certificados de iOS son un tercero más, pero el camino está mucho más trillado
que el del SMS) y F1-12 (G-3 está abierta, pero PRD-003 §2 ya decidió que
**ambas** rotaciones se implementan y la elección es configuración: la
incertidumbre es de operación, no de esfuerzo).
