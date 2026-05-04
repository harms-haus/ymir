//! Generic WebSocket server for bridge connections.
//!
//! This module provides core WebSocket server functionality:
//! - Connection handling and lifecycle management
//! - Message routing
//! - Envelope parsing
//! - Session state tracking

use futures_util::{SinkExt, StreamExt};
use std::net::SocketAddr;
use tokio::net::TcpListener;
use tokio::sync::broadcast;

/// Session state tracks initialization progress
#[derive(Debug, Clone, PartialEq)]
pub enum SessionState {
    Uninitialized,
    Initialized,
}

/// Init message structure from client
#[derive(Debug, serde::Deserialize)]
pub struct InitMessage {
    #[serde(default)]
    pub mode: Option<String>,
    #[serde(default, rename = "initId")]
    pub init_id: Option<String>,
}

/// Disconnect message structure from client
#[derive(Debug, serde::Deserialize)]
#[serde(tag = "type", rename = "disconnect")]
pub struct DisconnectMessage {
    // No additional fields - just type: "disconnect"
}

/// Server configuration
pub struct ServerConfig {
    pub addr: SocketAddr,
}

/// Start the WebSocket server
pub async fn run_server(
    config: ServerConfig,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let listener = TcpListener::bind(&config.addr).await?;
    tracing::info!("WebSocket server listening on {}", config.addr);

    let (shutdown_tx, _) = broadcast::channel::<()>(1);

    loop {
        let (stream, addr) = listener.accept().await?;
        tracing::info!("Client connected from {}", addr);
        tracing::trace!("WebSocket connection established from {:?}", addr);

        let ws_stream = tokio_tungstenite::accept_async(stream).await?;
        tracing::info!("WebSocket handshake completed for {}", addr);
        tracing::trace!("WebSocket handshake completed for {:?}", addr);

        let shutdown_rx = shutdown_tx.subscribe();
        let shutdown_tx = shutdown_tx.clone();

        tokio::spawn(async move {
            let result = run_client_session(ws_stream, shutdown_rx, shutdown_tx).await;

            if let Err(e) = result {
                tracing::error!("WebSocket error for {}: {}", addr, e);
            }

            tracing::info!("Client {} disconnected", addr);
            tracing::trace!("WebSocket connection closed for {:?}", addr);
        });
    }
}

async fn run_client_session(
    ws_stream: tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
    mut shutdown_rx: broadcast::Receiver<()>,
    _shutdown_tx: broadcast::Sender<()>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let (mut ws_tx, mut ws_rx) = ws_stream.split();

    loop {
        // Wait for init message
        let state = wait_for_init(&mut ws_tx, &mut ws_rx, &mut shutdown_rx).await?;

        match state {
            SessionState::Initialized => {
                // Wait for messages or disconnect
                match wait_for_messages(&mut ws_tx, &mut ws_rx, &mut shutdown_rx).await {
                    Ok(_reason) => {
                        tracing::info!("Session ended, waiting for new init");
                        tracing::trace!("Session ended, waiting for new init");
                        // Reunite stream for next iteration
                        match ws_tx.reunite(ws_rx) {
                            Ok(stream) => {
                                let (new_tx, new_rx) = stream.split();
                                ws_tx = new_tx;
                                ws_rx = new_rx;
                            }
                            Err(_e) => {
                                tracing::error!("Failed to reunite ws stream: stream lost");
                                return Ok(());
                            }
                        }
                        continue;
                    }
                    Err(e) => return Err(e),
                }
            }
            SessionState::Uninitialized => {
                // Connection closed or error, exit loop
                break;
            }
        }
    }

    Ok(())
}

