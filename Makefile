.PHONY: verify

# El python3 del PATH puede ser de otra arquitectura (en un Mac ARM con un
# python3 x86_64 y sin Rosetta, falla con "Bad CPU type"). Se usa el primer
# intérprete de la lista que realmente ejecute.
PYTHON ?= $(shell for p in python3 python3.13 python3.12 python3.11 python3.10 /usr/bin/python3; do \
	command -v $$p >/dev/null 2>&1 && $$p -c '' >/dev/null 2>&1 && { echo $$p; break; }; \
	done)

# Verifica la convención de PRDs: numeración, encabezados, sección de cambios,
# índice e inmutabilidad de los PRDs ya publicados. Sale con 1 si algo falla.
verify:
	@test -n "$(PYTHON)" || { echo "no hay un python3 ejecutable en este equipo"; exit 1; }
	@$(PYTHON) scripts/verify_prds.py
