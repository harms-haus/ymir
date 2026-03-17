SHELL := /bin/bash

WS_PORT := 7319
VITE_PORT := 5173
BUILD_DIR := build
INSTALL_PREFIX := /usr/local

.PHONY: debug build-prod install-prod clean kill help

help:
	@echo "ymir Makefile targets:"
	@echo "  debug        Kill old processes, rebuild, launch all servers"
	@echo "  build-prod   Build all components to $(BUILD_DIR)/"
	@echo "  install-prod Build and install to $(INSTALL_PREFIX)"
	@echo "  clean        Remove all build artifacts"
	@echo "  kill         Kill processes on configured ports"

kill:
	@echo "[ymir] killing processes on ports $(WS_PORT) and $(VITE_PORT)..."
	-@fuser -k $(WS_PORT)/tcp 2>/dev/null || true
	-@fuser -k $(VITE_PORT)/tcp 2>/dev/null || true

debug: kill
	@echo "[ymir] building rust workspace..."
	@cargo build
	@echo "[ymir] building web client..."
	@npm install --prefix apps/web
	@npm run build --prefix apps/web
	@echo "[ymir] launching servers..."
	@cargo run -p ymir

build-prod: clean
	@echo "[ymir] building rust workspace (release)..."
	@cargo build --release
	@echo "[ymir] building web app..."
	@npm install --prefix apps/web
	@npm run build --prefix apps/web
	@echo "[ymir] building tauri app..."
	@cargo build --release -p ymir-app
	@mkdir -p $(BUILD_DIR)/bin $(BUILD_DIR)/share/ymir/web
	@cp target/release/ymir $(BUILD_DIR)/bin/
	@cp target/release/ymir-ws-server $(BUILD_DIR)/bin/
	@cp -r apps/web/dist/* $(BUILD_DIR)/share/ymir/web/
	@echo "[ymir] build complete → $(BUILD_DIR)/"

install-prod: build-prod
	@echo "[ymir] installing to $(INSTALL_PREFIX)..."
	@install -d $(INSTALL_PREFIX)/bin
	@install -d $(INSTALL_PREFIX)/share/ymir/web
	@install $(BUILD_DIR)/bin/ymir $(INSTALL_PREFIX)/bin/
	@install $(BUILD_DIR)/bin/ymir-ws-server $(INSTALL_PREFIX)/bin/
	@cp -r $(BUILD_DIR)/share/ymir/web/* $(INSTALL_PREFIX)/share/ymir/web/
	@echo "[ymir] installed. run 'ymir serve' to start."

clean:
	@echo "[ymir] cleaning..."
	@cargo clean
	@rm -rf apps/web/node_modules apps/web/dist
	@rm -rf $(BUILD_DIR)
