# yourhq test orchestrator
# Usage:
#   make test          — fast local gate (no Docker, no secrets)
#   make test-lint     — static analysis (tsc, eslint, ruff, shellcheck)
#   make test-build    — Next.js production build (needs network for fonts)
#   make test-db       — database contracts (needs Docker or TEST_DATABASE_URL)
#   make test-coverage — unit tests with coverage reports

# Prefer pinned Node if available via nvm
NVM_NODE := $(HOME)/.nvm/versions/node/v24.15.0/bin
ifneq ($(wildcard $(NVM_NODE)/node),)
  export PATH := $(NVM_NODE):$(PATH)
endif

# Prefer local venv for Python if available
VENV := .venv/bin
ifneq ($(wildcard $(VENV)/python),)
  PYTHON := $(VENV)/python
  PYTEST := $(VENV)/pytest
else
  PYTHON := python3
  PYTEST := python3 -m pytest
endif

UI_DIR := apps/ui
GW_DIR := gateway

.PHONY: test test-ui test-python test-shell test-lint test-build test-db test-coverage ci-fast ci-main

# ── Fast local gate ──────────────────────────────────────────────────

test: test-ui test-python test-shell

test-ui:
	cd $(UI_DIR) && npx vitest run

test-python:
	$(PYTEST) $(GW_DIR)/tests -x -q

test-shell:
	bash $(GW_DIR)/scripts/tests/run-shell-tests.sh

# ── Static analysis ──────────────────────────────────────────────────

test-lint: test-lint-ts test-lint-py test-lint-sh

test-lint-ts:
	cd $(UI_DIR) && npx tsc --noEmit
	cd $(UI_DIR) && npx eslint .

test-lint-py:
	ruff check $(GW_DIR)/ templates/
	ruff format --check $(GW_DIR)/ templates/

test-lint-sh:
	@command -v shellcheck >/dev/null 2>&1 || { echo "shellcheck not found, skipping"; exit 0; }
	shellcheck $(GW_DIR)/scripts/*.sh $(GW_DIR)/entrypoint.sh installer/install.sh

# ── Build gate ───────────────────────────────────────────────────────

test-build:
	cd $(UI_DIR) && npm run build

# ── Database contracts ───────────────────────────────────────────────

test-db:
	bash db/tests/run-db-tests.sh

# ── Coverage ─────────────────────────────────────────────────────────

test-coverage:
	cd $(UI_DIR) && npx vitest run --coverage
	$(PYTEST) $(GW_DIR)/tests -x -q --cov=$(GW_DIR) --cov-report=term-missing

# ── CI composite targets ────────────────────────────────────────────

ci-fast: test-lint test

ci-main: ci-fast test-db
