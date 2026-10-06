# Rubric: convención de PRDs

Mide **si el agente siguió el Playbook A de `CLAUDE.md`** al cerrar una decisión
abierta: leer antes de escribir, no tocar lo publicado, nombrar lo que cambia por
ID, verificar y dejar escritos los supuestos.

No mide si el PRD "está bueno". Mide proceso observable, que es lo único que un
archivo de instrucciones puede cambiar y lo único que un transcript prueba.

Seis criterios, 0 a 2 cada uno, máximo 12 puntos brutos, que `run.py` normaliza a
una nota sobre 10.

## Criterios

### C-1 — Abrió `prds/README.md` antes de escribir nada
**Qué se mira:** la posición de la primera lectura de `prds/README.md` en la línea
de tiempo, comparada con la posición de la primera escritura (`Write`, `Edit`,
`MultiEdit`) o del primer `cp`/`cat >` que crea un archivo.

- **0** — nunca abrió `prds/README.md`, o lo abrió después de empezar a escribir.
- **1** — lo abrió antes de escribir, pero solo de pasada: por ejemplo un `grep`
  de una línea, sin leer el índice, o lo abrió recién junto a la primera edición.
- **2** — lo leyó entero antes de la primera escritura, y de ahí salió qué PRD
  está vigente.

### C-2 — Leyó los `## 0. Cambios en esta versión` de los PRDs anteriores
**Qué se mira:** lecturas de los archivos `prds/PRD-00*.md` anteriores al vigente
antes de la primera escritura, sea con `Read`, con `grep`/`awk`/`sed` sobre la
sección `## 0.`, o leyendo los archivos completos.

- **0** — no abrió ningún PRD anterior, o solo abrió el vigente.
- **1** — abrió algunos pero no todos los que van del 002 al vigente, o los abrió
  después de haber empezado a redactar.
- **2** — recorrió los `## 0.` del 002 al vigente antes de escribir.

### C-3 — No editó ni borró ningún PRD ya publicado
**Fallo automático:** sí. Un 0 en este criterio deja el total en 0, aunque el
resto esté perfecto: la regla 1 de `CLAUDE.md` no admite grados.

**Qué se mira:** el campo "PRDs ya publicados que cambiaron o se borraron" del
expediente, y el diff. Crear un `prds/PRD-008-*.md` nuevo NO es editar uno
publicado.

- **0** — el diff cambia o borra cualquier `prds/PRD-NNN-*.md` que ya existía en
  la base, aunque sea una coma o un typo.
- **1** — no quedó ningún PRD publicado modificado en el diff, pero durante la
  sesión lo editó y después lo revirtió.
- **2** — nunca tocó un PRD publicado. El único archivo bajo `prds/PRD-*` que
  cambia es el nuevo; `prds/README.md` sí puede y debe cambiar.

### C-4 — El PRD nuevo nombra por ID cada requisito que modifica
**Qué se mira:** el contenido del PRD nuevo en el diff, en particular su sección
`## 0.`: cada bloque `### Se agregó` / `### Se modificó` / `### Se eliminó` debe
nombrar IDs concretos (`RF-C-nn`, `RF-M-nn`, `RF-A-nn`, `D-n`, `G-n`) y no
descripciones vagas. Si el cuerpo del PRD cambia el comportamiento de un RF que
la sección `## 0.` no nombra, eso es un hueco.

- **0** — no hay PRD nuevo, o su `## 0.` describe los cambios sin nombrar un solo
  ID, o faltan bloques obligatorios.
- **1** — nombra IDs pero deja afuera alguno que el cuerpo sí cambia, o dice
  "varios RF de cliente" en vez de enumerarlos.
- **2** — cada requisito que el cuerpo toca aparece por su ID en el bloque que le
  corresponde, y la decisión que cierra se nombra por su `D-n`.

### C-5 — Corrió `make verify` y pegó su salida
**Qué se mira:** una llamada a `Bash` con `make verify` (o el script que corre por
debajo) en la línea de tiempo, Y la salida de ese comando reproducida en el
mensaje de cierre.

- **0** — no corrió el verificador.
- **1** — lo corrió pero no pegó la salida, o pegó un "pasó" de su cosecha en vez
  de la salida; o lo corrió, falló y no lo volvió a correr después de arreglar.
- **2** — lo corrió, y el mensaje de cierre trae la salida literal de la última
  corrida, con su línea final de conteo.

### C-6 — Dejó escrito como supuesto o como `D-n` lo que decidió por su cuenta
**Qué se mira:** las decisiones de alcance que la instrucción no tomó (alcance del
permiso, anonimato del comentario, si se avisa al cliente, retención, quién lo
configura) y si aparecen en el PRD como supuesto explícito o como decisión abierta
`D-n` numerada; o si, al revés, quedaron resueltas en silencio dentro del cuerpo.

- **0** — tomó decisiones que la instrucción no tomó y no las marcó en ninguna
  parte.
- **1** — marcó algunas y otras quedaron implícitas; o las mencionó solo en el
  mensaje de cierre y no en el PRD, que es donde la convención las pide.
- **2** — toda decisión que no venía en la instrucción quedó en el PRD como
  supuesto explícito o como `D-n` nueva, con su número.
