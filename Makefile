.PHONY: build dev test clean help

BINARY_NAME=aegis
GO=go
GOFLAGS=-v
LDFLAGS=-ldflags="-w -s"

help:
	@echo "Aegis CLI - Build targets:"
	@echo "  make build       - Build optimized binary"
	@echo "  make dev         - Build for development (with debug info)"
	@echo "  make test        - Run tests"
	@echo "  make clean       - Remove build artifacts"
	@echo "  make run-update  - Build and run update demo"

build: deps
	@mkdir -p bin
	$(GO) build $(LDFLAGS) -o bin/$(BINARY_NAME) .
	@echo "✓ Built: bin/$(BINARY_NAME)"

dev: deps
	@mkdir -p bin
	$(GO) build -o bin/$(BINARY_NAME) .
	@echo "✓ Built (dev): bin/$(BINARY_NAME)"

deps:
	$(GO) mod download
	$(GO) mod tidy

test:
	$(GO) test ./... -v

run-update: dev
	./bin/$(BINARY_NAME) update

clean:
	rm -rf bin/
	$(GO) clean
	@echo "✓ Cleaned"

.DEFAULT_GOAL := help
