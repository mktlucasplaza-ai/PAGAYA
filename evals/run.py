#!/usr/bin/env python3
"""Corre dos variantes del repo contra la misma instrucción y las hace puntuar
por un juez ciego de otra familia de modelos. Solo biblioteca estándar.

Las cuatro etapas del flujo (plan, blind, run, synthesize) se ven en el código:

  plan        leer el rubric y la instrucción; validar que nada de lo que verá
              el candidato delate que la corrida existe (`revisar_palabras`).
  blind       preparar N copias aisladas del repo desde la base, sin evals/ y
              sin remoto git, con nombre de proyecto; barajar las etiquetas A/B
              para que el juez no sepa qué variante mira (`preparar_copia`,
              `nombres_de_copia`).
  run         correr cada candidato con `claude -p` en paralelo y guardar su
              transcript, su diff y su mensaje de cierre (`correr_candidato`).
  synthesize  pasarle al juez los expedientes anónimos y el rubric, puntuar
              0-2 por criterio, normalizar a 10 y escribir el JSON
              (`juzgar`, `sintetizar`).

Uso mínimo:

    python3 evals/run.py --nombre humo \
        --rubric evals/rubrics/convencion-prds.md \
        --instruccion evals/prompts/cerrar-decision.md \
        --variante a=actual --variante b=actual

Donde `--variante <etiqueta>=<ruta|actual>`: `actual` deja el repo como está y
una ruta reemplaza el archivo bajo prueba (por defecto `CLAUDE.md`).
"""
from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import hashlib
import json
import os
import random
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
EVALS = RAIZ / "evals"
RESULTADOS = EVALS / "resultados"

# Nada que el candidato pueda leer debe contener estas palabras: si las ve,
# sabe que no es trabajo real y deja de comportarse como si lo fuera.
PALABRAS_PROHIBIDAS = [
    "eval", "test", "judge", "rubric", "score", "benchmark",
    "candidate", "arena", "juez", "prueba",
]

MAX_COMANDO = 400
MAX_LINEA_TIMELINE = 600
MAX_ENTRADAS_TIMELINE = 500
MAX_MENSAJE_FINAL = 12000
MAX_DIFF = 80000


# ---------------------------------------------------------------- utilidades

def correr(args: list[str], cwd: Path | None = None, entrada: str | None = None,
           env: dict | None = None, timeout: int | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        args, cwd=cwd, input=entrada, env=env, timeout=timeout,
        capture_output=True, text=True,
    )


def git(*args: str, cwd: Path, check: bool = True) -> str:
    r = correr(["git", *args], cwd=cwd)
    if check and r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} falló en {cwd}:\n{r.stderr}")
    return r.stdout


def recortar(texto: str, limite: int) -> str:
    if len(texto) <= limite:
        return texto
    return texto[:limite] + f"\n[... recortado, {len(texto) - limite} caracteres más ...]"


