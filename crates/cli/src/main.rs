use clap::{Args, Parser, Subcommand};
use std::net::{TcpStream, Ipv4Addr, SocketAddrV4};
use std::process::ExitCode;
use std::time::Duration;
use tokio::process::Command;
use tokio::time::timeout;
use tracing_subscriber::EnvFilter;

const VERSION: &str = env!("CARGO_PKG_VERSION");
const WS_PORT_DEFAULT: u16 = 7319;
const VITE_PORT_DEFAULT: u16 = 5173;
const LOG_LEVEL: &str = "info";
const GRACEFUL_TIMEOUT_SECS: u64 = 5;

#[derive(Parser)]
#[command(name = "ymir", about = "ymir — agent composer with workspaces", version)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// Launch all ymir servers (WS server + Vite dev server in --dev mode)
    Serve(ServeArgs),
    /// Kill all running ymir servers
    Kill(KillArgs),
    /// Print current configuration
    Config,
    /// Check if ymir server is running
    Status,
    /// Run diagnostic checks
    Doctor,
}

#[derive(Args)]
struct KillArgs {
    /// Override WebSocket server port to kill
    #[arg(short, long)]
    port: Option<u16>,

    /// Override Vite dev server port to kill
    #[arg(long)]
    vite_port: Option<u16>,
}

#[derive(Args)]
struct ServeArgs {
    /// Run in development mode (also spawn Vite dev server)
    #[arg(short, long)]
    dev: bool,

    /// Host Vite dev server on 0.0.0.0 (requires --dev)
    #[arg(long)]
    host: bool,

    /// Override WebSocket server port
    #[arg(short, long, default_value_t = WS_PORT_DEFAULT)]
    port: u16,

    /// Override web app directory path (for development or custom layouts)
    #[arg(long, env = "YMIR_WEB_APP_PATH")]
    web_app_path: Option<String>,
}

#[tokio::main]
async fn main() -> anyhow::Result<ExitCode> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| LOG_LEVEL.into()))
        .init();

    let cli = Cli::parse();

    match cli.command {
        Some(Commands::Serve(args)) => serve(args).await,
        Some(Commands::Kill(args)) => kill(args).await,
        Some(Commands::Config) => config(),
        Some(Commands::Status) => status().await,
        Some(Commands::Doctor) => doctor().await,
        None => serve(ServeArgs { dev: false, host: false, port: WS_PORT_DEFAULT, web_app_path: None }).await,
    }
}

// ============================================================================
// SERVE COMMAND
// ============================================================================

async fn serve(args: ServeArgs) -> anyhow::Result<ExitCode> {
    let ws_port = args.port;
    let vite_port = VITE_PORT_DEFAULT;

    // Check for port conflicts
    if is_port_in_use(ws_port) {
        eprintln!("error: port {ws_port} is already in use");
        eprintln!("hint: run 'ymir kill' to stop existing servers, or use --port to specify a different port");
        return Ok(ExitCode::FAILURE);
    }

    if args.dev && is_port_in_use(vite_port) {
        eprintln!("error: port {vite_port} is already in use (required for Vite dev server)");
        eprintln!("hint: run 'ymir kill' to stop existing servers");
        return Ok(ExitCode::FAILURE);
    }

    // Find ws-server binary
    let exe_dir = std::env::current_exe()?
        .parent()
        .ok_or_else(|| anyhow::anyhow!("Could not find executable directory"))?
        .to_path_buf();

    let ws_server_path = exe_dir.join("ymir-ws-server");

    if !ws_server_path.exists() {
        eprintln!("error: ymir-ws-server binary not found at {}", ws_server_path.display());
        eprintln!("hint: run 'cargo build' or 'make build-prod'");
        return Ok(ExitCode::FAILURE);
    }

    // Resolve web app directory: CLI arg/env var > relative path fallback
    let web_app_path = if let Some(path) = args.web_app_path {
        std::path::PathBuf::from(path)
    } else {
        // Fallback: resolve relative to executable (works for cargo target layout)
        exe_dir
            .parent()
            .and_then(|p| p.parent())
            .map(|p| p.join("apps").join("web"))
            .ok_or_else(|| anyhow::anyhow!("Could not resolve web app directory"))?
    };

    if args.dev && !web_app_path.exists() {
        eprintln!("error: web app directory not found at {}", web_app_path.display());
        eprintln!("hint: set YMIR_WEB_APP_PATH environment variable or use --web-app-path to specify the correct path");
        eprintln!("      expected layout: <project-root>/apps/web (or provide custom path via CLI/env)");
        return Ok(ExitCode::FAILURE);
    }

    // Print startup banner
    print_banner(ws_port, vite_port, args.dev);

    // Spawn ws-server
    let mut ws_child = Command::new(&ws_server_path)
        .env("YMIR_WS_PORT", ws_port.to_string())
        .env("YMIR_VITE_PORT", vite_port.to_string())
        .kill_on_drop(true)
        .spawn()?;

    // Optionally spawn Vite dev server
    let mut vite_child = if args.dev {
        let port_str = vite_port.to_string();
        let mut vite_args = vec!["vite", "--port", &port_str];
        if args.host {
            vite_args.push("--host");
        }
        Some(
            Command::new("npx")
                .args(&vite_args)
                .current_dir(&web_app_path)
                .kill_on_drop(true)
                .spawn()?
        )
    } else {
        None
    };

    println!("\n  servers running. press ctrl-c to stop.\n");

    // Wait for ctrl-c
    tokio::signal::ctrl_c().await?;
    
    println!("\n  shutting down...");

    // Graceful shutdown
    graceful_shutdown(&mut ws_child, "ws-server", ws_port).await;

    if let Some(ref mut child) = vite_child {
        graceful_shutdown(child, "vite", vite_port).await;
    }

    println!("  done.");
    Ok(ExitCode::SUCCESS)
}

