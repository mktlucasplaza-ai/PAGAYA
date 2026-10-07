# `make verify` es la única puerta: lo que pasa acá está listo, lo que no, no.
# Corre, en este orden y deteniéndose en el primer fallo: la convención de PRDs,
# el lint (incluida la frontera entre módulos), el chequeo de tipos y las
# pruebas. Agregar una verificación significa agregarla acá, no en otro comando
# que alguien tiene que acordarse de correr.

.PHONY: verify verificar-prds lint tipos pruebas instalar migrar cargar-piloto limpiar

# El python3 del PATH puede ser de otra arquitectura (en un Mac ARM con un
# python3 x86_64 y sin Rosetta, falla con "Bad CPU type"). Se usa el primer
# intérprete de la lista que realmente ejecute.
# `override` a propósito: si la variable se pudiera pisar desde el entorno o la
# línea de comandos, `PYTHON=true make verify` saldría con 0 sin correr nada.
override PYTHON := $(shell for p in python3 python3.13 python3.12 python3.11 python3.10 /usr/bin/python3; do \
	command -v $$p >/dev/null 2>&1 && $$p -c '' >/dev/null 2>&1 && { echo $$p; break; }; \
	done)
override NPM := $(shell command -v npm 2>/dev/null)

verify: verificar-prds lint tipos pruebas
	@echo
	@echo "verify: todo en verde"

# Verifica la convención de PRDs: numeración, encabezados, sección de cambios,
# índice e inmutabilidad de los PRDs ya publicados. Sale con 1 si algo falla.
verificar-prds:
	@echo "== prds =="
	@test -n "$(PYTHON)" || { echo "no hay un python3 ejecutable en este equipo"; exit 1; }
	@$(PYTHON) scripts/verify_prds.py

lint: instalar
	@echo
	@echo "== lint (incluye la frontera entre módulos de arquitectura.md AT-1) =="
	@$(NPM) run --silent lint

tipos: instalar
	@echo
	@echo "== tipos =="
	@$(NPM) run --silent tipos
	@echo "tsc: sin errores de tipos"

# Las pruebas que necesitan PostgreSQL se omiten si no hay PAGAYA_BD_URL y se
# vuelven obligatorias con PAGAYA_EXIGIR_BD=1, que es lo que pone la integración
# continua. Ver docs/arquitectura.md §8.4.
pruebas: instalar
	@echo
	@echo "== pruebas =="
	@test -n "$$PAGAYA_BD_URL" || echo "   (sin PAGAYA_BD_URL: se omiten las pruebas contra PostgreSQL)"
	@$(NPM) run --silent pruebas

# Instala solo si hace falta. El testigo vive dentro de node_modules, así que
# borrar node_modules vuelve a forzar la instalación.
instalar: node_modules/.instalado
node_modules/.instalado: package.json package-lock.json $(wildcard packages/*/package.json) $(wildcard apps/*/package.json)
	@test -n "$(NPM)" || { echo "no hay npm en este equipo; se necesita Node >= 22.18"; exit 1; }
	@echo "== dependencias =="
	@$(NPM) ci --no-audit --no-fund || $(NPM) install --no-audit --no-fund
	@touch $@

# Aplica las migraciones pendientes al ambiente de PAGAYA_AMBIENTE. No es parte
# de `verify`: verificar no escribe en ninguna base de datos.
migrar: instalar
	@$(NPM) run --silent migrar

# Carga inicial del local piloto (F1-05). Tampoco es parte de `verify`, por lo
# mismo que `migrar`: lo que `verify` revisa del cargador son sus pruebas.
# ARCHIVO es opcional; sin él se usa el ejemplo versionado del repositorio.
# COMANDO es validar (por defecto), plan o cargar. `validar` no necesita base de
# datos; `plan` la lee y `cargar` la escribe, las dos con las migraciones ya
# aplicadas (ver packages/carga-inicial/README.md).
cargar-piloto: instalar
	@node packages/carga-inicial/src/cli.ts $(or $(COMANDO),validar) $(ARCHIVO)

limpiar:
	@rm -rf node_modules