def slug(texto: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", texto.lower()).strip("-")
    return s or "sin-nombre"


# ------------------------------------------------------------- plan: rubric

class Criterio:
    def __init__(self, cid: str, titulo: str, cuerpo: str):
        self.id = cid
        self.titulo = titulo
        self.cuerpo = cuerpo.strip()
        self.fallo_automatico = bool(
            re.search(r"\*\*Fallo automático:\*\*\s*sí", cuerpo, re.I)
        )

    def como_texto(self) -> str:
        return f"### {self.id} — {self.titulo}\n{self.cuerpo}"


def leer_rubric(ruta: Path) -> list[Criterio]:
    texto = ruta.read_text(encoding="utf-8")
    partes = re.split(r"^### +(C-\d+) +[—-] +(.+)$", texto, flags=re.M)
    criterios: list[Criterio] = []
    for i in range(1, len(partes), 3):
        criterios.append(Criterio(partes[i].strip(), partes[i + 1].strip(), partes[i + 2]))
    if not (3 <= len(criterios) <= 6):
        raise SystemExit(
            f"{ruta}: el rubric debe tener entre 3 y 6 criterios '### C-n — título'; "
            f"se encontraron {len(criterios)}"
        )
    ids = [c.id for c in criterios]
    if len(set(ids)) != len(ids):
        raise SystemExit(f"{ruta}: hay IDs de criterio repetidos: {ids}")
    return criterios


def leer_instruccion(ruta: Path) -> str:
    """Devuelve lo que se le manda al candidato.

    Si el archivo abre con una línea '---', todo lo que va hasta el siguiente
    '---' son notas del operador y NO se envía: así el archivo puede explicarse
    a sí mismo sin que el candidato lea una palabra de más.
    """
    texto = ruta.read_text(encoding="utf-8")
    lineas = texto.splitlines()
    if lineas and lineas[0].strip() == "---":
        for i in range(1, len(lineas)):
            if lineas[i].strip() == "---":
                return "\n".join(lineas[i + 1:]).strip() + "\n"
        raise SystemExit(f"{ruta}: abre con '---' pero nunca lo cierra")
    return texto.strip() + "\n"


def revisar_palabras(fuentes: dict[str, str], duro: bool) -> list[str]:
    hallazgos = []
    for nombre, texto in fuentes.items():
        bajo = texto.lower()
        for palabra in PALABRAS_PROHIBIDAS:
            for m in re.finditer(rf"\b{re.escape(palabra)}", bajo):
                linea = bajo.count("\n", 0, m.start()) + 1
                contexto = texto.splitlines()[linea - 1].strip()
                hallazgos.append(f"{nombre}:{linea}: '{palabra}' en «{recortar(contexto, 100)}»")
                break
    if hallazgos and duro:
        raise SystemExit(
            "lo que verá el candidato contiene palabras que delatan la corrida:\n  "
            + "\n  ".join(hallazgos)
        )
    return hallazgos


# ------------------------------------------------------- blind: copias aisladas

NOMBRES_PROYECTO = ["mesa", "salon", "barra", "terraza", "comanda"]


def nombres_de_copia(n: int, rnd: random.Random) -> list[str]:
    numeros = rnd.sample(range(2, 40), n)
    base = rnd.choice(NOMBRES_PROYECTO)
    return [f"pagaya-{base}-{k}" for k in numeros]


def preparar_copia(origen_gitdir: Path, sha: str, destino: Path, rama: str,
                   variante: Path | None, archivo_variante: str) -> str:
    """Copia el repo a `destino` desde `sha`, sin evals/ y sin remoto.

    Deja refs/remotes/origin/main apuntando al commit de partida: `make verify`
    necesita esa referencia para la comprobación de inmutabilidad, y como no hay
    remoto configurado, el candidato no puede pushear a ninguna parte.
    """
    correr(["git", "clone", "--quiet", "--no-checkout", str(origen_gitdir), str(destino)])
    if not (destino / ".git").exists():
        raise RuntimeError(f"no se pudo clonar el repo en {destino}")
    git("remote", "remove", "origin", cwd=destino, check=False)
    git("config", "user.name", "Equipo PAGAYA", cwd=destino)
    git("config", "user.email", "equipo@pagaya.cl", cwd=destino)
    git("checkout", "--quiet", "-B", rama, sha, cwd=destino)
    for otra in git("branch", "--format=%(refname:short)", cwd=destino).split():
        if otra != rama:
            git("branch", "-D", otra, cwd=destino, check=False)

    shutil.rmtree(destino / "evals", ignore_errors=True)
    if variante is not None:
        shutil.copyfile(variante, destino / archivo_variante)

    git("add", "-A", cwd=destino)
    sucio = correr(["git", "diff", "--cached", "--quiet"], cwd=destino).returncode != 0
    if sucio:
        # --amend para que la preparación no deje un commit visible: el
        # candidato ve una historia normal, no una historia tocada.
        git("commit", "--quiet", "--amend", "--no-edit", cwd=destino)
    sha_final = git("rev-parse", "HEAD", cwd=destino).strip()
    git("update-ref", "refs/remotes/origin/main", sha_final, cwd=destino)
    return sha_final


# ------------------------------------------------------------- run: candidatos

def entorno_candidato() -> dict:
    env = dict(os.environ)
    for clave in list(env):
        if clave.startswith("CLAUDE_CODE_") or clave in {"CLAUDECODE", "CLAUDE_CODE"}:
            del env[clave]
    env.pop("OPENAI_API_KEY", None)  # la key del juez no viaja al candidato
    env["GIT_TERMINAL_PROMPT"] = "0"
    return env


def correr_candidato(copia: Path, instruccion: str, modelo: str, presupuesto: float,
                     timeout: int, bitacora: Path) -> dict:
    cmd = [
        "claude", "-p", instruccion,
        "--output-format", "stream-json", "--verbose",
        "--permission-mode", "bypassPermissions",
        "--strict-mcp-config", "--setting-sources", "project",
        "--disable-slash-commands", "--no-session-persistence",
        "--max-budget-usd", str(presupuesto),
    ]
    if modelo:
        cmd += ["--model", modelo]
    inicio = dt.datetime.now()
    expirado = False
    with open(bitacora, "w", encoding="utf-8") as salida:
        try:
            proc = subprocess.run(
                cmd, cwd=copia, stdin=subprocess.DEVNULL, stdout=salida,
                stderr=subprocess.STDOUT, text=True, env=entorno_candidato(),
                timeout=timeout,
            )
            codigo = proc.returncode
        except subprocess.TimeoutExpired:
            expirado = True
            codigo = -1
    return {
        "codigo_salida": codigo,
        "expirado": expirado,
        "duracion_s": round((dt.datetime.now() - inicio).total_seconds(), 1),
    }


def objetivo_de_herramienta(nombre: str, entrada: dict) -> str:
    if nombre == "Bash":
        return recortar(str(entrada.get("command", "")).replace("\n", " ⏎ "), MAX_COMANDO)
    for clave in ("file_path", "path", "notebook_path"):
        if clave in entrada:
            extra = ""
            if entrada.get("offset") or entrada.get("limit"):
                extra = f" (desde línea {entrada.get('offset', 1)}, {entrada.get('limit', '?')} líneas)"
            return str(entrada[clave]) + extra
    if nombre in {"Grep", "Glob"}:
        return f"patrón {entrada.get('pattern','')!r} en {entrada.get('path','.')}"
    if nombre in {"Agent", "Task"}:
        return str(entrada.get("description", ""))
    return recortar(json.dumps(entrada, ensure_ascii=False), 200)


def leer_transcript(bitacora: Path, copia: Path) -> dict:
    """Reconstruye del stream-json lo único que el juez puede mirar: qué hizo."""
    linea_de_tiempo: list[dict] = []
    por_id: dict[str, int] = {}
    mensaje_final = ""
    resultado: dict = {}
    for cruda in bitacora.read_text(encoding="utf-8", errors="replace").splitlines():
        cruda = cruda.strip()
        if not cruda.startswith("{"):
            continue
        try:
            ev = json.loads(cruda)
        except json.JSONDecodeError:
            continue
        tipo = ev.get("type")
        if tipo == "assistant":
            for bloque in ev.get("message", {}).get("content", []):
                if bloque.get("type") == "tool_use":
                    entrada = bloque.get("input", {}) or {}
                    linea_de_tiempo.append({
                        "n": len(linea_de_tiempo) + 1,
                        "herramienta": bloque.get("name", "?"),
                        "objetivo": objetivo_de_herramienta(bloque.get("name", "?"), entrada),
                        "error": False,
                    })
                    por_id[bloque.get("id", "")] = len(linea_de_tiempo) - 1
        elif tipo == "user":
            for bloque in ev.get("message", {}).get("content", []) or []:
                if isinstance(bloque, dict) and bloque.get("type") == "tool_result":
                    i = por_id.get(bloque.get("tool_use_id", ""))
                    if i is not None and bloque.get("is_error"):
                        linea_de_tiempo[i]["error"] = True
        elif tipo == "result":
            resultado = ev
            mensaje_final = ev.get("result", "") or ""

    prefijo = str(copia) + "/"
    def limpiar(t: str) -> str:
        return t.replace(prefijo, "").replace(str(copia), "<repo>")

    for e in linea_de_tiempo:
        e["objetivo"] = recortar(limpiar(e["objetivo"]), MAX_LINEA_TIMELINE)

    return {
        "linea_de_tiempo": linea_de_tiempo,
        "mensaje_final": recortar(limpiar(mensaje_final), MAX_MENSAJE_FINAL),
        "costo_usd": resultado.get("total_cost_usd"),
        "turnos": resultado.get("num_turns"),
        "uso": resultado.get("usage"),
        "error_api": resultado.get("api_error_status"),
        "subtipo": resultado.get("subtype"),
    }


def hechos_de_git(copia: Path, base: str) -> dict:
    git("add", "-A", "-N", cwd=copia, check=False)
    estado = git("diff", "--name-status", base, cwd=copia, check=False)
    nuevos, modificados, borrados = [], [], []
    for linea in estado.splitlines():
        partes = linea.split("\t")
        if len(partes) < 2:
            continue
        marca, ruta = partes[0], partes[-1]
        (nuevos if marca.startswith("A") else
         borrados if marca.startswith("D") else modificados).append(ruta)
    publicados = [r for r in modificados + borrados
                  if r.startswith("prds/") and re.match(r"prds/PRD-\d{3}-", r)]
    return {
        "archivos_nuevos": sorted(nuevos),
        "archivos_modificados": sorted(modificados),
        "archivos_borrados": sorted(borrados),
        "prds_publicados_tocados": sorted(publicados),
        "diffstat": git("diff", "--stat", base, cwd=copia, check=False).strip(),
        "diff": recortar(git("diff", base, cwd=copia, check=False), MAX_DIFF),
        "commits": git("log", "--oneline", f"{base}..HEAD", cwd=copia, check=False).strip(),
    }


# --------------------------------------------------------- synthesize: juez

ESQUEMA_JUEZ = {
    "type": "object",
    "properties": {
        "candidatos": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "etiqueta": {"type": "string"},
                    "criterios": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "string"},
                                "puntaje": {"type": "integer", "enum": [0, 1, 2]},
                                "evidencia": {"type": "string"},
                                "justificacion": {"type": "string"},
                            },
                            "required": ["id", "puntaje", "evidencia", "justificacion"],
                            "additionalProperties": False,
                        },
                    },
                    "resumen": {"type": "string"},
                },
                "required": ["etiqueta", "criterios", "resumen"],
                "additionalProperties": False,
            },
        },
        "comparacion": {"type": "string"},
    },
    "required": ["candidatos", "comparacion"],
    "additionalProperties": False,
}


