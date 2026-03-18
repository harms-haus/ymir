SHELL := /bin/bash

WS_PORT := 7319
VITE_PORT := 5173
BUILD_DIR := build
INSTALL_PREFIX := /usr/local

.PHONY: debug dev dev-tauri build-web-only build-tauri build build-prod install-prod clean kill help serve status config doctor

help:
	@echo "ymir Makefile targets:"
	@echo "  debug / dev        Kill old processes, rebuild, launch all servers"
	@echo "  dev-tauri          Start Vite dev server and Tauri dev concurrently"
	@echo "  build-web-only     Build web without Tauri"
	@echo "  build-tauri        Build web and Tauri release binary"
	@echo "  build              Build all Rust components"
	@echo "  build-prod         Build all components to $(BUILD_DIR)/"
	@echo "  install-prod       Build and install to $(INSTALL_PREFIX)"
	@echo "  serve              Run ymir serve (production mode)"
	@echo "  kill               Kill processes on configured ports"
	@echo "  status             Check if ymir is running"
	@echo "  config             Print current configuration"
	@echo "  doctor             Run diagnostic checks"
	@echo "  clean              Remove all build artifacts"

kill:
	@echo "[ymir] killing processes on ports $(WS_PORT) and $(VITE_PORT)..."
	-@fuser -k $(WS_PORT)/tcp 2>/dev/null || true
	-@fuser -k $(VITE_PORT)/tcp 2>/dev/null || true

build:
	@echo "[ymir] building rust workspace..."
	@cargo build

build-web-only:
	@echo "[ymir] building web app..."
	@npm install --prefix apps/web
	@npm run build --prefix apps/web

dev-tauri: kill
	@echo "[ymir] starting Vite dev server on port $(VITE_PORT)..."
	@npm run dev --prefix apps/web &
	@echo "[ymir] starting Tauri dev mode..."
	@cargo tauri dev

build-tauri: build-web-only
	@echo "[ymir] building Tauri app..."
	@cargo tauri build

debug dev: kill build
	@echo "[ymir] building web client..."
	@npm install --prefix apps/web
	@npm run build --prefix apps/web
	@echo "[ymir] launching servers..."
	@cargo run -p ymir -- serve --dev

serve:
	@cargo run -p ymir -- serve

status:
	@cargo run -p ymir -- status

config:
	@cargo run -p ymir -- config

doctor:
	@cargo run -p ymir -- doctor

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