fn print_banner(ws_port: u16, vite_port: u16, dev_mode: bool) {
    println!();
    println!("  ╔══════════════════════════════════════════╗");
    println!("  ║            ymir v{VERSION:<22}║");
    println!("  ╠══════════════════════════════════════════╣");
    println!("  ║  WebSocket Server  │  ws://0.0.0.0:{ws_port:<5}     ║");
    if dev_mode {
        println!("  ║  Vite Dev Server   │  http://0.0.0.0:{vite_port:<5}   ║");
    }
    println!("  ╠══════════════════════════════════════════╣");
    println!("  ║  Mode: {}                                ║", if dev_mode { "development" } else { "production " });
    println!("  ╚══════════════════════════════════════════╝");
}

async fn graceful_shutdown(child: &mut tokio::process::Child, name: &str, port: u16) {
    #[cfg(unix)]
    {
        use nix::sys::signal::{kill, Signal};
        use nix::unistd::Pid;

        if let Some(pid_val) = child.id() {
            let nix_pid = Pid::from_raw(pid_val as i32);
            match kill(nix_pid, Signal::SIGTERM) {
                Ok(()) => {
                    tracing::debug!("sent SIGTERM to {name} (pid: {pid_val})");
                }
                Err(e) => {
                    tracing::debug!("failed to send SIGTERM to {name}: {e}; falling back to SIGKILL");
                    // Fall back to SIGKILL if SIGTERM fails
                    if let Err(e) = child.start_kill() {
                        tracing::debug!("failed to kill {name}: {e}");
                    }
                }
            }
        } else {
            // No PID available, fall back to start_kill
            if let Err(e) = child.start_kill() {
                tracing::debug!("failed to kill {name} (no PID): {e}");
            }
        }
    }

    #[cfg(not(unix))]
    {
        // On non-Unix platforms (e.g., Windows), use start_kill which terminates the process
        if let Err(e) = child.start_kill() {
            tracing::debug!("failed to terminate {name}: {e}");
        }
    }

    // Wait with timeout
    match timeout(Duration::from_secs(GRACEFUL_TIMEOUT_SECS), child.wait()).await {
        Ok(Ok(status)) => {
            tracing::debug!("{name} exited with status: {status}");
        }
        Ok(Err(e)) => {
            tracing::debug!("error waiting for {name}: {e}");
        }
        Err(_) => {
            // Timeout - force kill via port
            println!("  {name} did not exit gracefully, forcing kill...");
            kill_port_sync(port);

            // Wait a bit more for process to die
            let _ = timeout(Duration::from_secs(1), child.wait()).await;
        }
    }
}

// ============================================================================
// KILL COMMAND
// ============================================================================