async fn wait_for_init(
    ws_tx: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
        tokio_tungstenite::tungstenite::Message,
    >,
    ws_rx: &mut futures_util::stream::SplitStream<
        tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
    >,
    shutdown_rx: &mut broadcast::Receiver<()>,
) -> Result<SessionState, Box<dyn std::error::Error + Send + Sync>> {
    loop {
        tokio::select! {
            msg = ws_rx.next() => {
                match msg {
                    Some(Ok(tokio_tungstenite::tungstenite::Message::Text(text))) => {
                        tracing::trace!("Message received during init: {}", text);
                        match serde_json::from_str::<InitMessage>(&text) {
                            Ok(_init_msg) => {
                                // Send success response
                                let success_response = serde_json::json!({
                                    "type": "init",
                                    "initId": _init_msg.init_id,
                                    "status": "success"
                                });
                                tracing::trace!("Sending init success response");
                                ws_tx.send(tokio_tungstenite::tungstenite::Message::Text(
                                    serde_json::to_string(&success_response)?.into()
                                )).await?;
                                ws_tx.flush().await?;

                                tracing::info!("Client initialized");
                                return Ok(SessionState::Initialized);
                            }
                            Err(e) => {
                                let error_response = serde_json::json!({
                                    "error": format!("Invalid init message: {}", e)
                                });
                                tracing::trace!("Sending init error response");
                                ws_tx.send(tokio_tungstenite::tungstenite::Message::Text(
                                    serde_json::to_string(&error_response)?.into()
                                )).await?;
                                ws_tx.flush().await?;
                                tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;
                                return Ok(SessionState::Uninitialized);
                            }
                        }
                    }
                    Some(Ok(tokio_tungstenite::tungstenite::Message::Close(_))) | None => {
                        tracing::info!("Client disconnected before initialization");
                        tracing::trace!("WebSocket connection closed before initialization");
                        return Ok(SessionState::Uninitialized);
                    }
                    Some(Ok(tokio_tungstenite::tungstenite::Message::Ping(data))) => {
                        let _ = ws_tx.send(tokio_tungstenite::tungstenite::Message::Pong(data)).await;
                    }
                    _ => {}
                }
            }
            _ = shutdown_rx.recv() => {
                tracing::info!("Shutdown signal received before initialization");
                return Ok(SessionState::Uninitialized);
            }
        }
    }
}

async fn wait_for_messages(
    ws_tx: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
        tokio_tungstenite::tungstenite::Message,
    >,
    ws_rx: &mut futures_util::stream::SplitStream<
        tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
    >,
    shutdown_rx: &mut broadcast::Receiver<()>,
) -> Result<DisconnectReason, Box<dyn std::error::Error + Send + Sync>> {
    loop {
        tokio::select! {
            msg = ws_rx.next() => {
                match msg {
                    Some(Ok(tokio_tungstenite::tungstenite::Message::Text(text))) => {
                        tracing::trace!("Message received: {}", text);
                        // Check for disconnect message
                        if let Ok(_disconnect) = serde_json::from_str::<DisconnectMessage>(&text) {
                            tracing::info!("Disconnect request received");
                            let success_response = serde_json::json!({
                                "status": "success"
                            });
                            tracing::trace!("Sending disconnect success response");
                            ws_tx.send(tokio_tungstenite::tungstenite::Message::Text(
                                serde_json::to_string(&success_response)?.into()
                            )).await?;
                            ws_tx.flush().await?;
                            return Ok(DisconnectReason::ClientRequested);
                        }
                    }
                    Some(Ok(tokio_tungstenite::tungstenite::Message::Close(_))) | None => {
                        tracing::info!("Client disconnected");
                        tracing::trace!("WebSocket connection closed in wait_for_messages");
                        return Ok(DisconnectReason::ClientClosed);
                    }
                    Some(Ok(tokio_tungstenite::tungstenite::Message::Ping(data))) => {
                        let _ = ws_tx.send(tokio_tungstenite::tungstenite::Message::Pong(data)).await;
                    }
                    _ => {}
                }
            }
            _ = shutdown_rx.recv() => {
                tracing::info!("Shutdown signal received");
                return Ok(DisconnectReason::ServerShutdown);
            }
        }
    }
}

/// Reason for disconnect/session end
#[derive(Debug, Clone, PartialEq)]
enum DisconnectReason {
    ClientRequested,
    ClientClosed,
    ServerShutdown,
}
