use axum::{
  extract::{
    ws::{Message, WebSocket, WebSocketUpgrade},
    State,
  },
  response::{IntoResponse, Json},
};
use futures_util::StreamExt;
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::watch;
use tokio::task::JoinHandle;
use tracing::{debug, error, info, warn};
use tracing_subscriber::prelude::*;
use ymir_ws_server::db::Db;
use ymir_ws_server::logging::ActivityLayer;
use ymir_ws_server::protocol::{
  ClientMessage, ServerMessage, PROTOCOL_VERSION,
};
use ymir_ws_server::router::route_message;
use ymir_ws_server::state::AppState;

const DEFAULT_PORT: u16 = 7319;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let activity_layer = ActivityLayer::new();

    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("ymir_ws_server=info"));

    tracing_subscriber::registry()
        .with(env_filter)
        .with(activity_layer.clone())
        .with(tracing_subscriber::fmt::layer().json())
        .init();

    let port: u16 = std::env::var("YMIR_WS_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(DEFAULT_PORT);

    let db_path = std::env::var("YMIR_DB_PATH").unwrap_or_else(|_| "ymir.db".to_string());

    let db = Arc::new(Db::open(db_path).await?);
    let (shutdown_tx, mut shutdown_rx) = watch::channel(false);

    let activity_logger = Arc::new(ymir_ws_server::logging::ActivityLogger::new(db.clone()));
    activity_layer.set_logger(activity_logger.clone()).await;

    let state = AppState::with_acp(db.clone(), shutdown_rx.clone());

    // Initialize in-memory state from database
    state.initialize_from_db().await;

    let app = axum::Router::new()
        .route("/health", axum::routing::get(health_check))
        .route("/", axum::routing::get(ws_handler))
        .with_state(state.clone());

  info!("ymir ws-server listening on http://0.0.0.0:{port}");
  info!("WebSocket endpoint: ws://0.0.0.0:{port}");
  info!("Health endpoint: http://0.0.0.0:{port}/health");

  let shutdown_task = spawn_shutdown_handler(shutdown_tx);

  let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await?;
  axum::serve(listener, app)
    .with_graceful_shutdown(async move {
      let _ = shutdown_rx.changed().await;
    })
    .await?;

  shutdown_task.abort();

  info!("Server shutdown complete");
    Ok(())
}

async fn health_check() -> impl IntoResponse {
    Json(json!({"status": "ok"}))
}

async fn ws_handler(
  ws: WebSocketUpgrade,
  State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
  info!("WebSocket connection attempt");

  ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: Arc<AppState>) {
  let client_id = uuid::Uuid::new_v4();
  info!(client_id = %client_id, "WebSocket connection established");

    let mut rx = state.connect(client_id).await;

  let timeout_checker_task = spawn_client_timeout_checker(state.clone(), client_id);

  let result = handle_connection_loop(&mut socket, &state, client_id, &mut rx).await;

  timeout_checker_task.abort();

  if result.is_err() {
    error!(client_id = %client_id, "Connection error: {:?}", result);
  }

  state.disconnect(client_id).await;
  info!(client_id = %client_id, "WebSocket connection closed");
}

async fn handle_connection_loop(
    socket: &mut WebSocket,
    state: &Arc<AppState>,
    client_id: uuid::Uuid,
    rx: &mut tokio::sync::mpsc::Receiver<ServerMessage>,
) -> anyhow::Result<()> {
    loop {
        tokio::select! {
            Some(msg) = rx.recv() => {
            if let Err(e) = send_ws_message(socket, msg).await {
                error!(%client_id, error = %e, "Failed to send message to client");
                return Err(e);
            }
            }
            Some(result) = socket.next() => {
                let msg = result?;
                process_ws_message(state, client_id, msg).await?;
            }
            else => {
                info!(%client_id, "Connection closed");
                return Ok(());
            }
        }
    }
}

async fn process_ws_message(
    state: &Arc<AppState>,
    client_id: uuid::Uuid,
    msg: Message,
) -> anyhow::Result<()> {
    match msg {
        Message::Binary(data) => {
            info!(%client_id, "Received binary message, size: {}", data.len());
            match rmp_serde::from_slice::<ClientMessage>(&data) {
                Ok(client_msg) => {
                    info!(%client_id, "Decoded message type: {:?}", client_msg.payload);
                    if client_msg.version != PROTOCOL_VERSION {
                        warn!(
                            %client_id,
                            version = client_msg.version,
                            expected = PROTOCOL_VERSION,
                            "Client protocol version mismatch"
                        );
                        return Ok(());
                    }

                    if let Some(response) = route_message(state.clone(), client_id, client_msg).await {
                        state.send_to(client_id, response).await;
                    }
                }
                Err(e) => {
                    error!(%client_id, error = %e, "Failed to decode MessagePack");
                }
            }
        }
        Message::Close(_) => {
            info!(%client_id, "Client requested close");
            return Ok(());
        }
        Message::Ping(_) => {
            debug!(%client_id, "WebSocket ping received");
        }
        Message::Pong(_) => {
            debug!(%client_id, "WebSocket pong received");
        }
        Message::Text(_) => {
            warn!(%client_id, "Received text message, expecting binary MessagePack");
        }
    }
    Ok(())
}

async fn send_ws_message(socket: &mut WebSocket, msg: ServerMessage) -> anyhow::Result<()> {
    let bytes = rmp_serde::to_vec_named(&msg)?;
    socket.send(Message::Binary(bytes)).await?;
    Ok(())
}


fn spawn_client_timeout_checker(state: Arc<AppState>, client_id: uuid::Uuid) -> JoinHandle<()> {
  tokio::spawn(async move {
    let mut interval = tokio::time::interval(Duration::from_secs(5));
    let mut shutdown_rx = state.shutdown_rx.clone();

    loop {
      tokio::select! {
        _ = interval.tick() => {
          if state.is_client_timed_out(client_id).await {
            warn!(%client_id, "Client timed out (no ping received in 30s), disconnecting");
            state.disconnect(client_id).await;
            break;
          }
        }
        Ok(_) = shutdown_rx.changed() => {
          if *shutdown_rx.borrow() {
            debug!("Client timeout checker for {} received shutdown", client_id);
            break;
          }
        }
      }
    }
  })
}

fn spawn_shutdown_handler(shutdown_tx: watch::Sender<bool>) -> JoinHandle<()> {
    tokio::spawn(async move {
        tokio::signal::ctrl_c()
            .await
            .expect("Failed to set up Ctrl-C handler");
        info!("Ctrl-C received, initiating graceful shutdown");
        // Non-panicking send to handle case when all receivers have dropped
        let _ = shutdown_tx.send(true);
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_health_endpoint() {
        let _response = health_check().await;
    }
}
