.PHONY: check frontend-check api-check mcp-check

frontend-check:
	pnpm validate && pnpm test:extension

api-check:
	$(MAKE) -C local-server check

mcp-check:
	$(MAKE) -C mcp check

check: frontend-check api-check mcp-check
