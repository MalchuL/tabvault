.PHONY: check frontend-check mcp-check api-check

frontend-check:
	pnpm validate && pnpm test:extension

mcp-check:
	pnpm --dir mcp-server validate

api-check:
	$(MAKE) -C local-server check

check: frontend-check mcp-check api-check
