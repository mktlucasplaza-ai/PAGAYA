# evals — el banco de pruebas del Playbook C

`CLAUDE.md` es una skill: cambia el comportamiento de todos los agentes que tocan
este repo. El Playbook C dice que no se cambia por intuición, se mide. Esto es lo
que lo mide.

## Qué mide, y qué no

Mide **una variante del repo contra otra**, corriendo las dos contra la misma
instrucción. Nunca mide "calidad" en abstracto.

La diferencia no es retórica. Una nota sola no quiere decir nada: un 7,5 puede
ser un `CLAUDE.md` mediocre con un modelo bueno, o al revés, y no hay forma de
saberlo. Lo único accionable es *este* archivo contra *ese* archivo, misma
instrucción, mismo commit de partida, mismo modelo, mismo día. Por eso `run.py`
**exige dos `--variante` o más** y aborta con una sola.

Y mide **proceso observable, no producto**. El rubric no pregunta si el PRD quedó
bien escrito: pregunta si abrió el índice antes de escribir, si leyó los `## 0.`
anteriores, si tocó un PRD publicado, si corrió el verificador. Son las cosas que
un archivo de instrucciones puede cambiar y que el transcript prueba. Lo demás es
opinión sobre prosa, y en eso el juez es ruido.

## Las cuatro etapas

| Etapa | Qué pasa | Dónde está |
|---|---|---|
| **plan** | Lee el rubric (3 a 6 criterios) y la instrucción orgánica. Aborta si algo de lo que verá el candidato delata que la corrida existe. | `leer_rubric`, `leer_instruccion`, `revisar_palabras` |
| **blind** | Prepara una copia aislada del repo por variante y baraja las etiquetas A/B. El mapa etiqueta→variante no sale del proceso. | `preparar_copia`, `nombres_de_copia` |
| **run** | Corre los candidatos en paralelo con `claude -p`, guarda el stream completo, el diff y el mensaje de cierre. | `correr_candidato`, `leer_transcript` |
| **synthesize** | Arma el expediente anónimo de cada uno, lo manda al juez ciego, normaliza a 10 y escribe el JSON. | `expediente`, `juzgar`, `sintetizar` |

## Lo que el candidato ve y lo que no

Cada candidato trabaja en `/tmp/pgy-xxxx/pagaya-<algo>-<n>`, una copia completa
del repo desde `origin/main` en la que:

- **no existe `evals/`** — se borra antes de empezar;
- **no hay remoto git** — `git remote remove origin`; un `git push` falla con
  "No configured push destination", así que un candidato no puede empujar su
  trabajo a ninguna parte, ni accidentalmente ni a propósito;
- **sí existe `refs/remotes/origin/main`**, creada a mano con `git update-ref`.
  Sin ella `make verify` no tiene contra qué comparar la inmutabilidad de los
  PRDs y falla por una razón que no es culpa del candidato. Una ref sin remoto
  deja verificar sin dejar pushear;
- **la historia se ve normal**: la preparación (borrar `evals/`, poner la
  variante) se mete con `git commit --amend --no-edit` en el commit de punta, no
  como un commit nuevo con nombre sospechoso;
- **la carpeta y la rama tienen nombre de proyecto** (`pagaya-terraza-30`,
  `trabajo/cerrar-decision`), nunca nombre de corrida;
- **el entorno va limpio**: se quitan las variables `CLAUDE_CODE_*` del proceso
  padre y la `OPENAI_API_KEY` (la key del juez no viaja al candidato), y se corre
  con `--setting-sources project --strict-mcp-config --disable-slash-commands`
  para que la configuración personal de quien corre esto no se cuele en el
  resultado.

Además, `run.py` **aborta** si la instrucción, el archivo de variante, el nombre
de rama o el nombre de carpeta contienen alguna de estas palabras: *eval, test,
judge, rubric, score, benchmark, candidate, arena, juez, prueba*. Un candidato
que sabe que lo están mirando deja de comportarse como si el trabajo fuera real.

## El juez

Otra familia de modelos, a propósito: los candidatos son Claude, el juez es
**Codex** (`codex exec`, con la key de OpenAI tomada de `OPENAI_API_KEY` o, si no
está, de `~/.codex/auth.json`). **La key nunca se escribe en el repo.** Un modelo
puntuando a su propia familia tiende a premiar el estilo que él mismo escribiría.

El juez recibe:

- la instrucción que recibieron los dos,
- el rubric completo,
- un **expediente por candidato con etiqueta neutra A o B**: la línea de tiempo
  numerada de cada llamada a herramienta (qué archivo abrió, en qué orden, qué
  comando corrió, si devolvió error), los hechos de git medidos al terminar
  (archivos nuevos, archivos ya existentes que cambiaron, PRDs publicados que
  cambiaron), el diff contra la base y el mensaje de cierre.

No recibe: qué variante es cuál, en qué se diferencian, ni el razonamiento de
nadie. Y se le dice explícitamente que el mensaje de cierre es **una afirmación
del agente, no una prueba**: si el agente dice que corrió el verificador y la
línea de tiempo no lo muestra, cuenta como no hecho. Corre en modo solo lectura,
en un directorio vacío, sin poder abrir el repo.

