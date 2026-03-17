use clap::{Parser, Subcommand};
use tracing_subscriber::EnvFilter;

const WS_PORT: u16 = 7319;
const VITE_PORT: u16 = 5173;

#[derive(Parser)]
#[command(name = "ymir", about = "ymir — agent composer with workspaces")]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// Launch all ymir servers (WS server + Vite dev server)
    Serve,
    /// Kill all running ymir servers
    Kill,
    /// Print current configuration
    Config,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let cli = Cli::parse();

    match cli.command {
        Some(Commands::Serve) => serve().await,
        Some(Commands::Kill) => kill().await,
        Some(Commands::Config) => config(),
        None => serve().await,
    }
}

async fn serve() -> anyhow::Result<()> {
  tracing::info!("starting ymir servers...");
  tracing::info!(" ws-server → ws://0.0.0.0:{WS_PORT}");
  tracing::info!(" vite → http://0.0.0.0:{VITE_PORT}");

  let ws_server_path = std::env::current_exe()?
    .parent()
    .ok_or_else(|| anyhow::anyhow!("Could not find executable directory"))?
    .join("ymir-ws-server");

  let _ws_server = tokio::process::Command::new(ws_server_path)
    .env("YMIR_WS_PORT", WS_PORT.to_string())
    .env("YMIR_VITE_PORT", VITE_PORT.to_string())
    .spawn()?;

  let _vite = tokio::process::Command::new("npx")
    .args(["vite", "--port", &VITE_PORT.to_string()])
    .current_dir("apps/web")
    .spawn()?;

  tracing::info!("servers running. press ctrl-c to stop.");

  tokio::signal::ctrl_c().await?;
  tracing::info!("shutting down...");
  kill().await
}

async fn kill() -> anyhow::Result<()> {
    tracing::info!("killing processes on ports {WS_PORT} and {VITE_PORT}...");
    for port in [WS_PORT, VITE_PORT] {
        let _ = tokio::process::Command::new("fuser")
            .args(["-k", &format!("{port}/tcp")])
            .output()
            .await;
    }
    tracing::info!("done.");
    Ok(())
}

fn config() -> anyhow::Result<()> {
    println!("ymir configuration:");
    println!("  ws_port:  {WS_PORT}");
    println!("  vite_port: {VITE_PORT}");
    Ok(())
}
