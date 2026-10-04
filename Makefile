.PHONY: verify

# Verifica la convención de PRDs: numeración, encabezados, sección de cambios,
# índice e inmutabilidad de los PRDs ya publicados. Sale con 1 si algo falla.
verify:
	@python3 scripts/verify_prds.py
