#!/usr/bin/env python3
"""Verifica la convención de PRDs de PAGAYA. Solo biblioteca estándar.

Uso: python3 scripts/verify_prds.py [--base <ref-git>]

Comprueba, y falla con código 1 si algo no se cumple:
  1. Numeración contigua desde 001, sin duplicados.
  2. Encabezado con Versión, Estado, Fecha y "Reemplaza a"; la versión coincide
     con el nombre del archivo y "Reemplaza a" apunta al PRD anterior.
  3. Todo PRD desde el 002 abre con "## 0. Cambios en esta versión" y sus
     bloques Se agregó / Se modificó / Se eliminó / Sin cambios.
  4. El índice de prds/README.md lista todos los PRDs, marca exactamente uno
     como Vigente y es el de número más alto. Los anexos están enlazados.
  5. Inmutabilidad: ningún PRD que ya exista en la referencia base cambió.
  6. El backlog en docs/ no cita IDs de requisito que no existan en los PRDs.
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PRDS = RAIZ / "prds"
DOCS = RAIZ / "docs"
PATRON_PRD = re.compile(r"^PRD-(\d{3})-[a-z0-9-]+\.md$")
PATRON_RF = re.compile(r"\bRF-[CMA]-\d{2}\b")

fallos: list[str] = []
ok: list[str] = []


def falla(msg: str) -> None:
    fallos.append(msg)


def pasa(msg: str) -> None:
    ok.append(msg)


def git(*args: str) -> str | None:
    try:
        return subprocess.run(
            ["git", *args], cwd=RAIZ, check=True, capture_output=True, text=True
        ).stdout
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def prds_ordenados() -> list[tuple[int, Path]]:
    encontrados = []
    for p in sorted(PRDS.glob("PRD-*.md")):
        m = PATRON_PRD.match(p.name)
        if not m:
            falla(f"{p.name}: el nombre no sigue PRD-NNN-slug-en-minusculas.md")
            continue
        encontrados.append((int(m.group(1)), p))
    return sorted(encontrados)


def check_numeracion(prds: list[tuple[int, Path]]) -> None:
    numeros = [n for n, _ in prds]
    if not numeros:
        falla("no hay PRDs en prds/")
        return
    esperados = list(range(1, len(numeros) + 1))
    if numeros != esperados:
        falla(f"numeración no contigua desde 001: {numeros}")
    else:
        pasa(f"numeración contigua 001..{numeros[-1]:03d}")


def campo(texto: str, nombre: str) -> str | None:
    m = re.search(rf"^\|\s*\*\*{re.escape(nombre)}\*\*\s*\|\s*(.+?)\s*\|\s*$", texto, re.M)
    return m.group(1) if m else None


def check_encabezado(n: int, p: Path, texto: str) -> None:
    for nombre in ("Versión", "Estado", "Fecha", "Reemplaza a"):
        if campo(texto, nombre) is None:
            falla(f"{p.name}: falta la fila **{nombre}** en la tabla de encabezado")
    version = campo(texto, "Versión") or ""
    if not version.startswith(f"{n:03d}"):
        falla(f"{p.name}: Versión dice '{version}', se esperaba '{n:03d}'")
    fecha = campo(texto, "Fecha") or ""
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", fecha):
        falla(f"{p.name}: Fecha '{fecha}' no tiene formato AAAA-MM-DD")
    reemplaza = campo(texto, "Reemplaza a") or ""
    if n == 1:
        if reemplaza not in ("—", "-", ""):
            falla(f"{p.name}: el PRD base no debe reemplazar a nadie (dice '{reemplaza}')")
    elif f"PRD-{n - 1:03d}" not in reemplaza:
        falla(f"{p.name}: 'Reemplaza a' debe nombrar PRD-{n - 1:03d}, dice '{reemplaza}'")


def check_seccion_cambios(n: int, p: Path, texto: str) -> None:
    tiene = "## 0. Cambios en esta versión" in texto
    if n == 1:
        if tiene:
            falla(f"{p.name}: el PRD base no lleva sección de cambios")
        return
    if not tiene:
        falla(f"{p.name}: falta '## 0. Cambios en esta versión'")
        return
    cuerpo = texto.split("## 0. Cambios en esta versión", 1)[1]
    cuerpo = re.split(r"^## 1\.", cuerpo, maxsplit=1, flags=re.M)[0]
    for bloque in ("### Se agregó", "### Se modificó", "### Se eliminó", "**Sin cambios:**"):
        if bloque not in cuerpo:
            falla(f"{p.name}: en '## 0.' falta el bloque '{bloque}'")
    if "**Motivo del cambio:**" not in cuerpo:
        falla(f"{p.name}: en '## 0.' falta '**Motivo del cambio:**'")


def check_indice(prds: list[tuple[int, Path]]) -> None:
    readme = PRDS / "README.md"
    if not readme.exists():
        falla("falta prds/README.md")
        return
    texto = readme.read_text(encoding="utf-8")
    vigentes = []
    for n, p in prds:
        fila = re.search(rf"^\|\s*\[PRD-{n:03d}\]\({re.escape(p.name)}\)\s*\|(.+)$", texto, re.M)
        if not fila:
            falla(f"índice: no hay fila para {p.name}")
            continue
        celdas = [c.strip() for c in fila.group(1).split("|")]
        estado = celdas[1] if len(celdas) > 1 else ""
        if estado == "Vigente":
            vigentes.append(n)
    if len(vigentes) != 1:
        falla(f"índice: debe haber exactamente un PRD 'Vigente', hay {len(vigentes)}: {vigentes}")
    elif vigentes[0] != prds[-1][0]:
        falla(f"índice: el Vigente es PRD-{vigentes[0]:03d} pero el más alto es PRD-{prds[-1][0]:03d}")
    else:
        pasa(f"índice completo; vigente PRD-{vigentes[0]:03d}")
    anexos = PRDS / "anexos"
    if anexos.is_dir():
        for a in sorted(anexos.glob("*.md")):
            if f"anexos/{a.name}" not in texto:
                falla(f"índice: el anexo {a.name} no está enlazado en prds/README.md")


def check_inmutabilidad(prds: list[tuple[int, Path]], base: str | None) -> None:
    candidatos = [base] if base else []
    candidatos += ["origin/main", "origin/HEAD", "@{upstream}"]
    ref = None
    for c in candidatos:
        if c and git("rev-parse", "--verify", "--quiet", c) is not None:
            ref = c
            break
    if ref is None:
        falla("inmutabilidad: no hay referencia base (usa --base <ref> o configura upstream)")
        return
    listado = git("ls-tree", "-r", "--name-only", ref, "prds/") or ""
    publicados = [l for l in listado.splitlines() if PATRON_PRD.match(Path(l).name)]
    cambiados = []
    for rel in publicados:
        original = git("show", f"{ref}:{rel}")
        actual = RAIZ / rel
        if not actual.exists():
            cambiados.append(f"{rel} (eliminado)")
        elif original != actual.read_text(encoding="utf-8"):
            cambiados.append(rel)
    if cambiados:
        for c in cambiados:
            falla(f"inmutabilidad: {c} ya estaba publicado en {ref} y cambió")
    else:
        pasa(f"inmutabilidad: {len(publicados)} PRDs publicados en {ref} intactos")


def check_citas_backlog(prds: list[tuple[int, Path]]) -> None:
    if not DOCS.is_dir():
        return
    definidos = set()
    for _, p in prds:
        definidos |= set(PATRON_RF.findall(p.read_text(encoding="utf-8")))
    for d in sorted(DOCS.glob("*.md")):
        citados = set(PATRON_RF.findall(d.read_text(encoding="utf-8")))
        huerfanos = sorted(citados - definidos)
        if huerfanos:
            falla(f"docs/{d.name}: cita RF que no existen en ningún PRD: {', '.join(huerfanos)}")
        else:
            pasa(f"docs/{d.name}: {len(citados)} RF citados, todos existen")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", help="referencia git contra la que se verifica la inmutabilidad")
    args = ap.parse_args()

    prds = prds_ordenados()
    check_numeracion(prds)
    for n, p in prds:
        texto = p.read_text(encoding="utf-8")
        check_encabezado(n, p, texto)
        check_seccion_cambios(n, p, texto)
    if prds:
        pasa(f"encabezado y sección de cambios revisados en {len(prds)} PRDs")
    check_indice(prds)
    check_inmutabilidad(prds, args.base)
    check_citas_backlog(prds)

    for linea in ok:
        print(f"  ok   {linea}")
    for linea in fallos:
        print(f"  FALLA {linea}")
    print(f"\nverify: {len(ok)} ok, {len(fallos)} fallos")
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
