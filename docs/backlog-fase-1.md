# Backlog — Fase 1: núcleo de mesa

| | |
|---|---|
| **Fase** | 1 de [PRD-001 §18](../prds/PRD-001-pagaya-mvp.md) — QR, ingreso, carta, comanda en vivo, pedido incremental, notificaciones al mesero, vista de mesas del mesero y entrega |
| **Alcance según** | PRD-001 a PRD-005 (RF vigentes, con sus modificaciones aplicadas) |
| **Estimación** | **133 días-persona** de un desarrollador senior (suma de esfuerzo, no plazo de calendario; ver supuestos 5 a 8) |
| **Fecha** | 2026-09-26 (estimación agregada el 2026-10-04); columnas de ejecución y sub-tareas agregadas el 2026-10-08 |

> Este backlog **no define alcance**: lo traduce a tareas. Si algo de aquí
> contradice un PRD, manda el PRD. Las tareas sin RF propio son habilitantes y
> citan la sección del PRD que las exige.

---

## Cómo se ejecuta

Una sub-tarea (`F1-nna`, `F1-nnb`…) es un workspace de Conductor. Dos
workspaces corren en paralelo solo si sus columnas **Paquetes** no comparten
ningún paquete de [fronteras.json](../fronteras.json); si lo comparten, van en
serie en el orden de **Depende de**. Antes de abrir el workspace, el prompt
reserva en [arquitectura.md](arquitectura.md) el número de sección siguiente
al último publicado y, si decide algo de nivel AT, el número de AT siguiente
al último (hoy: sección **13** en adelante, **AT-20** en adelante), para que
dos sub-tareas no peleen por el mismo número. **Terminada cuando** es lo único
que el PR tiene que mostrar para cerrarse — un comando o una prueba, no una
afirmación. **Modelo** no es una preferencia de estilo: es Opus cuando la
sub-tarea decide esquema de base de datos, una invariante de dinero o de
identidad, o concurrencia; Sonnet en todo lo demás.

---

## E0 · Fundaciones