async fn kill(args: KillArgs) -> anyhow::Result<ExitCode> {
    let ws_port = args.port.unwrap_or(WS_PORT_DEFAULT);
    let vite_port = args.vite_port.unwrap_or(VITE_PORT_DEFAULT);

    println!("killing processes on ports {ws_port} and {vite_port}...");

    let ws_killed = kill_port(ws_port).await;
    let vite_killed = kill_port(vite_port).await;

    match (ws_killed, vite_killed) {
        (true, true) => println!("killed processes on both ports."),
        (true, false) => println!("killed process on port {ws_port}. Port {vite_port} was not in use."),
        (false, true) => println!("killed process on port {vite_port}. Port {ws_port} was not in use."),
        (false, false) => println!("no processes found on ports {ws_port} or {vite_port}."),
    }

    Ok(ExitCode::SUCCESS)
}

async fn kill_port(port: u16) -> bool {
    if !is_port_in_use(port) {
        return false;
    }

    let result = if cfg!(target_os = "linux") {
        Command::new("fuser")
            .args(["-k", &format!("{port}/tcp")])
            .output()
            .await
    } else if cfg!(target_os = "macos") {
        // macOS: lsof -ti:PORT | xargs kill
        Command::new("sh")
            .args(["-c", &format!("lsof -ti:{port} | xargs kill -9 2>/dev/null || true")])
            .output()
            .await
    } else if cfg!(target_os = "windows") {
        // Windows: netstat -ano | findstr :PORT -> taskkill /PID
        Command::new("cmd")
            .args(["/C", &format!("for /f \"tokens=5\" %a in ('netstat -ano ^| findstr :{port}') do taskkill /F /PID %a")])
            .output()
            .await
    } else {
        // Fallback: try fuser (most Unix-like systems)
        Command::new("fuser")
            .args(["-k", &format!("{port}/tcp")])
            .output()
            .await
    };

    match result {
        Ok(output) => output.status.success() || !is_port_in_use(port),
        Err(_) => kill_port_sync(port),
    }
}

fn kill_port_sync(port: u16) -> bool {
    if !is_port_in_use(port) {
        return false;
    }

    let result = if cfg!(target_os = "linux") {
        std::process::Command::new("fuser")
            .args(["-k", &format!("{port}/tcp")])
            .output()
    } else if cfg!(target_os = "macos") {
        std::process::Command::new("sh")
            .args(["-c", &format!("lsof -ti:{port} | xargs kill -9 2>/dev/null || true")])
            .output()
    } else if cfg!(target_os = "windows") {
        std::process::Command::new("cmd")
            .args(["/C", &format!("for /f \"tokens=5\" %a in ('netstat -ano ^| findstr :{port}') do taskkill /F /PID %a")])
            .output()
    } else {
        std::process::Command::new("fuser")
            .args(["-k", &format!("{port}/tcp")])
            .output()
    };

    match result {
        Ok(_) => !is_port_in_use(port),
        Err(_) => false,
    }
}

// ============================================================================
// CONFIG COMMAND
// ============================================================================

fn config() -> anyhow::Result<ExitCode> {
    let home_path = dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| std::env::var("HOME").unwrap_or_else(|_| "~".to_string()));
    let db_path = format!("{}/.ymir/ymir.db", home_path);
    let config_path = format!("{}/.ymir/config.toml", home_path);

    println!("ymir configuration:");
    println!();
    println!("  Version:          {VERSION}");
    println!("  WebSocket Port:   {WS_PORT_DEFAULT}");
    println!("  Vite Proxy Port:  {VITE_PORT_DEFAULT}");
    println!("  Database Path:    {db_path}");
    println!("  Log Level:        {LOG_LEVEL}");
    println!("  Config File:      {config_path}");
    println!();

    Ok(ExitCode::SUCCESS)
}

// ============================================================================
// STATUS COMMAND
// ============================================================================

async fn status() -> anyhow::Result<ExitCode> {
    let running = is_port_in_use(WS_PORT_DEFAULT);

    if running {
        println!("ymir: running (port {WS_PORT_DEFAULT} is active)");
        Ok(ExitCode::SUCCESS)
    } else {
        println!("ymir: stopped");
        Ok(ExitCode::from(1))
    }
}

// ============================================================================
// DOCTOR COMMAND
// ============================================================================

