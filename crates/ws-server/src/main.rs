use tracing_subscriber::EnvFilter;

const DEFAULT_PORT: u16 = 7319;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let port: u16 = std::env::var("YMIR_WS_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(DEFAULT_PORT);

    tracing::info!("ymir ws-server listening on ws://0.0.0.0:{port}");

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await?;
    tracing::info!("bound to port {port}, ready for connections");

    loop {
        match listener.accept().await {
            Ok((_stream, addr)) => {
                tracing::info!("connection from {addr}");
            }
            Err(e) => tracing::error!("accept error: {e}"),
        }
    }
}
