.PHONY: check frontend-check api-check

frontend-check:
	pnpm validate && pnpm test:extension

api-check:
	$(MAKE) -C local-server check

check: frontend-check api-check