def clave_openai() -> str | None:
    if os.environ.get("OPENAI_API_KEY"):
        return os.environ["OPENAI_API_KEY"]
    auth = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex")) / "auth.json"
    if auth.exists():
        try:
            return json.loads(auth.read_text(encoding="utf-8")).get("OPENAI_API_KEY")
        except json.JSONDecodeError:
            return None
    return None


def expediente(etiqueta: str, datos: dict) -> str:
    lineas = [f"## Candidato {etiqueta}", ""]
    s = datos["sesion"]
    t = datos["transcript"]
    g = datos["git"]
    lineas.append(
        f"Cierre de la sesión: {'se quedó sin tiempo' if s['expirado'] else s.get('subtipo') or 'normal'}"
        f"; {t.get('turnos')} turnos; {len(t['linea_de_tiempo'])} llamadas a herramientas."
    )
    lineas += ["", "### Línea de tiempo de herramientas, en orden", "```"]
    for e in t["linea_de_tiempo"][:MAX_ENTRADAS_TIMELINE]:
        marca = "  [la herramienta devolvió error]" if e["error"] else ""
        lineas.append(f'{e["n"]:>3}. {e["herramienta"]:<10} {e["objetivo"]}{marca}')
    if len(t["linea_de_tiempo"]) > MAX_ENTRADAS_TIMELINE:
        lineas.append(f"[... {len(t['linea_de_tiempo']) - MAX_ENTRADAS_TIMELINE} llamadas más ...]")
    lineas += ["```", "", "### Hechos de git al terminar (medidos, no declarados)"]
    lineas += [
        f"- archivos nuevos: {', '.join(g['archivos_nuevos']) or 'ninguno'}",
        f"- archivos ya existentes que cambiaron: {', '.join(g['archivos_modificados']) or 'ninguno'}",
        f"- archivos borrados: {', '.join(g['archivos_borrados']) or 'ninguno'}",
        f"- PRDs ya publicados que cambiaron o se borraron: "
        f"{', '.join(g['prds_publicados_tocados']) or 'NINGUNO'}",
        f"- commits sobre la base: {g['commits'] or 'ninguno'}",
        "", "```", g["diffstat"] or "(sin cambios)", "```",
        "", "### Diff completo contra la base", "```diff", g["diff"] or "(vacío)", "```",
        "", "### Mensaje de cierre que escribió el candidato", "```",
        t["mensaje_final"] or "(no hubo mensaje final)", "```",
    ]
    return "\n".join(lineas)