## Por qué 0-2 por criterio y no una escala fina

La escala corta es deliberada. Con 0-10 por criterio, el juez inventa precisión
que no tiene: la distancia entre un 6 y un 7 no está definida en ninguna parte, y
dos corridas idénticas se separan tres puntos solo por cómo venía redactado el
mensaje de cierre. Ese ruido se come la señal que buscamos, que suele ser chica —
un `CLAUDE.md` mejor cambia el comportamiento en un criterio o dos, no en todos.

Con 0-2 el juez contesta una pregunta que sí puede contestar mirando el
transcript:

- **0** — no ocurrió,
- **1** — ocurrió a medias o tarde,
- **2** — ocurrió completo.

No existe el 1,5, y el rubric define qué significa cada número *para ese
criterio*. La granularidad que se pierde dentro de un criterio se recupera
teniendo seis criterios: el total sigue teniendo 13 valores posibles, pero cada
uno está respaldado por una decisión binaria-y-media en vez de por una corazonada.

**La nota final se normaliza a 10**: `total / máximo × 10`, con un decimal. Con
seis criterios, el máximo bruto es 12 y cada punto bruto vale 0,83. Se reporta
normalizado en el JSON y en el resumen para que todas las corridas se comparen en
la misma escala aunque el rubric cambie de tamaño. **El objetivo del hill
climbing es 10/10**: mientras una variante no saque 10, hay un criterio que
todavía no se cumple siempre, y ese criterio dice qué línea de `CLAUDE.md`
escribir.

Un criterio puede estar marcado **`Fallo automático: sí`** en el rubric. Si saca
0, el total de ese candidato es 0, haya hecho bien todo lo demás. Es para las
reglas que no admiten grados: editar un PRD publicado no es "un poco peor", es
que el trabajo no sirve.

## Cómo se corre

```bash
# Comparar el CLAUDE.md actual contra uno alternativo
python3 evals/run.py \
  --nombre playbook-a-mas-corto \
  --rubric evals/rubrics/convencion-prds.md \
  --instruccion evals/prompts/cerrar-decision.md \
  --variante actual=actual \
  --variante corta=evals/variantes/claude-md-corto.md \
  --modelo sonnet
```

`--variante <etiqueta>=<ruta|actual>`: `actual` deja el repo tal cual y una ruta
reemplaza el archivo bajo prueba (`--archivo-variante`, por defecto `CLAUDE.md`).
Repetir al menos dos veces. Por convención los archivos de variante van en
`evals/variantes/`, que no existe hasta que escribas la primera.

Banderas que conviene conocer:

| Bandera | Para qué |
|---|---|
| `--solo-preparar` | Arma las copias, imprime las rutas y para. No gasta un peso. Es como se revisa el aislamiento antes de una corrida cara. |
| `--sin-juez` | Corre los candidatos y guarda los transcripts sin puntuar. Para iterar el rubric sobre transcripts ya pagados. |
| `--semilla N` | Fija el barajado A/B y los nombres de carpeta. Repetible. |
| `--conservar` | No borra las copias temporales; sirve para abrir el repo del candidato y mirar qué hizo. |
| `--presupuesto-usd` | Techo de gasto por candidato (`--max-budget-usd` de Claude Code). Por defecto 10. |
| `--timeout-candidato` | Segundos antes de cortar. Por defecto 2700. Un candidato cortado queda marcado `expirado` y el juez lo ve. |
| `--modelo` / `--modelo-juez` / `--esfuerzo-juez` | Modelos de cada lado. |

Para repetir la corrida de humo tal cual quedó guardada:

```bash
python3 evals/run.py --nombre humo-actual-vs-actual \
  --rubric evals/rubrics/convencion-prds.md \
  --instruccion evals/prompts/cerrar-decision.md \
  --variante actual-1=actual --variante actual-2=actual \
  --modelo sonnet --presupuesto-usd 8 --semilla 11
```

### Qué queda escrito

- `evals/resultados/<fecha>-<nombre>.json` — puntaje y justificación por
  criterio, evidencia citada, total normalizado a 10, costo, divergencia entre
  candidatos y un `resumen` legible. **Esto sí se versiona.**
- `evals/resultados/<fecha>-<nombre>/` — transcripts `.jsonl`, diffs,
  `prompt-del-juez.txt`, eventos del juez. Pesado y ruidoso: lo ignora
  `.gitignore`. Se borra sin culpa; el JSON es el registro.

## Cuánto cuesta una corrida

Medido en la corrida de humo del 2026-10-04: dos candidatos con `sonnet`
escribiendo un PRD completo, y de juez el modelo por defecto de `codex`
—`gpt-6.1-sol` ese día— con esfuerzo `medium`.

| Partida | Observado |
|---|---|
| Candidatos (2 × `sonnet`) | **1,81 USD** en total (1,09 y 0,72) |
| Juez | **31.709** tokens de entrada y **2.214** de salida — centavos |
| Reloj | **5,5 minutos** de punta a punta; los candidatos corren en paralelo, así que N=4 no tarda el doble |
| Total | **≈ 1,9 USD por corrida de dos candidatos** |

