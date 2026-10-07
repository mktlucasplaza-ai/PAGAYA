# CLAUDE.md — PAGAYA

App de pago rápido y autogestión de mesa para restaurantes (Chile). Tres roles:
cliente, mesero, administrador. El producto se define **por PRDs**; hoy no hay
código, hay definición. Este archivo te orienta y te dice qué es innegociable.

## Principio rector

**La razón propone; la realidad decide.** Nada está terminado porque lo digas:
está terminado cuando `make verify` pasa y pegas su salida. Si no puedes
verificar tu trabajo, el humano vuelve a ser el cuello de botella, y eso es
exactamente lo que este repo intenta evitar.

Consecuencias concretas:

- **Sin auto-reporte.** "Leí los PRDs" no vale; vale lo que hiciste con ellos.
  "Respeté la convención" no vale; vale que `make verify` lo confirme.
- **Reproduce antes de arreglar.** Si algo está mal (un PRD que contradice a
  otro, un índice desactualizado), muestra primero el fallo y después el arreglo.
- **Un supuesto no escrito es un bug.** Si tomas una decisión que el usuario no
  tomó, va al PRD como supuesto explícito o como decisión abierta `D-n`. Nunca
  silenciosa.

## Mapa del repo

```
prds/                   la única fuente de verdad del alcance
  README.md             reglas de versionado + ÍNDICE (aquí vive el estado vigente)
  PRD-NNN-<slug>.md     un PRD por cambio de alcance; inmutables una vez publicados
  _plantilla-prd.md     copia esto para un PRD nuevo
  anexos/               narrativa de apoyo; si contradice un PRD, manda el PRD
docs/                   ejecución: backlog, arquitectura, decisiones técnicas (vivos, editables)
scripts/verify_prds.py  el verificador; se corre con `make verify`
```

**El estado del producto vive en el índice de `prds/README.md`, no aquí.** Este
archivo no dice cuál es el PRD vigente a propósito: se quedaría viejo.

## Orden de lectura al arrancar

Primero identifica el tipo de tarea. Cada tipo tiene su propia lectura; no leas
de más.

### Tareas de PRD (Playbook A)

1. `prds/README.md` — reglas e índice. Identifica el PRD vigente.
2. La sección `## 0. Cambios en esta versión` de **cada** PRD desde el 002 hasta
   el vigente, en orden. Son cortas y te dan la evolución completa.
3. `PRD-001` entero (el producto base) y el PRD vigente entero.
4. Solo si tu tarea lo necesita: los PRDs intermedios completos, los anexos,
   `docs/`.

No empieces a escribir antes del paso 3. Un PRD escrito sin conocer los
anteriores contradice alguno; siempre.

### Tareas de código o documentación (F1-nn, Playbook B)

1. La fila de la tarea en `docs/backlog-fase-1.md`.
2. `fronteras.json`, si la tarea toca código.
3. De `docs/arquitectura.md`, solo §1 más las secciones y AT que la fila o el
   prompt citen.
4. Los RF que la fila cita se buscan con `grep` en `prds/`, no se lee el PRD
   entero (p. ej. `grep -n "RF-C-03" prds/*.md`).

No leas PRDs completos salvo que el prompt lo pida. Tampoco `prds/anexos/` ni el
resto de `docs/`.

## Reglas innegociables de los PRDs

1. **Un PRD publicado no se edita nunca.** Ni una coma. Ni para "corregir un
   typo". Si está mal, el siguiente PRD lo dice.
2. **Todo cambio de alcance es un PRD nuevo** con el número siguiente.
3. **Todo PRD desde el 002 abre con `## 0. Cambios en esta versión`**, con los
   bloques `### Se agregó`, `### Se modificó`, `### Se eliminó` y la línea
   `**Sin cambios:**`. Cada requisito que toca se nombra por su ID.
4. **El índice se actualiza en el mismo commit** que el PRD nuevo: la fila nueva
   dice `Vigente`, la del anterior pasa a `Modificado por PRD-NNN`.
5. **Los IDs son estables:** `RF-C-nn` cliente, `RF-M-nn` mesero, `RF-A-nn`
   admin, `D-n` decisión abierta, `G-n` pregunta de gate de piloto, `F1-nn`
   tarea de backlog. Un ID nunca se reusa con otro significado; se marca
   `(mod.)` cuando se modifica.