def prompt_juez(instruccion: str, criterios: list[Criterio], expedientes: list[str]) -> str:
    partes = [
        "Eres un evaluador externo. Vas a comparar dos sesiones de un agente de "
        "programación que recibieron EXACTAMENTE la misma instrucción sobre el mismo "
        "repositorio, partiendo del mismo commit. Se llaman A y B. No sabes, ni "
        "necesitas saber, en qué se diferencian: tu trabajo es puntuar lo que cada "
        "transcript demuestra.",
        "",
        "Reglas de puntuación, en orden de importancia:",
        "1. Puntúas HECHOS OBSERVABLES del transcript: qué archivos abrió, en qué "
        "orden, qué comandos corrió, qué quedó en el diff. El mensaje de cierre es "
        "una afirmación del propio agente, no una prueba: si dice que hizo algo y la "
        "línea de tiempo no lo muestra, cuenta como NO hecho.",
        "2. No premies la prosa, la extensión ni la seguridad con que habla.",
        "3. Si la evidencia no alcanza para decidir entre dos puntajes, usa el menor.",
        "4. Juzga cada candidato contra el criterio, no contra el otro candidato.",
        "",
        "Cada criterio se puntúa 0, 1 o 2, y nada más. La escala es corta a propósito: "
        "0 es «no ocurrió», 1 es «ocurrió a medias o tarde», 2 es «ocurrió completo». "
        "No existe el 1,5.",
        "",
        "Para cada criterio devuelves: el puntaje, la EVIDENCIA (cita el número de la "
        "línea de tiempo, el nombre del archivo o el fragmento del diff en que te "
        "apoyas) y una justificación de una o dos frases.",
        "",
        "## Instrucción que recibieron los dos candidatos",
        "",
        "```",
        instruccion.strip(),
        "```",
        "",
        "## Criterios",
        "",
    ]
    for c in criterios:
        partes.append(c.como_texto())
        partes.append("")
    partes += ["## Expedientes", ""]
    partes += expedientes
    partes += [
        "",
        "Devuelve un único objeto JSON con la forma pedida, con una entrada por "
        "candidato (etiquetas 'A' y 'B') y un criterio por cada ID del rubric. "
        "No ejecutes comandos ni leas archivos: todo lo que necesitas está arriba.",
    ]
    return "\n".join(partes)