> Esos números se midieron cuando `make verify` era solo
> `scripts/verify_prds.py`. Desde F1-01, `verify` además instala dependencias y
> corre lint, tipos y pruebas: cada candidato que lo corra —y el rubric premia
> que lo corra— se lleva varios minutos de reloj y necesita red para el `npm
> ci`. El costo en tokens casi no se mueve, el reloj sí. Vuelve a medir antes de
> citar estas cifras para una tanda grande.

Regla de bolsillo: **~0,9 USD por candidato con `sonnet`** en una tarea de este
tamaño; con `opus` hay que contar entre tres y cinco veces eso. El expediente que
recibe el juez crece con el largo de la sesión, no con el número de candidatos:
dos transcripts dieron 1,0 MB en bruto, de los que el expediente destila 64 KB.

## Cuándo NO correr esto

- **Para decidir si un PRD quedó bien.** Esto mide proceso. La calidad del
  contenido la juzga una persona leyendo el PRD, o la lectura adversarial del
  paso 7 del Playbook A.
- **Con una sola variante.** No hay nada que comparar; la herramienta aborta.
- **Para cambios de `CLAUDE.md` que no cambian comportamiento** — arreglar un
  enlace roto, reordenar una sección sin tocar lo que pide. Dos corridas cuestan
  más que el cambio y el resultado va a caer dentro del ruido.
- **Cuando no puedes escribir el rubric primero.** Si no sabes qué
  comportamiento observable quieres mover, la corrida te va a devolver un número
  y ninguna acción. El rubric se escribe antes de tocar `CLAUDE.md`, no después
  de ver el resultado.
- **Con una diferencia esperada chica y N=2.** Ver abajo: el piso de ruido es de
  casi un punto. Para diferencias menores a eso hay que subir N, y ahí el costo
  manda.
- **Sin red o sin la key de OpenAI.** Los candidatos y el juez son llamadas a la
  API; no hay modo offline.

## Qué tan ruidosa es la medición

La corrida de humo del 2026-10-04 corrió **la misma versión contra sí misma**: si
el harness y el rubric fueran perfectos, las dos notas serían idénticas, y todo
lo que las separe es ruido del juez y varianza del modelo.

Resultado: **8,3 contra 7,5 — 0,8 puntos de diferencia**, debajo del umbral de
1 punto. El único criterio que divergió fue **C-5** (corrió `make verify` y pegó
su salida): 2 contra 1.

La divergencia resultó real y no del rubric. El candidato que sacó 1 cerró su
última corrida con `make verify 2>&1 | tail -3` y después pegó en su mensaje seis
líneas de salida: el juez no pudo acreditar que lo pegado saliera de la última
corrida, y aplicó la regla de que el mensaje de cierre no es prueba. El criterio
distinguió exactamente lo que tenía que distinguir.

Consecuencias prácticas:

- **Una diferencia menor a 1 punto sobre 10 con N=2 no es una señal.** Para
  promover un cambio de `CLAUDE.md` con esa diferencia hay que repetir la corrida
  con otra semilla, o subir N.
- Si una corrida futura diverge más de 1 punto entre dos candidatos iguales, el
  rubric se volvió ambiguo: el JSON trae `criterios_divergentes` con el ID
  exacto, y ese criterio se reescribe antes de concluir nada.

## Supuestos y límites conocidos

Están acá y no en la conversación, porque un supuesto no escrito es un bug.

1. **El Playbook C vive dentro de `CLAUDE.md`, y nombra las palabras prohibidas.**
   El candidato lee "rubric", "juez", "eval" en su propio archivo de
   instrucciones. No se puede evitar sin editar el artefacto que se está midiendo,
   así que no se evita: `run.py` lo reporta como **aviso** al arrancar (el corte
   duro aplica solo a lo que el harness aporta). Mitiga que el texto habla de
   evaluar *cambios a CLAUDE.md* en abstracto, no de esta corrida.
2. **El juez ve el diff completo, no el PRD renderizado.** Para criterios sobre
   el contenido del PRD (C-4, C-6) eso alcanza; para criterios sobre la prosa, no
   lo intentes.
3. **`make verify` no se corre del lado del harness.** Que el verificador pase no
   es un criterio: el criterio es que el candidato lo corriera y pegara la salida.
   Un PRD que no pasa `verify` y un candidato que lo esconde se distinguen en C-5.
4. **La comparación es válida dentro de una corrida, no entre corridas.** El
   modelo, su versión y el commit base cambian; por eso el JSON guarda los tres.
   No compares el número de hoy con el de marzo.
5. **N=2 es el default porque es lo que se paga sin pensarlo.** No es
   estadística; es una señal con un piso de ruido medido. Está escrito arriba
   cuál es ese piso.
6. **El rubric y la instrucción se versionan juntos con el resultado** (el JSON
   guarda la ruta del rubric y el `sha256` de la instrucción). Cambiar cualquiera
   de los dos invalida la comparación con las corridas anteriores.