6. **Lo que no es alcance no va en `prds/`.** Backlog, arquitectura y
   estimaciones van en `docs/`, que sí se edita.

`make verify` revisa 1 a 4 mecánicamente. Si falla, no está listo.

## Playbooks

Cuando una tarea calza con un playbook, **cópialo como lista de tareas y
ejecútalo en orden**. No lo resumas, no lo saltes.

### A — Escribir un PRD nuevo (cerrar una decisión, cambiar alcance)

1. Lee según "Orden de lectura". Anota qué PRD y qué IDs vas a tocar.
2. `cp prds/_plantilla-prd.md prds/PRD-NNN-<slug>.md` con el número siguiente.
3. Escribe primero `## 0.` — si no puedes nombrar qué cambia y por qué, aún no
   entiendes el cambio. Después el cuerpo.
4. Toda decisión que no tomó el usuario: supuesto explícito o `D-n` nueva.
5. Actualiza el índice de `prds/README.md`. Si cambió un anexo, alinéalo.
6. `make verify`. Su última línea va al informe final (ver Topes).
7. Lectura adversarial del PRD: ¿contradice algún RF vigente que no nombraste
   en `## 0.`? Si tienes subagentes, que uno fresco lea solo los PRDs y responda
   esa pregunta, sin ver tu borrador ni tu razonamiento.
8. Un commit por PRD, en español, que diga qué decisión cierra.

### B — Trabajo que no es alcance (backlog, arquitectura, decisiones técnicas)

1. Va en `docs/`, nunca en `prds/`.
2. Toda tarea o decisión técnica cita el RF o la sección del PRD que la exige.
   Sin cita, no entra.
3. Una decisión técnica se escribe con su alternativa descartada y el motivo.
   Una arquitectura que solo vive en la conversación se reinventa distinta en
   la siguiente sesión.
4. `make verify` igual: el backlog no puede citar un RF que no existe.

### C — Cambiar este archivo

Este archivo es una skill: cambia el comportamiento de todos los agentes que
toquen el repo. No se cambia por intuición; se evalúa.

1. Define qué comportamiento quieres cambiar y escribe un rubric de 3 a 6
   criterios **observables en el transcript**, por ejemplo:
   - ¿Abrió `prds/README.md` antes de escribir?
   - ¿Leyó los `## 0.` de todos los PRDs anteriores?
   - ¿Editó un PRD publicado? (fallo automático)
   - ¿El PRD nuevo nombra por ID cada RF que modifica?
   - ¿Corrió `make verify` y pegó la salida?
2. Corre la misma tarea con el archivo viejo y con el nuevo, en directorios
   separados, con un prompt que parezca una petición real. Nada de lo que vea
   el candidato puede decir *eval*, *test*, *rubric*, *score* ni *juez*.
3. Que juzgue un modelo distinto, a ciegas, leyendo el transcript — qué archivos
   abrió, no qué dijo que hizo.
4. Promueve el cambio solo si el puntaje sube. Si el juez y tú no coinciden, el
   rubric es ambiguo: arréglalo antes de concluir nada.

## Topes de longitud

Son máximos, no metas. Si un texto no cabe, el problema es el alcance, no el tope.

- **Decisión técnica nueva en `docs/arquitectura.md`:** máximo 50 líneas. Tres
  líneas sobre qué la exige (RF o sección), la decisión, y una tabla de hasta
  4 alternativas con su motivo de descarte.
- **PRD nuevo:** apunta a 250 líneas. Si necesita más, probablemente son dos
  decisiones y van en dos PRDs.
- **Informe final de la sesión:** máximo 20 líneas, más la última línea de
  `make verify` (no la salida completa).

## Convenciones

- Todo en **español**, incluidos commits. Sin identificadores de modelo en
  commits, PRDs ni código.
- Fechas `AAAA-MM-DD`. Montos en pesos chilenos con punto de miles (`$58.400`).
- Un commit por PRD. Push a la rama en la que estás trabajando, nunca a otra sin
  que te lo pidan.
- Antes de cerrar la sesión: todo commiteado y pusheado. El contenedor o el
  worktree desaparecen; el remoto no.

## Al terminar

Reporta en este orden, en máximo 20 líneas: qué cambió (archivos), qué supuestos
tomaste y dónde quedaron escritos, qué queda abierto, y la última línea de
`make verify`. Si algo quedó sin hacer, dilo. Un "listo" sin la línea final del
verificador no es un listo.