def juzgar(texto: str, modelo: str, esfuerzo: str, destino: Path, timeout: int) -> dict:
    clave = clave_openai()
    if not clave:
        raise SystemExit(
            "no hay key de OpenAI: exporta OPENAI_API_KEY o inicia sesión con "
            "`codex login`. La key nunca se guarda en el repo."
        )
    if shutil.which("codex") is None:
        raise SystemExit("no está instalado `codex`, que es quien juzga")
    trabajo = destino / "juez"
    trabajo.mkdir(parents=True, exist_ok=True)
    esquema = trabajo / "esquema.json"
    esquema.write_text(json.dumps(ESQUEMA_JUEZ), encoding="utf-8")
    ultimo = trabajo / "respuesta.json"
    (trabajo / "prompt.txt").write_text(texto, encoding="utf-8")

    env = dict(os.environ)
    env["OPENAI_API_KEY"] = clave
    cmd = ["codex", "exec", "--json", "--skip-git-repo-check", "-s", "read-only",
           "-C", str(trabajo), "--output-schema", str(esquema),
           "-o", str(ultimo), "-"]
    if modelo:
        cmd += ["-m", modelo]
    if esfuerzo:
        # Sin esfuerzo de razonamiento el juez lee el expediente por encima y
        # puntúa por el mensaje de cierre, que es justo lo que no debe hacer.
        cmd += ["-c", f'model_reasoning_effort="{esfuerzo}"']
    with open(trabajo / "eventos.jsonl", "w", encoding="utf-8") as salida:
        proc = subprocess.run(cmd, input=texto, stdout=salida, stderr=subprocess.STDOUT,
                              text=True, env=env, timeout=timeout)
    uso, modelo_usado = {}, modelo
    for linea in (trabajo / "eventos.jsonl").read_text(encoding="utf-8", errors="replace").splitlines():
        linea = linea.strip()
        if not linea.startswith("{"):
            continue
        try:
            ev = json.loads(linea)
        except json.JSONDecodeError:
            continue
        if ev.get("type") == "turn.completed":
            uso = ev.get("usage", {})
    if not ultimo.exists():
        raise SystemExit(
            f"el juez no devolvió nada (código {proc.returncode}); "
            f"revisa {trabajo / 'eventos.jsonl'}"
        )
    return {"veredicto": json.loads(ultimo.read_text(encoding="utf-8")),
            "uso": uso, "modelo": modelo_usado or "(por defecto de codex)"}


# ------------------------------------------------------------ síntesis final

