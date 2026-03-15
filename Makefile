# Ymir Makefile
# Builds ymir-server and sets up the ymir command-line tool

.PHONY: build build-server build-tauri install uninstall clean

# Default target when running just 'make'
all: build

# Build the ymir-server binary for the current platform
build-server:
	@echo "Building ymir-server..."
	cargo build -p ymir-server --release
	@echo "Copying ymir-server to ymir-tauri/binaries/"
	mkdir -p ymir-tauri/binaries
	cp target/release/ymir-server ymir-tauri/binaries/ymir-server-$(shell rustc -vV | sed -n 's|host: ||p')
	cp target/release/ymir-server ymir-tauri/binaries/ymir-server

# Build the ymir command-line wrapper
build-wrapper:
	@echo "Creating ymir command wrapper..."
	@mkdir -p build
	@echo '#!/bin/bash' > build/ymir
	@echo '' >> build/ymir
	@echo 'case "$$1" in' >> build/ymir
	@echo '  web)' >> build/ymir
	@echo "    \"\$${YMIR_SERVER_PATH:-./ymir-server}\" web --host 127.0.0.1 --port 7319 \"\$${@:2}\"" >> build/ymir
	@echo '    ;;' >> build/ymir
	@echo '  *)' >> build/ymir
	@echo "    # Default: run Tauri app" >> build/ymir
	@echo '    if command -v npm >/dev/null 2>&1; then' >> build/ymir
	@echo '      npm run tauri' >> build/ymir
	@echo '    else' >> build/ymir
	@echo '      echo "Error: npm is required to run the Tauri app" >&2' >> build/ymir
	@echo '      exit 1' >> build/ymir
	@echo '    fi' >> build/ymir
	@echo '    ;;' >> build/ymir
	@echo 'esac' >> build/ymir
	@chmod +x build/ymir

# Build all services
build: build-server build-wrapper
	@echo "Build complete!"
	@echo "  - ymir-server binary: ymir-tauri/binaries/ymir-server"
	@echo "  - ymir command wrapper: build/ymir"

# Install ymir command to system
install: build
	@echo "Installing ymir command..."
	@sudo cp build/ymir /usr/local/bin/ymir
	@echo "Installation complete!"
	@echo ""
	@echo "Usage:"
	@echo "  ymir          - Launch the Tauri desktop app"
	@echo "  ymir web      - Launch just the web server"
	@echo ""
	@echo "To uninstall, run: make uninstall"

# Uninstall ymir command
uninstall:
	@echo "Removing ymir command..."
	@sudo rm -f /usr/local/bin/ymir
	@echo "Uninstall complete!"

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	cargo clean
	@rm -rf build
	@echo "Clean complete!"

# Help
help:
	@echo "Ymir Makefile"
	@echo ""
	@echo "Targets:"
	@echo "  build         Build all services (server and command wrapper)"
	@echo "  build-server  Build just the ymir-server binary"
	@echo "  build-wrapper Create just the ymir command wrapper"
	@echo "  install       Install ymir command to /usr/local/bin"
	@echo "  uninstall     Remove ymir command from /usr/local/bin"
	@echo "  clean         Remove build artifacts"
	@echo ""
	@echo "Running:"
	@echo "  ymir          - Launch Tauri desktop application"
	@echo "  ymir web      - Launch web server only"