async fn doctor() -> anyhow::Result<ExitCode> {
    println!("ymir doctor — checking system health...\n");
    
    let mut all_passed = true;

    // Check dependencies
    all_passed &= check_dependency("rustc", "Rust compiler").await;
    all_passed &= check_dependency("cargo", "Cargo").await;
    all_passed &= check_dependency("node", "Node.js").await;
    all_passed &= check_dependency("npm", "npm").await;
    all_passed &= check_dependency("git", "Git").await;
    all_passed &= check_dependency("gh", "GitHub CLI").await;

    println!();

    // Check port availability
    all_passed &= check_port_available(WS_PORT_DEFAULT, "WebSocket server").await;
    all_passed &= check_port_available(VITE_PORT_DEFAULT, "Vite dev server").await;

    println!();

    // Check ~/.ymir directory and database
    all_passed &= check_ymir_directory().await;

    println!();

    if all_passed {
        println!("✓ All checks passed!");
        Ok(ExitCode::SUCCESS)
    } else {
        println!("✗ Some checks failed. See above for details.");
        Ok(ExitCode::from(1))
    }
}

async fn check_dependency(cmd: &str, name: &str) -> bool {
    let result = Command::new(cmd)
        .arg("--version")
        .output()
        .await;

    match result {
        Ok(output) if output.status.success() => {
            let version = String::from_utf8_lossy(&output.stdout);
            let version_line = version.lines().next().unwrap_or("unknown version");
            println!("  ✓ {name:<20} {version_line}");
            true
        }
        Ok(_) => {
            println!("  ✗ {name:<20} not found (command failed)");
            false
        }
        Err(e) => {
            println!("  ✗ {name:<20} not found ({e})");
            false
        }
    }
}

async fn check_port_available(port: u16, name: &str) -> bool {
    if is_port_in_use(port) {
        println!("  ✗ Port {port} ({name}) is in use");
        false
    } else {
        println!("  ✓ Port {port} ({name}) is available");
        true
    }
}

async fn check_ymir_directory() -> bool {
    let home_path = dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| {
            std::env::var("HOME").unwrap_or_else(|_| {
                eprintln!("warning: could not determine home directory");
                "/tmp".to_string()
            })
        });
    let ymir_dir = format!("{}/.ymir", home_path);

    let dir_exists = std::path::Path::new(&ymir_dir).exists();
    let db_path = format!("{}/ymir.db", ymir_dir);
    let db_exists = std::path::Path::new(&db_path).exists();
    let config_path = format!("{}/config.toml", ymir_dir);
    let config_exists = std::path::Path::new(&config_path).exists();

    if dir_exists {
        println!("  ✓ ~/.ymir directory exists");
    } else {
        println!("  ○ ~/.ymir directory does not exist (will be created on first run)");
    }

    if db_exists {
        println!("  ✓ Database exists at ~/.ymir/ymir.db");
    } else {
        println!("  ○ Database does not exist (will be created on first run)");
    }

    if config_exists {
        println!("  ✓ Config file exists at ~/.ymir/config.toml");
    } else {
        println!("  ○ Config file does not exist (using defaults)");
    }

    true // These are informational, not failures
}

// ============================================================================
// UTILITIES
// ============================================================================

fn is_port_in_use(port: u16) -> bool {
    let addr = SocketAddrV4::new(Ipv4Addr::LOCALHOST, port);
    TcpStream::connect_timeout(&addr.into(), Duration::from_millis(100)).is_ok()
}

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_port_in_use_unlikely_port() {
        // Port 1 is typically not in use
        assert!(!is_port_in_use(1));
    }

    #[test]
    fn test_os_detection() {
        // Just verify the cfg flags are working
        let is_linux = cfg!(target_os = "linux");
        let is_macos = cfg!(target_os = "macos");
        let is_windows = cfg!(target_os = "windows");
        
        // At least one should be true (but not more than one typically)
        println!("OS detection - Linux: {}, macOS: {}, Windows: {}", is_linux, is_macos, is_windows);
    }

    #[test]
    fn test_default_ports() {
        assert_eq!(WS_PORT_DEFAULT, 7319);
        assert_eq!(VITE_PORT_DEFAULT, 5173);
    }

    #[test]
    fn test_version_not_empty() {
        assert!(!VERSION.is_empty());
    }
}