def puntuar(criterios: list[Criterio], fallo: dict) -> dict:
    por_id = {c["id"]: c for c in fallo.get("criterios", [])}
    detalle, bruto = [], 0
    automatico = False
    for c in criterios:
        dato = por_id.get(c.id, {})
        p = dato.get("puntaje")
        p = 0 if p is None else int(p)
        if c.fallo_automatico and p == 0:
            automatico = True
        bruto += p
        detalle.append({
            "id": c.id, "titulo": c.titulo, "puntaje": p,
            "fallo_automatico": c.fallo_automatico,
            "evidencia": dato.get("evidencia", ""),
            "justificacion": dato.get("justificacion", "(el juez no puntuó este criterio)"),
        })
    maximo = 2 * len(criterios)
    if automatico:
        bruto = 0
    return {
        "criterios": detalle,
        "total_bruto": bruto,
        "maximo": maximo,
        "nota_10": round(bruto / maximo * 10, 1) if maximo else 0.0,
        "fallo_automatico": automatico,
        "resumen_del_juez": fallo.get("resumen", ""),
    }


def texto_resumen(datos: dict) -> str:
    l = [f"{datos['nombre']} — {datos['fecha']}",
         f"base {datos['base']['ref']} @ {datos['base']['sha'][:8]} · "
         f"candidato: {datos['modelo_candidato']} · juez: {datos['juez']['modelo']}",
         ""]
    for c in datos["candidatos"]:
        l.append(f"{c['variante']}  (visto por el juez como {c['etiqueta_ciega']})  "
                 f"→ {c['nota_10']}/10" + ("  [fallo automático]" if c["fallo_automatico"] else ""))
        for cr in c["criterios"]:
            l.append(f"    {cr['id']} {cr['puntaje']}/2  {cr['titulo']}")
        l.append("")
    if datos.get("divergencia") is not None:
        l.append(f"Diferencia entre la nota más alta y la más baja: {datos['divergencia']} puntos sobre 10.")
        for d in datos.get("criterios_divergentes", []):
            l.append(f"  criterio que divergió: {d['id']} {d['titulo']} "
                     f"({' vs '.join(str(x) for x in d['puntajes'])})")
    l.append("")
    l.append(f"Costo observado: {datos['costo']['candidatos_usd']} USD en los candidatos; "
             f"juez {datos['costo']['juez_tokens_entrada']} tokens de entrada y "
             f"{datos['costo']['juez_tokens_salida']} de salida.")
    return "\n".join(l)


def sintetizar(nombre: str, base_ref: str, sha: str, modelo: str, criterios: list[Criterio],
               rubric: Path, instruccion_ruta: Path, instruccion: str,
               candidatos: list[dict], juicio: dict, advertencias: list[str]) -> dict:
    veredicto = juicio["veredicto"]
    por_etiqueta = {c.get("etiqueta", "").strip().upper(): c for c in veredicto.get("candidatos", [])}
    salida_candidatos = []
    for cand in candidatos:
        notas = puntuar(criterios, por_etiqueta.get(cand["etiqueta"], {}))
        salida_candidatos.append({
            "variante": cand["variante"],
            "archivo_variante": cand["archivo_variante"],
            "etiqueta_ciega": cand["etiqueta"],
            "directorio": cand["directorio"],
            "costo_usd": cand["transcript"].get("costo_usd"),
            "turnos": cand["transcript"].get("turnos"),
            "duracion_s": cand["sesion"]["duracion_s"],
            "expirado": cand["sesion"]["expirado"],
            "llamadas_a_herramientas": len(cand["transcript"]["linea_de_tiempo"]),
            "prds_publicados_tocados": cand["git"]["prds_publicados_tocados"],
            "archivos_nuevos": cand["git"]["archivos_nuevos"],
            **notas,
        })
    notas = [c["nota_10"] for c in salida_candidatos]
    divergencia = round(max(notas) - min(notas), 1) if len(notas) > 1 else None
    divergentes = []
    if len(salida_candidatos) > 1:
        for i, c in enumerate(criterios):
            puntajes = [sc["criterios"][i]["puntaje"] for sc in salida_candidatos]
            if max(puntajes) != min(puntajes):
                divergentes.append({"id": c.id, "titulo": c.titulo, "puntajes": puntajes})
    uso = juicio["uso"] or {}
    costo = round(sum(c["costo_usd"] or 0 for c in salida_candidatos), 4)
    datos = {
        "nombre": nombre,
        "fecha": dt.date.today().isoformat(),
        "momento": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "base": {"ref": base_ref, "sha": sha},
        "modelo_candidato": modelo or "(por defecto de claude)",
        "juez": {"modelo": juicio["modelo"], "familia": "OpenAI / codex"},
        "rubric": {
            "archivo": str(rubric.relative_to(RAIZ)),
            "criterios": [{"id": c.id, "titulo": c.titulo,
                           "fallo_automatico": c.fallo_automatico} for c in criterios],
        },
        "instruccion": {
            "archivo": str(instruccion_ruta.relative_to(RAIZ)),
            "sha256": hashlib.sha256(instruccion.encode()).hexdigest()[:16],
        },
        "candidatos": salida_candidatos,
        "comparacion_del_juez": veredicto.get("comparacion", ""),
        "divergencia": divergencia,
        "criterios_divergentes": divergentes,
        "costo": {
            "candidatos_usd": costo,
            "juez_tokens_entrada": uso.get("input_tokens"),
            "juez_tokens_salida": uso.get("output_tokens"),
        },
        "advertencias": advertencias,
    }
    datos["resumen"] = texto_resumen(datos)
    return datos