| ID | Tarea | RF / referencia | Depende de | Estimación | Paquetes | Terminada cuando | Modelo | Estado |
|---|---|---|---|---|---|---|---|---|
| F1-01 | Monorepo, CI y ambientes (dev, staging) | PRD-001 §13 | — | 5 d | Todos los paquetes y apps (andamiaje inicial), `fronteras.json` | `make verify` pasa, incluido `scripts/fronteras.prueba.ts` verificando el grafo de `fronteras.json` | Sonnet | Hecha (#6) |
| F1-02 | Modelo multi-tenant aislado por local, con zona horaria del local | PRD-001 §13 | F1-01 | 5 d | @pagaya/base-datos | `packages/base-datos/src/acceso.prueba.ts` pasa: una consulta sin `local_actual()` fijado no devuelve filas de negocio | Opus | Hecha (#9) |
| F1-03 | Roles (cliente, mesero, admin) y sesiones; acceso a la comanda limitado a la mesa y al personal del local | PRD-001 §14 | F1-02 | 5 d | @pagaya/identidad, @pagaya/base-datos | `packages/identidad/src/sesion.prueba.ts` y `acceso.prueba.ts` pasan | Opus | Hecha (#8) |
| F1-04 | Registro de auditoría append-only, escrito en la misma transacción que el cambio | PRD-001 §14; datos para RF-A-10 y RF-A-15 | F1-02 | 2 d | @pagaya/auditoria, @pagaya/base-datos | Una prueba de integración confirma que una escritura de dominio y su fila de auditoría se confirman o revierten juntas | Opus | Hecha (#21) |
| F1-05 | Carga inicial del local piloto por script: carta, mesas, QR, meseros y asignaciones | Sustituye por ahora a RF-A-01 a 04 (Fase 4) | F1-02 | 3 d | @pagaya/carga-inicial, @pagaya/base-datos | `packages/carga-inicial/src/{validacion,plan,repositorio-postgres}.prueba.ts` pasan, incluida la carga del mismo archivo dos veces sin duplicar filas | Sonnet | Hecha (#10) |
| F1-06 | Migración 0003 con las tablas que el archivo de carga escribe y que F1-10 y F1-30 leen | PRD-001 §12; las tablas de RF-A-01 a RF-A-04, sustituidos por ahora por F1-05 | F1-02, F1-05 | 3 d | @pagaya/base-datos, @pagaya/carga-inicial | `packages/base-datos/src/{catalogo,migraciones}.prueba.ts` pasan contra PostgreSQL real | Opus | Hecha (#11) |

**Subtotal E0: 23 d**

## E1 · Mesa y sesión de mesa

| ID | Tarea | RF / referencia | Depende de | Estimación | Paquetes | Terminada cuando | Modelo | Estado |
|---|---|---|---|---|---|---|---|---|
| **F1-10** | **Mesa y sesión de mesa con sus estados; como máximo una comanda abierta por mesa** | PRD-001 §15, PRD-002 §3.4, PRD-005 §6 | F1-02 | **4 d** | ver sub-tareas | todas sus sub-tareas terminadas | ver sub-tareas | Pendiente |
| F1-10a | Migración y modelo de `mesa.estado` y `sesion_mesa`, con el índice único que impone como máximo una comanda abierta por mesa | PRD-001 §15, PRD-002 §3.4, PRD-005 §6 | F1-02 | — | @pagaya/base-datos | Prueba de integración: abrir dos comandas para la misma mesa hace fallar la segunda por el índice único | Opus | Hecha |
| F1-10b | Máquina de estados de la sesión de mesa (abrir, ocupar, cerrar) en @pagaya/mesa | PRD-001 §15, PRD-002 §3.4 | F1-10a | — | @pagaya/mesa | Pruebas unitarias cubren las transiciones válidas e inválidas de la máquina de estados | Sonnet | Pendiente |
| F1-10c | Endpoint de @pagaya/api que expone el estado de la mesa y su sesión | PRD-001 §15 | F1-10b | — | @pagaya/api | Prueba de integración del endpoint devuelve el estado correcto para una mesa abierta y una cerrada | Sonnet | Pendiente |
| F1-11 | El QR de la mesa lleva al local y a la mesa correctos | RF-C-01 | F1-10 | 1 d | @pagaya/mesa, @pagaya/web | Prueba end-to-end: escanear el QR de prueba lleva al local y la mesa correctos | Sonnet | Pendiente |
| **F1-12** | **PIN de mesa: generación, rotación por sesión (supuesto de G-3), límite de intentos por dispositivo y por mesa** | RF-C-01 (mod.), PRD-002 §3.1 | F1-10 | **4 d** | ver sub-tareas | todas sus sub-tareas terminadas | ver sub-tareas | Pendiente |
| F1-12a | Generación y almacenamiento hasheado del PIN, ligado a `sesion_mesa`, con rotación al abrir cada sesión nueva (G-3) | RF-C-01 (mod.), PRD-002 §3.1 | F1-10a | — | @pagaya/mesa, @pagaya/base-datos | Prueba unitaria: cada sesión nueva tiene un PIN distinto y el PIN se guarda hasheado, nunca en texto plano | Opus | Pendiente |
| F1-12b | Límite de intentos por dispositivo y por mesa, con bloqueo temporal | RF-C-01 (mod.) | F1-12a | — | @pagaya/mesa | Prueba: el intento N+1 tras N fallos se rechaza aunque el PIN sea correcto | Sonnet | Pendiente |
| **F1-13** | **Unirse a la mesa con QR + PIN sin registro; guardar `via_ingreso = PIN`** | RF-C-01, RF-C-24; dato para RF-A-15 | F1-11, F1-12 | **3 d** | ver sub-tareas | todas sus sub-tareas terminadas | ver sub-tareas | Pendiente |
| F1-13a | Verificación de QR+PIN que abre una sesión anónima de dispositivo con `via_ingreso = PIN` | RF-C-01, RF-C-24 | F1-11, F1-12b | — | @pagaya/mesa, @pagaya/identidad | Prueba de integración: entrar con QR+PIN válidos deja una sesión con `via_ingreso = PIN` guardado | Opus | Pendiente |
| F1-13b | Endpoint y pantalla mínima del flujo de ingreso en @pagaya/api y @pagaya/web | RF-C-01, RF-C-24 | F1-13a | — | @pagaya/api, @pagaya/web | Prueba end-to-end: abrir la mesa desde el QR llega a la carta | Sonnet | Pendiente |
| **F1-14** | **El mesero abre la mesa y carga el primer pedido en el mismo flujo; si la mesa ya está abierta, su app lo lleva a esa comanda** | RF-M-09 (abrir), RF-M-17 | F1-10, F1-43 | **3 d** | ver sub-tareas | todas sus sub-tareas terminadas | ver sub-tareas | Pendiente |
| F1-14a | El mesero abre la mesa (transición de estado) desde su app | RF-M-09 (abrir) | F1-10b, F1-43b | — | @pagaya/mesa, @pagaya/api | Prueba de integración: abrir la mesa como mesero deja la sesión en estado abierto con `abierto_por = mesero` | Sonnet | Pendiente |
| F1-14b | Si la mesa ya está abierta, la app del mesero lo lleva a esa comanda en vez de abrir una nueva | RF-M-17 | F1-14a | — | @pagaya/api, @pagaya/web | Prueba de integración: abrir una mesa ya abierta devuelve la comanda existente, no una nueva | Sonnet | Pendiente |
| F1-15 | Cierre de la sesión de mesa: expira el acceso de todos los dispositivos y rota el PIN. En Fase 1 lo dispara una anulación o un cierre manual; desde Fase 2, el pago | PRD-002 §3.4 | F1-12 | 2 d | @pagaya/mesa | Prueba de integración: cerrar la sesión deja sin acceso a todos los dispositivos y el PIN queda rotado | Opus | Pendiente |

**Subtotal E1: 17 d**

## E2 · Identidad y registro

| ID | Tarea | RF / referencia | Depende de | Estimación | Paquetes | Terminada cuando | Modelo | Estado |
|---|---|---|---|---|---|---|---|---|
| **F1-20** | **OTP: canal configurable (SMS por defecto), expiración, límite de intentos, límite de envíos por número y por dispositivo** | RF-C-02, PRD-004 §3 y §8, PRD-001 §14 | F1-03 | **5 d** | ver sub-tareas | todas sus sub-tareas terminadas | ver sub-tareas | Pendiente |
| F1-20a | Puerto de envío de OTP (canal configurable, SMS por defecto) sobre el outbox de @pagaya/notificacion | RF-C-02, PRD-004 §3 | F1-03 | — | @pagaya/identidad, @pagaya/notificacion | Prueba unitaria: pedir un OTP encola un evento en el outbox con el canal configurado | Opus | Hecha |
| F1-20b | Expiración y límite de intentos de verificación del OTP | RF-C-02, PRD-004 §8 | F1-20a | — | @pagaya/identidad | Prueba unitaria: un OTP vencido o que superó sus intentos se rechaza aunque el código sea correcto | Opus | Pendiente |
| F1-20c | Límite de envíos por número y por dispositivo | RF-C-02, PRD-004 §8, PRD-001 §14 | F1-20a | — | @pagaya/identidad | Prueba unitaria: el envío N+1 dentro de la ventana configurada se rechaza | Sonnet | Hecha |
| **F1-21** | **Registro con nombre de pila, teléfono y OTP; una cuenta por teléfono; sesión persistente sin contraseña; menos de 40 s en gama baja** | RF-C-02 (mod.), RF-C-25 | F1-20 | **5 d** | ver sub-tareas | todas sus sub-tareas terminadas | ver sub-tareas | Pendiente |
| F1-21a | Alta de cuenta (nombre, teléfono) reutilizando la cuenta existente si el teléfono ya está registrado | RF-C-02 (mod.) | F1-20b | — | @pagaya/identidad | Prueba de integración: un segundo registro con el mismo teléfono reutiliza la cuenta, no crea otra | Opus | Pendiente |
| F1-21b | Sesión persistente sin contraseña tras verificar el OTP | RF-C-02 (mod.) | F1-21a | — | @pagaya/identidad | Prueba de integración: tras registrarse, el dispositivo queda con una sesión válida sin pedir contraseña | Opus | Pendiente |
| F1-21c | Medición del punta a punta en menos de 40 s en gama baja | RF-C-25 | F1-21b, F1-20c | — | @pagaya/api, @pagaya/web | Una medición del flujo completo en el dispositivo y red de referencia (ver riesgo F1-30) queda bajo 40 s | Sonnet | Pendiente |
| F1-22 | Consentimiento informado con versión, sin casillas pre-marcadas (texto provisional hasta G-4) | RF-C-26 | F1-21 | 2 d | @pagaya/identidad, @pagaya/web | Prueba de integración: registrarse sin aceptar el consentimiento se rechaza; aceptarlo guarda la versión del texto | Sonnet | Pendiente |
| **F1-23** | **Muro de registro en "Enviar pedido" que conserva el carro y envía el pedido al terminar el registro** | RF-C-05 (mod.) | F1-21, F1-31 | **4 d** | ver sub-tareas | todas sus sub-tareas terminadas | ver sub-tareas | Pendiente |
| F1-23a | Migrar la sesión anónima de dispositivo a la cuenta registrada sin duplicar el participante en la comanda | RF-C-05 (mod.) | F1-21b, F1-31a | — | @pagaya/identidad, @pagaya/mesa, @pagaya/comanda | Prueba de integración: registrar un dispositivo con carro armado deja el mismo participante en la comanda, no uno nuevo | Opus | Pendiente |
| F1-23b | El carro sobrevive al abandono y reintento del registro, sin romper la idempotencia del envío (F1-40) | RF-C-05 (mod.) | F1-23a | — | @pagaya/identidad, @pagaya/comanda | Prueba de integración: abandonar el registro a mitad de camino y reintentarlo envía el pedido una sola vez | Opus | Pendiente |

**Subtotal E2: 16 d**

## E3 · Carta

| ID | Tarea | RF / referencia | Depende de | Estimación | Paquetes | Terminada cuando | Modelo | Estado |
|---|---|---|---|---|---|---|---|---|
| **F1-30** | **Carta para el cliente: categorías, foto, descripción, precio y disponibilidad; sin registro; liviana para gama baja y mala señal** | RF-C-03 (mod.), RF-C-24, PRD-001 §14 | F1-05 | **6 d** | ver sub-tareas | todas sus sub-tareas terminadas | ver sub-tareas | Pendiente |
| F1-30a | Lectura del catálogo (categorías, productos, precio, disponibilidad) sin registro | RF-C-03 (mod.), RF-C-24 | F1-06 | — | @pagaya/base-datos, @pagaya/api | Prueba de integración: pedir la carta sin sesión devuelve las categorías y productos del local cargado por F1-05 | Sonnet | Hecha |
| F1-30b | Pantalla de la carta en @pagaya/web con foto y descripción | RF-C-03 (mod.) | F1-30a | — | @pagaya/web | Prueba end-to-end: muestra la carta completa de un local de prueba | Sonnet | Hecha |
| F1-30c | Presupuesto de rendimiento en gama baja y mala señal, contra el dispositivo/red/umbral de referencia que fije la decisión técnica del riesgo F1-30 | PRD-001 §14 | F1-30b | — | @pagaya/web | Una medición de primer pintado en el dispositivo y red de referencia queda bajo el umbral fijado en esa decisión técnica | Sonnet | Pendiente |
| **F1-31** | **Armado del pedido: cantidad, notas y variantes; el carro sobrevive a recargas de la página** | RF-C-04 | F1-30 | **4 d** | ver sub-tareas | todas sus sub-tareas terminadas | ver sub-tareas | Pendiente |
| F1-31a | Carro con cantidad, notas y variantes, persistido en el dispositivo | RF-C-04 | F1-30a | — | @pagaya/web | Prueba end-to-end: recargar la página con el carro armado lo encuentra intacto | Sonnet | Pendiente |
| F1-31b | Validación de variantes y cantidades contra el catálogo antes de habilitar "enviar" | RF-C-04 | F1-31a | — | @pagaya/comanda, @pagaya/web | Prueba unitaria: rechaza una variante que no existe para ese producto | Sonnet | Pendiente |
| **F1-32** | **El mesero marca un producto como agotado, el cambio llega a la carta y se avisa al cliente si ya lo había pedido** | RF-M-12 (Should), PRD-001 §9 | F1-30, F1-70 | **3 d** | ver sub-tareas | todas sus sub-tareas terminadas | ver sub-tareas | Pendiente |
| F1-32a | El mesero cambia `producto.disponible` y el cambio llega a la carta en vivo | RF-M-12 (Should) | F1-30a, F1-70d | — | @pagaya/comanda, @pagaya/base-datos, @pagaya/notificacion | Prueba de integración: cambiar la disponibilidad hace que la siguiente lectura de la carta ya no ofrezca el producto | Sonnet | Pendiente |
| F1-32b | Aviso al cliente que ya había pedido un producto que se agotó | PRD-001 §9 | F1-32a, F1-41a | — | @pagaya/comanda, @pagaya/notificacion | Prueba de integración: el aviso aparece en la comanda del cliente que lo pidió | Sonnet | Pendiente |

**Subtotal E3: 13 d**

## E4 · Comanda y pedidos

| ID | Tarea | RF / referencia | Depende de | Estimación | Paquetes | Terminada cuando | Modelo | Estado |
|---|---|---|---|---|---|---|---|---|
| **F1-40** | **Envío del pedido con idempotencia y confirmación visible; el cliente no puede editarlo después** | RF-C-05, PRD-001 §16 | F1-13, F1-23 | **4 d** | ver sub-tareas | todas sus sub-tareas terminadas | ver sub-tareas | Pendiente |
| F1-40a | Envío idempotente del pedido (clave de idempotencia por intento) | RF-C-05, PRD-001 §16 | F1-13b, F1-23b | — | @pagaya/comanda, @pagaya/base-datos | Prueba de integración: enviar el mismo pedido dos veces con la misma clave deja los ítems una sola vez | Opus | Pendiente |
| F1-40b | Confirmación visible y bloqueo de edición del pedido ya enviado por el cliente | RF-C-05 | F1-40a | — | @pagaya/comanda, @pagaya/web | Prueba de integración: editar un ítem ya enviado por el cliente es rechazado por la API | Sonnet | Pendiente |
| **F1-41** | **Comanda compartida en vivo: ítems, estado, quién pidió y consumo acumulado** | RF-C-06, RF-C-14, RF-C-27 | F1-40, F1-70 | **5 d** | ver sub-tareas | todas sus sub-tareas terminadas | ver sub-tareas | Pendiente |
| F1-41a | Vista de la comanda con ítems, estado y quién pidió, igual para todos los dispositivos de la mesa | RF-C-06, RF-C-14 | F1-40b, F1-70d | — | @pagaya/comanda, @pagaya/api, @pagaya/web | Prueba de integración: dos dispositivos de la misma mesa ven los mismos ítems y estados | Sonnet | Pendiente |
| F1-41b | Consumo acumulado por la mesa, visible a todos los participantes | RF-C-27 | F1-41a | — | @pagaya/comanda | Prueba unitaria: calcula el acumulado correcto tras ítems de distintos participantes | Sonnet | Pendiente |
| F1-42 | Pedido incremental mientras la mesa esté abierta | RF-C-07 | F1-40 | 1 d | @pagaya/comanda | Prueba de integración: un segundo pedido a la misma comanda abierta se agrega al mismo total | Sonnet | Pendiente |
| **F1-43** | **El mesero carga ítems para cualquier comensal, tenga cuenta o no; aparecen como "Cargado por el mesero", con asociación opcional a un participante** | RF-M-07 (mod.), PRD-004 §4 | F1-10 | **5 d** | ver sub-tareas | todas sus sub-tareas terminadas | ver sub-tareas | Pendiente |
| F1-43a | El mesero agrega ítems a la comanda, con o sin participante asociado | RF-M-07 (mod.), PRD-004 §4 | F1-10a | — | @pagaya/comanda, @pagaya/mesa | Prueba de integración: agrega un ítem sin participante y otro con participante, y ambos quedan en la comanda | Sonnet | Pendiente |
| F1-43b | Los ítems cargados por el mesero se etiquetan "Cargado por el mesero" en la vista del cliente | RF-M-07 (mod.) | F1-43a, F1-41a | — | @pagaya/comanda, @pagaya/web | Prueba end-to-end: la etiqueta aparece en el ítem correspondiente | Sonnet | Pendiente |
| **F1-44** | **Corrección de la comanda por el mesero, con motivo y auditoría** | RF-M-08 | F1-04, F1-40 | **3 d** | ver sub-tareas | todas sus sub-tareas terminadas | ver sub-tareas | Pendiente |
| F1-44a | Corrección de cantidad de un ítem con motivo obligatorio | RF-M-08 | F1-04, F1-40b | — | @pagaya/comanda, @pagaya/auditoria | Prueba de integración: corregir sin motivo se rechaza; con motivo, queda la fila de auditoría | Sonnet | Pendiente |
| F1-44b | Anulación de un ítem con motivo y auditoría | RF-M-08 | F1-44a | — | @pagaya/comanda, @pagaya/auditoria | Prueba de integración: anular un ítem deja la fila de auditoría con el motivo | Sonnet | Pendiente |
| **F1-45** | **Estados del ítem: enviado → en preparación → entregado, o anulado** | PRD-001 §15 | F1-40 | **3 d** | ver sub-tareas | todas sus sub-tareas terminadas | ver sub-tareas | Pendiente |
| F1-45a | Transiciones enviado → en preparación → entregado | PRD-001 §15 | F1-40b | — | @pagaya/comanda | Pruebas unitarias cubren las tres transiciones válidas y rechazan saltos hacia atrás | Sonnet | Pendiente |
| F1-45b | Transición a anulado desde cualquier estado previo a entregado | PRD-001 §15 | F1-45a | — | @pagaya/comanda | Prueba unitaria: anula un ítem "en preparación" y rechaza anular uno "entregado" | Sonnet | Pendiente |

**Subtotal E4: 21 d**

## E5 · Asistencia

| ID | Tarea | RF / referencia | Depende de | Estimación | Paquetes | Terminada cuando | Modelo | Estado |
|---|---|---|---|---|---|---|---|---|
| **F1-50** | **"Llamar al mesero" sin registro, con motivo opcional, un llamado activo por mesa y cooldown configurable** | RF-C-08, RF-C-24 | F1-13 | **3 d** | ver sub-tareas | todas sus sub-tareas terminadas | ver sub-tareas | Pendiente |
| F1-50a | Llamado con motivo opcional y la restricción de un llamado activo por mesa | RF-C-08, RF-C-24 | F1-13b | — | @pagaya/mesa, @pagaya/base-datos | Prueba de integración: crear un segundo llamado mientras el primero está activo se rechaza | Opus | Pendiente |
| F1-50b | Cooldown configurable tras atender un llamado | RF-C-08 | F1-50a, F1-51 | — | @pagaya/mesa | Prueba unitaria: un llamado dentro del cooldown se rechaza | Sonnet | Pendiente |
| F1-51 | El mesero ve el llamado y lo marca como atendido | RF-M-03 | F1-50, F1-72 | 2 d | @pagaya/mesa, @pagaya/web | Prueba de integración: marcar el llamado como atendido deja la mesa lista para un llamado nuevo | Sonnet | Pendiente |

**Subtotal E5: 5 d**

## E6 · App del mesero

| ID | Tarea | RF / referencia | Depende de | Estimación | Paquetes | Terminada cuando | Modelo | Estado |
|---|---|---|---|---|---|---|---|---|
| **F1-60** | **Mesas asignadas del turno, con el estado de cada una** | RF-M-01 | F1-05, F1-10 | **4 d** | ver sub-tareas | todas sus sub-tareas terminadas | ver sub-tareas | Pendiente |
| F1-60a | Consulta de mesas asignadas al mesero en el turno activo | RF-M-01 | F1-05, F1-10a | — | @pagaya/base-datos, @pagaya/mesa | Prueba de integración: devuelve solo las mesas de `asignacion` del mesero y turno vigentes | Sonnet | Pendiente |
| F1-60b | Pantalla con el estado de cada mesa asignada | RF-M-01 | F1-60a | — | @pagaya/web | Prueba end-to-end: muestra el estado correcto de cada mesa asignada | Sonnet | Pendiente |
| **F1-61** | **Ítems pendientes de entrega por mesa, ordenados por antigüedad** | RF-M-05 | F1-41 | **3 d** | ver sub-tareas | todas sus sub-tareas terminadas | ver sub-tareas | Pendiente |
| F1-61a | Consulta de ítems pendientes por mesa, ordenados por antigüedad | RF-M-05 | F1-41a | — | @pagaya/comanda | Prueba unitaria: ordena ítems de antigüedades distintas correctamente | Sonnet | Pendiente |
| F1-61b | Pantalla del mesero con la lista ordenada | RF-M-05 | F1-61a | — | @pagaya/web | Prueba end-to-end: muestra la lista en el orden esperado | Sonnet | Pendiente |
| F1-62 | Marcar como entregado, de a uno o todo el lote | RF-M-06 | F1-45 | 2 d | @pagaya/comanda, @pagaya/web | Prueba de integración: marca un lote completo como entregado en una sola llamada | Sonnet | Pendiente |
| **F1-63** | **Última comanda conocida disponible sin conexión** | PRD-001 §13 | F1-61 | **5 d** | ver sub-tareas | todas sus sub-tareas terminadas | ver sub-tareas | Pendiente |
| F1-63a | Caché local de solo lectura de la última comanda conocida por mesa (supuesto: Fase 1 no acepta escrituras offline; ver riesgo F1-63 más abajo) | PRD-001 §13 | F1-61b | — | @pagaya/web | Prueba end-to-end: desconectar la red deja visible la última comanda cargada | Sonnet | Pendiente |
| F1-63b | Al reconectar, la caché se reemplaza por una lectura fresca de la comanda | PRD-001 §13 | F1-63a | — | @pagaya/web | Prueba end-to-end: reconectar muestra el estado más reciente de la comanda, no el cacheado | Sonnet | Pendiente |
| F1-64 | El mesero ve solo el nombre de pila del cliente, nunca sus datos de contacto | PRD-001 §14, PRD-003 §3.4 | F1-60 | 1 d | @pagaya/identidad, @pagaya/api | Prueba de integración: la respuesta al mesero no incluye teléfono ni otros datos de contacto | Sonnet | Pendiente |

**Subtotal E6: 15 d**

## E7 · Notificaciones y tiempo real

| ID | Tarea | RF / referencia | Depende de | Estimación | Paquetes | Terminada cuando | Modelo | Estado |
|---|---|---|---|---|---|---|---|---|
| **F1-70** | **Base de tiempo real: outbox, WebSocket, versión de la comanda, reconexión con polling de respaldo; menos de 3 s** | PRD-001 §13 y §14 | F1-02 | **10 d** | ver sub-tareas | todas sus sub-tareas terminadas | ver sub-tareas | Pendiente |
| F1-70a | `comanda.version` como contador que sube en cada cambio relevante, en la misma transacción | PRD-001 §14 (AT-3) | F1-02 | — | @pagaya/comanda, @pagaya/base-datos | Prueba de integración: `version` sube exactamente una vez por cambio, incluso con dos escrituras concurrentes | Opus | Pendiente |
| F1-70b | Outbox: escritura del evento en la misma transacción que el cambio de dominio | PRD-001 §13 (AT-2) | F1-70a | — | @pagaya/notificacion, @pagaya/base-datos | Prueba de integración: si la transacción de dominio se revierte, no queda evento en el outbox | Opus | Pendiente |
| F1-70c | Repartidor que entrega el outbox con `FOR UPDATE SKIP LOCKED` y `LISTEN/NOTIFY` | PRD-001 §13 (AT-2) | F1-70b | — | @pagaya/repartidor, @pagaya/base-datos | Prueba de integración: dos repartidores corriendo a la vez no entregan el mismo evento dos veces | Opus | Pendiente |
| F1-70d | WebSocket en @pagaya/api que empuja la versión a los clientes conectados, con reconexión y polling de respaldo | PRD-001 §14 | F1-70c | — | @pagaya/api, @pagaya/web | Prueba de integración: el atraso entre el cambio y la entrega al cliente conectado queda bajo 3 s | Sonnet | Pendiente |
| F1-70e | Prototipo de punta a punta medido contra la carga de un local lleno, antes de cerrar el presupuesto de las tareas de E7 que dependen de él (ver riesgo F1-70) | PRD-001 §14 | F1-70d | — | @pagaya/api, @pagaya/repartidor, @pagaya/base-datos | La medición bajo carga queda documentada en [arquitectura.md](arquitectura.md) con el atraso observado | Sonnet | Pendiente |
| **F1-71** | **Push "Mesa X agregó productos" con el detalle, sin avisarle al mesero lo que cargó él mismo** | RF-M-02 (mod.) | F1-70, F1-40 | **5 d** | ver sub-tareas | todas sus sub-tareas terminadas | ver sub-tareas | Pendiente |
| F1-71a | Evento de notificación cuando el cliente agrega ítems, filtrado en el productor para no avisar al mesero de sus propios ítems | RF-M-02 (mod.) | F1-70b, F1-40b | — | @pagaya/notificacion, @pagaya/comanda | Prueba de integración: un ítem cargado por el mesero no genera push para él mismo; uno cargado por el cliente sí | Sonnet | Pendiente |
| F1-71b | Entrega del push al proveedor (certificados iOS/Android) con el detalle del pedido | RF-M-02 (mod.) | F1-71a | — | @pagaya/notificacion, @pagaya/repartidor | Prueba de integración contra el proveedor de push (o su doble) entrega la notificación con el detalle esperado | Sonnet | Pendiente |
| F1-72 | Push del llamado de asistencia | RF-M-03 | F1-70, F1-50 | 2 d | @pagaya/notificacion | Prueba de integración: el push llega al mesero asignado al crear el llamado | Sonnet | Pendiente |
| **F1-73** | **Escalar al administrador de turno si la mesa no tiene asignación o si el mesero no confirma en N minutos** | PRD-001 §9 | F1-71, F1-72 | **3 d** | ver sub-tareas | todas sus sub-tareas terminadas | ver sub-tareas | Pendiente |
| F1-73a | Escalamiento cuando la mesa no tiene asignación vigente | PRD-001 §9 | F1-71b, F1-72 | — | @pagaya/notificacion, @pagaya/mesa | Prueba de integración: una mesa sin fila en `asignacion` genera el aviso al administrador de turno, no al mesero | Sonnet | Pendiente |
| F1-73b | Escalamiento cuando el mesero no confirma en N minutos (configurable) | PRD-001 §9 | F1-73a | — | @pagaya/notificacion | Prueba de integración con un reloj controlado: confirma el escalamiento tras N minutos sin confirmación | Sonnet | Pendiente |

**Subtotal E7: 20 d**

## E8 · Instrumentación

| ID | Tarea | RF / referencia | Depende de | Estimación | Paquetes | Terminada cuando | Modelo | Estado |
|---|---|---|---|---|---|---|---|---|
| **F1-80** | **Eventos del embudo: ingreso a la mesa, registro iniciado, registro completado, pedido enviado, origen del primer pedido. El panel que los muestra llega en Fase 4** | Datos para RF-A-16 (mod.), PRD-004 §7, PRD-005 §7 | F1-13, F1-21, F1-40 | **3 d** | ver sub-tareas | todas sus sub-tareas terminadas | ver sub-tareas | Pendiente |
| F1-80a | Eventos de ingreso a la mesa, registro iniciado y registro completado | PRD-004 §7 | F1-13b, F1-21c | — | @pagaya/identidad, @pagaya/mesa, @pagaya/auditoria | Prueba de integración de cada flujo confirma que el evento correspondiente queda escrito | Sonnet | Pendiente |
| F1-80b | Evento de pedido enviado, con el origen del primer pedido | PRD-005 §7, Datos para RF-A-16 (mod.) | F1-40b, F1-80a | — | @pagaya/comanda, @pagaya/auditoria | Prueba de integración del envío del pedido confirma el evento con el campo de origen | Sonnet | Pendiente |

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
9. **La carta (F1-30 a F1-32) no tiene un paquete de dominio propio en
   Fase 1.** `producto`, `categoria` y `variante` son tablas de catálogo que
   `@pagaya/carga-inicial` escribe (F1-05/F1-06) y que `@pagaya/api` lee junto a
   `@pagaya/base-datos`; ninguna regla de negocio propia las justifica todavía
   como paquete aparte. Si una tarea de una fase posterior le agrega reglas
   (p. ej. promociones), ese es el momento de decidir el paquete — hoy sería
   una capa vacía. **Decidido por el dueño del producto el 2026-10-10:** sin
   paquete propio; se crea cuando lleguen las promociones u otra regla de la
   carta.
10. **F1-63 es "solo lectura" para el offline del mesero en Fase 1.** Sin
    conexión, el mesero ve la última comanda cargada y un aviso de "sin
    conexión"; no puede marcar entregado ni cargar ítems hasta reconectar. No
    hay escritura offline ni reconciliación contra `comanda.version` en las
    sub-tareas F1-63a/b; aceptarlas es trabajo de otra tarea. **Decidido por el
    dueño del producto el 2026-10-10.** Cumple PRD-001 §13, que solo pide *ver*
    la última comanda conocida. Alternativa descartada: aceptar escrituras sin
    conexión y reconciliarlas al volver (rango de 8 a 13 d o más, y conflictos
    con cambios hechos por otros mientras el mesero estaba desconectado); se
    reabre solo si el piloto muestra que los meseros la necesitan.

## Riesgos de estimación

Las cinco tareas donde el número tiene más varianza. No son las cinco más
grandes: son las cinco donde el esperado y el pesimista se separan más, porque
algo que la tarea necesita **todavía no está decidido, medido o firmado**. Cada
una dice qué información cerraría el rango.

| ID | Esperado | Rango | Por qué el número es incierto |
|---|---|---|---|
| **F1-70** — base de tiempo real | 10 d | 8–22 d | Es la tarea más grande y la única que se estima contra una **propuesta** y no contra código existente: outbox, repartidor con `FOR UPDATE SKIP LOCKED`, `LISTEN/NOTIFY`, versión de la comanda, reconexión y polling de respaldo ([arquitectura.md](arquitectura.md) AT-2 y AT-3). El requisito que la cierra no es funcional sino de latencia —menos de 3 s (PRD-001 §14)— y eso no se declara terminado, se mide: si el primer prototipo no entra en el presupuesto, el trabajo que sigue es de perfilamiento y rediseño, no de implementación. Además ocho tareas dependen de ella (cuatro de forma directa), así que su error no se queda en su fila. **Qué cierra el rango:** un prototipo de punta a punta que mida el atraso del repartidor bajo la carga de un local lleno, antes de estimar el resto de E7 — es, en esta versión del backlog, la sub-tarea **F1-70e**. |
| **F1-20** — OTP | 5 d | 3–12 d | Lo incierto no es el código, es el tercero. Alta del comercio con un proveedor de SMS chileno, remitente aprobado, precio por mensaje y, sobre todo, la meta de PRD-004 §7: entrega en menos de 30 s en el 95 % de los casos. Eso no depende de nuestra implementación y no se puede verificar sin tráfico real; si el proveedor elegido no la cumple, la tarea pasa a incluir un segundo proveedor y la lógica de respaldo entre ambos. La propia §Cobertura ya avisa que conviene gestionarlo desde el primer día. **Qué cierra el rango:** una prueba de entrega con tráfico real de dos proveedores antes de comprometer la fecha. |
| **F1-30** — carta del cliente | 6 d | 4–14 d | La parte funcional (categorías, foto, precio, disponibilidad) es predecible; la parte que no lo es viene de RF-C-03 (mod.) y PRD-001 §14: "liviana para gama baja y mala señal". **Ningún PRD define el teléfono de referencia, la red de referencia ni el umbral de primer pintado**, y [arquitectura.md](arquitectura.md) AT-1 convierte ese presupuesto en requisito de aceptación. Según dónde se fije la vara, esto es una lista con imágenes diferidas o un trabajo completo de pipeline de imágenes, CDN y renderizado en servidor. Es la primera pantalla de la primera visita, la que PRD-004 §1 dice que se cobra una sola vez, así que no es un lugar donde recortar. **Qué cierra el rango:** fijar dispositivo, red y umbral de referencia antes de empezar; es una decisión técnica, no un PRD. La sub-tarea **F1-30c** es justo esa medición, pero el umbral que usa todavía no está fijado. |
| **F1-63** — comanda sin conexión | 5 d | 3–13 d | PRD-001 §13 pide una sola frase —"el mesero debe poder ver la última comanda conocida sin conexión"— y deja fuera todo lo que determina el costo: cuánto tiempo sin conexión hay que sostener, qué pasa con las acciones que el mesero intenta mientras está caído (marcar entregado, cargar un ítem) y cómo se reconcilia al volver. Si el alcance es solo lectura en caché, son 3 d; si hay que aceptar escrituras y reconciliarlas contra `comanda.version` (AT-3), es otra tarea. El offline es donde las estimaciones se rompen, y encima está al final de la cadena más larga del supuesto 7. **Qué cierra el rango:** decidir explícitamente "solo lectura en Fase 1" —y escribirlo— o aceptar el rango alto. Cerrado el 2026-10-10: solo lectura en Fase 1 (supuesto 10), así que vale el extremo bajo del rango. |
| **F1-23** — muro de registro | 4 d | 3–10 d | La tarea parece de interfaz y es de sesiones. Un dispositivo entra a la mesa **sin registro** (F1-13, RF-C-24), arma su carro y en "Enviar pedido" se convierte en un usuario registrado: hay que migrar la sesión anónima a la del usuario sin perder el carro, sin duplicar el participante en la comanda y sin romper la idempotencia del envío (F1-40, PRD-001 §16) cuando el cliente abandona el registro y lo reintenta. Encima el resultado se mide contra RF-C-25 —menos de 40 s de punta a punta en gama baja, con el OTP adentro—, que depende de F1-20 y no de esta tarea. **Qué cierra el rango:** una prueba del camino completo anónimo → registrado → pedido enviado, con reintentos y abandono, escrita antes de la implementación. |

**Rozaron la lista, y por qué quedaron fuera:** F1-71 (el proveedor de push y los
certificados de iOS son un tercero más, pero el camino está mucho más trillado
que el del SMS) y F1-12 (G-3 está abierta, pero PRD-003 §2 ya decidió que
**ambas** rotaciones se implementan y la elección es configuración: la
incertidumbre es de operación, no de esfuerzo).
