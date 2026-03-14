mod browser;
mod cli;

use clap::Parser;
use cli::{Cli, Commands};
use tracing::{info, warn};
use ymir_core::server::{start_server, ServerConfig};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let cli = Cli::parse();

    match cli.command {
        Some(Commands::Web(web_args)) => {
            if let Err(e) = web_args.validate() {
                eprintln!("Error: {}", e);
                std::process::exit(1);
            }

            info!("Ymir Server - WebSocket mode");
            info!("Host: {}", web_args.host);
            info!("Port: {}", web_args.port);
            info!("Bind address: {}", web_args.bind_address());

            if web_args.password.is_some() {
                info!("Password: [set]");
            } else {
                info!("Password: [none, no authentication required]");
            }

            if !web_args.no_browser {
                let url = browser::build_url(&web_args.host, web_args.port);
                match browser::open_browser(&url) {
                    Ok(true) => info!("Browser opened to: {}", url),
                    Ok(false) => {
                        warn!("Browser could not be opened, but server will continue");
                    }
                    Err(e) => warn!("Browser warning: {}", e),
                }
            }

            let config = ServerConfig {
                port: web_args.port,
                ping_interval_secs: 30,
                connection_timeout_secs: 60,
                require_auth: web_args.password.is_some(),
                password: web_args.password,
                allow_localhost_bypass: true,
            };

            info!("Starting server...");
            let server_handle = start_server(config).await?;

            info!("Server running. Press Ctrl+C to shutdown.");

            tokio::signal::ctrl_c().await?;
            info!("Shutdown signal received, stopping server...");

            server_handle.shutdown().await?;
            info!("Server stopped gracefully");

            Ok(())
        }
        None => {
            eprintln!("Ymir Server - no subcommand specified");
            eprintln!("Use 'ymir-server --help' for usage information");
            eprintln!("Use 'ymir-server web --help' for web server options");
            std::process::exit(1);
        }
    }
}