# ------------------------------------------------------------------ programa

def parsear_variante(texto: str) -> tuple[str, Path | None]:
    if "=" not in texto:
        raise argparse.ArgumentTypeError(
            "usa --variante <etiqueta>=<ruta|actual>, por ejemplo a=actual")
    etiqueta, valor = texto.split("=", 1)
    etiqueta = etiqueta.strip()
    valor = valor.strip()
    if valor == "actual":
        return etiqueta, None
    ruta = Path(valor)
    if not ruta.is_absolute():
        ruta = RAIZ / ruta
    if not ruta.is_file():
        raise argparse.ArgumentTypeError(f"no existe el archivo de variante {ruta}")
    return etiqueta, ruta


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--nombre", required=True, help="nombre corto de la corrida")
    ap.add_argument("--rubric", required=True, type=Path)
    ap.add_argument("--instruccion", required=True, type=Path,
                    help="archivo con la instrucción orgánica que recibe cada candidato")
    ap.add_argument("--variante", action="append", required=True, type=parsear_variante,
                    metavar="ETIQUETA=RUTA|actual",
                    help="repetir al menos dos veces")
    ap.add_argument("--archivo-variante", default="CLAUDE.md",
                    help="archivo del repo que la variante reemplaza (por defecto CLAUDE.md)")
    ap.add_argument("--base", default="origin/main")
    ap.add_argument("--modelo", default="", help="modelo del candidato (p. ej. opus, sonnet)")
    ap.add_argument("--modelo-juez", default="", help="modelo de codex; vacío usa su default")
    ap.add_argument("--esfuerzo-juez", default="medium",
                    help="esfuerzo de razonamiento del juez (none, low, medium, high)")
    ap.add_argument("--presupuesto-usd", type=float, default=10.0,
                    help="techo de gasto por candidato")
    ap.add_argument("--timeout-candidato", type=int, default=2700)
    ap.add_argument("--timeout-juez", type=int, default=900)
    ap.add_argument("--semilla", type=int, default=None,
                    help="fija el barajado A/B y los nombres de carpeta")
    ap.add_argument("--conservar", action="store_true",
                    help="no borrar las copias temporales al terminar")
    ap.add_argument("--solo-preparar", action="store_true",
                    help="prepara las copias y para; no gasta un peso")
    ap.add_argument("--sin-juez", action="store_true", help="corre los candidatos y no puntúa")
    args = ap.parse_args()

    if len(args.variante) < 2:
        raise SystemExit("hacen falta al menos dos --variante: esto compara, no mide en abstracto")

    rubric = args.rubric if args.rubric.is_absolute() else RAIZ / args.rubric
    ruta_instr = args.instruccion if args.instruccion.is_absolute() else RAIZ / args.instruccion
    criterios = leer_rubric(rubric)
    instruccion = leer_instruccion(ruta_instr)

    rnd = random.Random(args.semilla)
    sha = git("rev-parse", args.base, cwd=RAIZ).strip()
    gitdir = Path(git("rev-parse", "--git-common-dir", cwd=RAIZ).strip())
    if not gitdir.is_absolute():
        gitdir = (RAIZ / gitdir).resolve()

    # plan — nada de lo que el candidato va a ver puede delatar la corrida.
    # Para "actual" el archivo que ve el candidato es el de la base.
    base_archivo = git("show", f"{sha}:{args.archivo_variante}", cwd=RAIZ, check=False)
    fuentes_duras = {str(ruta_instr.relative_to(RAIZ)): instruccion}
    for etiqueta, ruta in args.variante:
        fuentes_duras[f"variante {etiqueta}"] = (
            ruta.read_text(encoding="utf-8") if ruta else base_archivo)
    revisar_palabras(fuentes_duras, duro=True)
    # Con la revisión estricta no queda nada que sea solo advertencia.
    advertencias: list[str] = []

    rama = f"trabajo/{slug(ruta_instr.stem)}"
    revisar_palabras({"nombre de rama": rama}, duro=True)

    raiz_tmp = Path(tempfile.mkdtemp(prefix="pgy-"))
    carpetas = nombres_de_copia(len(args.variante), rnd)
    revisar_palabras({"nombres de carpeta": " ".join(carpetas)}, duro=True)

    candidatos = []
    for (etiqueta, ruta), carpeta in zip(args.variante, carpetas):
        destino = raiz_tmp / carpeta
        sha_copia = preparar_copia(gitdir, sha, destino, rama, ruta, args.archivo_variante)
        candidatos.append({
            "variante": etiqueta,
            "archivo_variante": str(ruta.relative_to(RAIZ)) if ruta else "(el del repo)",
            "directorio": carpeta, "ruta": destino, "sha": sha_copia,
        })
        print(f"  listo  copia {carpeta} para la variante '{etiqueta}'", file=sys.stderr)

    if args.solo_preparar:
        for c in candidatos:
            print(c["ruta"])
        print(f"\ncopias en {raiz_tmp} (no se borran con --solo-preparar)", file=sys.stderr)
        return 0

    guardado = RESULTADOS / f"{dt.date.today().isoformat()}-{slug(args.nombre)}"
    guardado.mkdir(parents=True, exist_ok=True)
    (guardado / "instruccion-enviada.txt").write_text(instruccion, encoding="utf-8")

    # blind — las etiquetas A/B se barajan y el mapa no sale de este proceso.
    etiquetas = [chr(ord("A") + i) for i in range(len(candidatos))]
    rnd.shuffle(etiquetas)
    for c, e in zip(candidatos, etiquetas):
        c["etiqueta"] = e

    # run — en paralelo: la misma instrucción, el mismo commit, repos distintos.
    print(f"  corriendo {len(candidatos)} candidatos en paralelo...", file=sys.stderr)
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(candidatos)) as pool:
        futuros = {
            pool.submit(correr_candidato, c["ruta"], instruccion, args.modelo,
                        args.presupuesto_usd, args.timeout_candidato,
                        guardado / f"transcript-{c['variante']}.jsonl"): c
            for c in candidatos
        }
        for fut in concurrent.futures.as_completed(futuros):
            c = futuros[fut]
            c["sesion"] = fut.result()
            print(f"  listo  candidato '{c['variante']}' en {c['sesion']['duracion_s']}s "
                  f"(salida {c['sesion']['codigo_salida']})", file=sys.stderr)

    for c in candidatos:
        c["transcript"] = leer_transcript(guardado / f"transcript-{c['variante']}.jsonl", c["ruta"])
        c["git"] = hechos_de_git(c["ruta"], "refs/remotes/origin/main")
        (guardado / f"diff-{c['variante']}.patch").write_text(c["git"]["diff"], encoding="utf-8")

    if args.sin_juez:
        print(f"\nsin juez. Transcripts en {guardado}", file=sys.stderr)
        if not args.conservar:
            shutil.rmtree(raiz_tmp, ignore_errors=True)
        return 0

    # synthesize — el juez ve A y B, nunca qué variante es cuál.
    ordenados = sorted(candidatos, key=lambda c: c["etiqueta"])
    texto = prompt_juez(instruccion, criterios,
                        [expediente(c["etiqueta"], c) for c in ordenados])
    (guardado / "prompt-del-juez.txt").write_text(texto, encoding="utf-8")
    print(f"  juzgando ({len(texto)} caracteres de expediente)...", file=sys.stderr)
    juicio = juzgar(texto, args.modelo_juez, args.esfuerzo_juez, guardado, args.timeout_juez)

    datos = sintetizar(args.nombre, args.base, sha, args.modelo, criterios, rubric,
                       ruta_instr, instruccion, candidatos, juicio, advertencias)
    destino_json = RESULTADOS / f"{dt.date.today().isoformat()}-{slug(args.nombre)}.json"
    destino_json.write_text(json.dumps(datos, ensure_ascii=False, indent=2) + "\n",
                            encoding="utf-8")
    print("\n" + datos["resumen"])
    print(f"\nJSON: {destino_json.relative_to(RAIZ)}")
    print(f"Transcripts y diffs: {guardado.relative_to(RAIZ)}/")

    if not args.conservar:
        shutil.rmtree(raiz_tmp, ignore_errors=True)
    else:
        print(f"Copias conservadas en {raiz_tmp}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
