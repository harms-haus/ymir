//! WebSocket Server Module
//!
//! This module provides the WebSocket server foundation for Ymir:
//! - Connection state tracking for connected clients
//! - Keepalive ping/pong handling
//! - Graceful shutdown support
//!
//! The server is built on axum with tokio-tungstenite for WebSocket support.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::extract::ws::{Message, WebSocket};
use axum::extract::{ConnectInfo, State, WebSocketUpgrade};
use axum::response::Response;
use axum::routing::get;
use axum::Router;
use dashmap::DashMap;
use futures::{SinkExt, StreamExt};
use serde_json::Value;
use tokio::sync::{broadcast, mpsc, RwLock};
use tokio::time::interval;
use uuid::Uuid;

use crate::db::{DatabaseClient, DbConfig, MigrationRunner};
use crate::handlers::{
    AuthConfig, AuthHandler, AuthMiddleware, AuthRpcHandler, GitRpcHandler, PaneRpcHandler,
    PtyRpcHandler, TabRpcHandler, WorkspaceRpcHandler,
};
use crate::pty::manager::PtyManager;
use crate::scrollback::service::ScrollbackService;

struct WorkspaceRequestHandler {
    inner: WorkspaceRpcHandler,
}

#[async_trait::async_trait]
impl crate::server::protocol::RequestHandler for WorkspaceRequestHandler {
    async fn handle(
        &self,
        method: &str,
        params: Option<Value>,
    ) -> Result<Value, crate::server::protocol::ProtocolError> {
        self.inner.handle(method, params).await
    }
}

struct PaneRequestHandler {
    inner: PaneRpcHandler,
}

#[async_trait::async_trait]
impl crate::server::protocol::RequestHandler for PaneRequestHandler {
    async fn handle(
        &self,
        method: &str,
        params: Option<Value>,
    ) -> Result<Value, crate::server::protocol::ProtocolError> {
        self.inner.handle(method, params).await
    }
}

struct TabRequestHandler {
    inner: TabRpcHandler,
}

#[async_trait::async_trait]
impl crate::server::protocol::RequestHandler for TabRequestHandler {
    async fn handle(
        &self,
        method: &str,
        params: Option<Value>,
    ) -> Result<Value, crate::server::protocol::ProtocolError> {
        self.inner.handle(method, params).await
    }
}

struct PtyRequestHandler {
    inner: PtyRpcHandler,
}

#[async_trait::async_trait]
impl crate::server::protocol::RequestHandler for PtyRequestHandler {
    async fn handle(
        &self,
        method: &str,
        params: Option<Value>,
    ) -> Result<Value, crate::server::protocol::ProtocolError> {
        self.inner.handle(method, params).await
    }
}

struct GitRequestHandler {
    inner: GitRpcHandler,
}

#[async_trait::async_trait]
impl crate::server::protocol::RequestHandler for GitRequestHandler {
    async fn handle(
        &self,
        method: &str,
        params: Option<Value>,
    ) -> Result<Value, crate::server::protocol::ProtocolError> {
        tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(self.inner.handle(method, params))
        })
    }
}

pub mod protocol;
pub mod websocket;

pub use protocol::*;
pub use websocket::WebSocketHandler;

/// Default WebSocket server port
pub const DEFAULT_PORT: u16 = 7319;

/// Default ping interval in seconds
pub const DEFAULT_PING_INTERVAL_SECS: u64 = 30;

/// Default connection timeout in seconds (if no pong received)
pub const DEFAULT_CONNECTION_TIMEOUT_SECS: u64 = 60;

/// Unique identifier for a client connection
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct ConnectionId(pub Uuid);

impl ConnectionId {
    /// Generate a new unique connection ID
    pub fn new() -> Self {
        Self(Uuid::new_v4())
    }
}

impl Default for ConnectionId {
    fn default() -> Self {
        Self::new()
    }
}

/// Connection state for a single WebSocket client
#[derive(Debug)]
pub struct ConnectionState {
    /// Unique connection identifier
    pub id: ConnectionId,
    /// Client socket address
    pub addr: SocketAddr,
    /// Time when connection was established
    pub connected_at: Instant,
    /// Time of last activity (message received or pong)
    pub last_activity: RwLock<Instant>,
    /// Whether the connection is authenticated
    pub authenticated: RwLock<bool>,
    /// Channel for sending messages to this client
    pub tx: mpsc::UnboundedSender<Message>,
}

impl ConnectionState {
    /// Create a new connection state
    pub fn new(id: ConnectionId, addr: SocketAddr, tx: mpsc::UnboundedSender<Message>) -> Self {
        let now = Instant::now();
        Self {
            id,
            addr,
            connected_at: now,
            last_activity: RwLock::new(now),
            authenticated: RwLock::new(false),
            tx,
        }
    }

    /// Update last activity timestamp
    pub async fn update_activity(&self) {
        let mut last_activity = self.last_activity.write().await;
        *last_activity = Instant::now();
    }

    /// Check if connection has timed out
    pub async fn is_timed_out(&self, timeout: Duration) -> bool {
        let last_activity = self.last_activity.read().await;
        last_activity.elapsed() > timeout
    }

    /// Mark connection as authenticated
    pub async fn set_authenticated(&self, authenticated: bool) {
        let mut auth = self.authenticated.write().await;
        *auth = authenticated;
    }

    /// Check if connection is authenticated
    pub async fn is_authenticated(&self) -> bool {
        *self.authenticated.read().await
    }
}

/// Shared state for the WebSocket server
pub struct ServerState {
    /// Map of active connections
    pub connections: DashMap<ConnectionId, Arc<ConnectionState>>,
    /// Broadcast channel for server-wide notifications
    pub broadcast_tx: broadcast::Sender<String>,
    /// Server start time
    pub started_at: Instant,
    /// Server configuration
    pub config: ServerConfig,
    /// Authentication handler
    pub auth_handler: AuthHandler,
    /// Authentication middleware
    pub auth_middleware: AuthMiddleware,
    /// Request router for JSON-RPC methods
    pub request_router: RequestRouter,
}

impl std::fmt::Debug for ServerState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ServerState")
            .field("connections", &self.connections)
            .field("started_at", &self.started_at)
            .field("config", &self.config)
            .finish_non_exhaustive()
    }
}

/// Server configuration
#[derive(Debug, Clone)]
pub struct ServerConfig {
    /// Port to listen on
    pub port: u16,
    /// Ping interval in seconds
    pub ping_interval_secs: u64,
    /// Connection timeout in seconds
    pub connection_timeout_secs: u64,
    /// Whether authentication is required
    pub require_auth: bool,
    /// Optional password for authentication (None = no password required)
    pub password: Option<String>,
    /// Whether to allow localhost connections to bypass authentication
    pub allow_localhost_bypass: bool,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            port: DEFAULT_PORT,
            ping_interval_secs: DEFAULT_PING_INTERVAL_SECS,
            connection_timeout_secs: DEFAULT_CONNECTION_TIMEOUT_SECS,
            require_auth: false,
            password: None,
            allow_localhost_bypass: true,
        }
    }
}

impl ServerConfig {
    /// Create a new server config with the given password
    pub fn with_password(password: String) -> Self {
        Self {
            port: DEFAULT_PORT,
            ping_interval_secs: DEFAULT_PING_INTERVAL_SECS,
            connection_timeout_secs: DEFAULT_CONNECTION_TIMEOUT_SECS,
            require_auth: true,
            password: Some(password),
            allow_localhost_bypass: true,
        }
    }

    /// Get the auth config for this server
    pub fn auth_config(&self) -> AuthConfig {
        AuthConfig {
            password: self.password.clone(),
            allow_localhost_bypass: self.allow_localhost_bypass,
        }
    }
}

impl ServerState {
    /// Create a new server state with the given configuration
    pub fn new(config: ServerConfig) -> Arc<Self> {
        // Broadcast channel with capacity 256 for server-wide notifications
        let (broadcast_tx, _) = broadcast::channel(256);

        let auth_config = config.auth_config();
        let auth_handler = AuthHandler::new(auth_config.clone());
        let auth_middleware = AuthMiddleware::new(auth_handler.clone());

        // Create request router and register auth handler
        let request_router = RequestRouter::new();
        let auth_rpc_handler = AuthRpcHandler::new(auth_config);
        request_router.register("auth.login".to_string(), auth_rpc_handler.clone());
        request_router.register("auth.logout".to_string(), auth_rpc_handler.clone());
        request_router.register("auth.status".to_string(), auth_rpc_handler);

        Arc::new(Self {
            connections: DashMap::new(),
            broadcast_tx,
            started_at: Instant::now(),
            config,
            auth_handler,
            auth_middleware,
            request_router,
        })
    }

    pub async fn register_runtime_handlers(&self) -> Result<(), crate::CoreError> {
        let db = Arc::new(DatabaseClient::new(DbConfig::for_user_state()).await?);

        {
            let connection = db.connection().await;
            MigrationRunner::apply_migrations(&connection).await?;
        }

        let pty_manager = Arc::new(PtyManager::new());
        let scrollback_service = Arc::new(ScrollbackService::new());

        let workspace_handler = WorkspaceRequestHandler {
            inner: WorkspaceRpcHandler::new(db.clone()),
        };
        self.request_router
            .register("workspace.create".to_string(), workspace_handler);
        let workspace_handler = WorkspaceRequestHandler {
            inner: WorkspaceRpcHandler::new(db.clone()),
        };
        self.request_router
            .register("workspace.list".to_string(), workspace_handler);
        let workspace_handler = WorkspaceRequestHandler {
            inner: WorkspaceRpcHandler::new(db.clone()),
        };
        self.request_router
            .register("workspace.delete".to_string(), workspace_handler);
        let workspace_handler = WorkspaceRequestHandler {
            inner: WorkspaceRpcHandler::new(db.clone()),
        };
        self.request_router
            .register("workspace.rename".to_string(), workspace_handler);

        let pane_handler = PaneRequestHandler {
            inner: PaneRpcHandler::new(db.clone()),
        };
        self.request_router
            .register("pane.create".to_string(), pane_handler);
        let pane_handler = PaneRequestHandler {
            inner: PaneRpcHandler::new(db.clone()),
        };
        self.request_router
            .register("pane.list".to_string(), pane_handler);
        let pane_handler = PaneRequestHandler {
            inner: PaneRpcHandler::new(db.clone()),
        };
        self.request_router
            .register("pane.delete".to_string(), pane_handler);

        let tab_handler = TabRequestHandler {
            inner: TabRpcHandler::new(db.clone(), pty_manager.clone(), scrollback_service.clone()),
        };
        self.request_router
            .register("tab.create".to_string(), tab_handler);
        let tab_handler = TabRequestHandler {
            inner: TabRpcHandler::new(db.clone(), pty_manager.clone(), scrollback_service.clone()),
        };
        self.request_router
            .register("tab.list".to_string(), tab_handler);
        let tab_handler = TabRequestHandler {
            inner: TabRpcHandler::new(db.clone(), pty_manager.clone(), scrollback_service.clone()),
        };
        self.request_router
            .register("tab.close".to_string(), tab_handler);

        let pty_handler = PtyRequestHandler {
            inner: PtyRpcHandler::new(db.clone(), pty_manager.clone(), scrollback_service.clone()),
        };
        self.request_router
            .register("pty.connect".to_string(), pty_handler);
        let pty_handler = PtyRequestHandler {
            inner: PtyRpcHandler::new(db.clone(), pty_manager.clone(), scrollback_service.clone()),
        };
        self.request_router
            .register("pty.write".to_string(), pty_handler);
        let pty_handler = PtyRequestHandler {
            inner: PtyRpcHandler::new(db.clone(), pty_manager.clone(), scrollback_service.clone()),
        };
        self.request_router
            .register("pty.resize".to_string(), pty_handler);

        let git_handler = GitRequestHandler {
            inner: GitRpcHandler::with_db(db.clone()),
        };
        self.request_router
            .register("git.status".to_string(), git_handler);
        let git_handler = GitRequestHandler {
            inner: GitRpcHandler::with_db(db.clone()),
        };
        self.request_router
            .register("git.stage".to_string(), git_handler);
        let git_handler = GitRequestHandler {
            inner: GitRpcHandler::with_db(db.clone()),
        };
        self.request_router
            .register("git.unstage".to_string(), git_handler);
        let git_handler = GitRequestHandler {
            inner: GitRpcHandler::with_db(db.clone()),
        };
        self.request_router
            .register("git.commit".to_string(), git_handler);
        let git_handler = GitRequestHandler {
            inner: GitRpcHandler::with_db(db.clone()),
        };
        self.request_router
            .register("git.branches".to_string(), git_handler);
        let git_handler = GitRequestHandler {
            inner: GitRpcHandler::with_db(db),
        };
        self.request_router
            .register("git.checkout".to_string(), git_handler);

        Ok(())
    }

    /// Get the number of active connections
    pub fn connection_count(&self) -> usize {
        self.connections.len()
    }

    /// Get connection IDs of all connected clients
    pub fn connection_ids(&self) -> Vec<ConnectionId> {
        self.connections.iter().map(|entry| *entry.key()).collect()
    }

    /// Get a connection by ID
    pub fn get_connection(&self, id: ConnectionId) -> Option<Arc<ConnectionState>> {
        self.connections.get(&id).map(|entry| entry.clone())
    }

    /// Remove a connection
    pub fn remove_connection(&self, id: ConnectionId) -> Option<Arc<ConnectionState>> {
        self.connections.remove(&id).map(|(_, state)| state)
    }

    /// Broadcast a message to all connected clients
    pub fn broadcast(&self, message: String) -> usize {
        self.broadcast_tx.send(message).unwrap_or_default()
    }

    /// Send a message to a specific connection
    pub fn send_to(&self, id: ConnectionId, message: Message) -> Result<(), String> {
        if let Some(entry) = self.connections.get(&id) {
            let state = entry.value();
            state
                .tx
                .send(message)
                .map_err(|_| "Failed to send message".to_string())
        } else {
            Err("Connection not found".to_string())
        }
    }
}

/// WebSocket server handle for graceful shutdown
#[derive(Debug)]
pub struct ServerHandle {
    /// Shutdown signal sender
    pub shutdown_tx: mpsc::Sender<()>,
    /// Server task handle
    pub task_handle: tokio::task::JoinHandle<()>,
}

impl ServerHandle {
    /// Request graceful shutdown of the server
    pub async fn shutdown(self) -> Result<(), String> {
        // Send shutdown signal
        self.shutdown_tx
            .send(())
            .await
            .map_err(|_| "Failed to send shutdown signal".to_string())?;

        // Wait for server to stop
        self.task_handle
            .await
            .map_err(|_| "Server task panicked".to_string())?;

        Ok(())
    }
}

/// WebSocket upgrade handler
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(state): State<Arc<ServerState>>,
) -> Response {
    ws.on_upgrade(move |socket| handle_socket(socket, addr, state))
}

/// Handle a WebSocket connection
async fn handle_socket(socket: WebSocket, addr: SocketAddr, state: Arc<ServerState>) {
    let connection_id = ConnectionId::new();

    // Create channel for sending messages to this client
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    // Create connection state
    let conn_state = Arc::new(ConnectionState::new(connection_id, addr, tx));

    // Add to connections map
    state.connections.insert(connection_id, conn_state.clone());

    // Split socket into sender and receiver
    let (mut sender, mut receiver) = socket.split();

    // Subscribe to broadcast channel
    let mut broadcast_rx = state.broadcast_tx.subscribe();

    // Clone for ping task
    let ping_state = conn_state.clone();
    let server_state = state.clone();
    let ping_interval_secs = state.config.ping_interval_secs;
    let timeout_secs = state.config.connection_timeout_secs;

    // Spawn ping task
    let mut ping_task = tokio::spawn(async move {
        let mut interval = interval(Duration::from_secs(ping_interval_secs));

        loop {
            interval.tick().await;

            // Check if connection has timed out
            if ping_state
                .is_timed_out(Duration::from_secs(timeout_secs))
                .await
            {
                break;
            }

            // Send ping
            if ping_state.tx.send(Message::Ping(vec![])).is_err() {
                break;
            }
        }
    });

    // Handle messages
    loop {
        tokio::select! {
            // Handle incoming WebSocket messages
            msg = receiver.next() => {
                if let Some(Ok(msg)) = msg {
                    if !handle_message(msg, &conn_state, &server_state).await {
                        break;
                    }
                } else {
                    break;
                }
            }

                // Handle messages from the channel (to send to client)
                Some(msg) = rx.recv() => {
                    if sender.send(msg).await.is_err() {
                        break;
                    }
                }

                // Handle broadcast messages
                Ok(msg) = broadcast_rx.recv() => {
                    if sender.send(Message::Text(msg)).await.is_err() {
                        break;
                    }
                }

            // Ping task completed (timeout or error)
            _ = &mut ping_task => {
                break;
            }
        }
    }

    // Cleanup
    ping_task.abort();
    state.remove_connection(connection_id);
}

/// Handle a single WebSocket message
/// Returns false if the connection should be closed
async fn handle_message(
    msg: Message,
    conn_state: &Arc<ConnectionState>,
    server_state: &Arc<ServerState>,
) -> bool {
    match msg {
        Message::Text(text) => {
            conn_state.update_activity().await;

            // Parse JSON-RPC message
            match IncomingMessage::parse(&text) {
                Ok(incoming) => {
                    // Check if method requires authentication
                    if let Some(method) = incoming.method() {
                        let requires_auth = AuthMiddleware::method_requires_auth(method);

                        if requires_auth {
                            // Check if connection is authorized
                            let is_authenticated = conn_state.is_authenticated().await;
                            if let Err(auth_err) = server_state
                                .auth_middleware
                                .check_auth(is_authenticated, &conn_state.addr)
                            {
                                // Send auth error response
                                if let Some(correlation_id) = incoming.correlation_id() {
                                    let protocol_err: crate::server::protocol::ProtocolError =
                                        auth_err.into();
                                    let error_response = OutgoingMessage::error(
                                        correlation_id.clone(),
                                        protocol_err.to_jsonrpc_error(),
                                    );
                                    if let Ok(json) = error_response.to_json() {
                                        let _ = conn_state.tx.send(Message::Text(json));
                                    }
                                }
                                return true;
                            }
                        }

                        // Handle auth.login specially to mark connection as authenticated
                        if method == "auth.login" {
                            if let IncomingMessage::Request {
                                params,
                                correlation_id,
                                ..
                            } = incoming
                            {
                                match server_state
                                    .request_router
                                    .route("auth.login", params)
                                    .await
                                {
                                    Ok(result) => {
                                        // Check if login was successful
                                        if let Ok(output) =
                                            serde_json::from_value::<crate::handlers::LoginOutput>(
                                                result.clone(),
                                            )
                                        {
                                            if output.success {
                                                // Mark connection as authenticated
                                                conn_state.set_authenticated(true).await;
                                            }
                                        }
                                        // Send success response
                                        let response =
                                            OutgoingMessage::success(correlation_id, result);
                                        if let Ok(json) = response.to_json() {
                                            let _ = conn_state.tx.send(Message::Text(json));
                                        }
                                    }
                                    Err(e) => {
                                        let error_response = OutgoingMessage::error(
                                            correlation_id,
                                            e.to_jsonrpc_error(),
                                        );
                                        if let Ok(json) = error_response.to_json() {
                                            let _ = conn_state.tx.send(Message::Text(json));
                                        }
                                    }
                                }
                                return true;
                            }
                        }

                        // Handle auth.status specially to include connection context
                        if method == "auth.status" {
                            if let IncomingMessage::Request { correlation_id, .. } = incoming {
                                let is_authenticated = conn_state.is_authenticated().await;
                                let status = server_state
                                    .auth_handler
                                    .get_status(is_authenticated, &conn_state.addr);
                                if let Ok(result) = serde_json::to_value(status) {
                                    let response = OutgoingMessage::success(correlation_id, result);
                                    if let Ok(json) = response.to_json() {
                                        let _ = conn_state.tx.send(Message::Text(json));
                                    }
                                }
                                return true;
                            }
                        }

                        // Route other methods
                        if let IncomingMessage::Request {
                            method,
                            params,
                            correlation_id,
                        } = incoming
                        {
                            match server_state.request_router.route(&method, params).await {
                                Ok(result) => {
                                    let response = OutgoingMessage::success(correlation_id, result);
                                    if let Ok(json) = response.to_json() {
                                        let _ = conn_state.tx.send(Message::Text(json));
                                    }
                                }
                                Err(e) => {
                                    let error_response = OutgoingMessage::error(
                                        correlation_id,
                                        e.to_jsonrpc_error(),
                                    );
                                    if let Ok(json) = error_response.to_json() {
                                        let _ = conn_state.tx.send(Message::Text(json));
                                    }
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    // Send parse error response
                    let error_response =
                        OutgoingMessage::error("0".to_string(), e.to_jsonrpc_error());
                    if let Ok(json) = error_response.to_json() {
                        let _ = conn_state.tx.send(Message::Text(json));
                    }
                }
            }
            true
        }
        Message::Binary(data) => {
            let _ = data;
            conn_state.update_activity().await;
            true
        }
        Message::Pong(_) => {
            conn_state.update_activity().await;
            true
        }
        Message::Ping(data) => {
            // Respond with pong
            let _ = conn_state.tx.send(Message::Pong(data));
            conn_state.update_activity().await;
            true
        }
        Message::Close(_) => false,
    }
}

/// Create the axum router with WebSocket route
pub fn create_router(state: Arc<ServerState>) -> Router {
    Router::new()
        .route("/ws", get(ws_handler))
        .with_state(state)
}

/// Start the WebSocket server
pub async fn start_server(
    config: ServerConfig,
) -> Result<ServerHandle, Box<dyn std::error::Error>> {
    let state = ServerState::new(config.clone());
    state.register_runtime_handlers().await?;
    let app = create_router(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    let listener = tokio::net::TcpListener::bind(&addr).await?;

    let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);

    let task_handle = tokio::spawn(async move {
        let server = axum::serve(
            listener,
            app.into_make_service_with_connect_info::<SocketAddr>(),
        );

        // Run server with graceful shutdown
        let server_with_shutdown = server.with_graceful_shutdown(async move {
            shutdown_rx.recv().await;
        });

        let _ = server_with_shutdown.await;
    });

    Ok(ServerHandle {
        shutdown_tx,
        task_handle,
    })
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::time::sleep;

    #[test]
    fn test_connection_id_generation() {
        let id1 = ConnectionId::new();
        let id2 = ConnectionId::new();
        assert_ne!(id1, id2);
    }

    #[test]
    fn test_server_config_default() {
        let config = ServerConfig::default();
        assert_eq!(config.port, DEFAULT_PORT);
        assert_eq!(config.ping_interval_secs, DEFAULT_PING_INTERVAL_SECS);
        assert_eq!(
            config.connection_timeout_secs,
            DEFAULT_CONNECTION_TIMEOUT_SECS
        );
        assert!(!config.require_auth);
        assert!(config.password.is_none());
        assert!(config.allow_localhost_bypass);
    }

    #[test]
    fn test_server_config_with_password() {
        let config = ServerConfig::with_password("secret".to_string());
        assert_eq!(config.port, DEFAULT_PORT);
        assert!(config.require_auth);
        assert_eq!(config.password, Some("secret".to_string()));
        assert!(config.allow_localhost_bypass);
    }

    #[test]
    fn test_server_config_auth_config() {
        let config = ServerConfig::with_password("secret".to_string());
        let auth_config = config.auth_config();
        assert_eq!(auth_config.password, Some("secret".to_string()));
        assert!(auth_config.allow_localhost_bypass);
    }

    #[tokio::test]
    async fn test_server_state_creation() {
        let config = ServerConfig::default();
        let state = ServerState::new(config);

        assert_eq!(state.connection_count(), 0);
        assert!(state.connection_ids().is_empty());
    }

    #[tokio::test]
    async fn test_connection_state_activity() {
        let (tx, _rx) = mpsc::unbounded_channel();
        let addr = SocketAddr::from(([127, 0, 0, 1], 12345));
        let state = ConnectionState::new(ConnectionId::new(), addr, tx);

        // Initially not timed out
        assert!(!state.is_timed_out(Duration::from_secs(1)).await);

        // Update activity
        sleep(Duration::from_millis(10)).await;
        state.update_activity().await;

        // Should still not be timed out
        assert!(!state.is_timed_out(Duration::from_millis(5)).await);
    }

    #[tokio::test]
    async fn test_connection_state_authentication() {
        let (tx, _rx) = mpsc::unbounded_channel();
        let addr = SocketAddr::from(([127, 0, 0, 1], 12345));
        let state = ConnectionState::new(ConnectionId::new(), addr, tx);

        // Initially not authenticated
        assert!(!state.is_authenticated().await);

        // Set authenticated
        state.set_authenticated(true).await;
        assert!(state.is_authenticated().await);

        // Set unauthenticated
        state.set_authenticated(false).await;
        assert!(!state.is_authenticated().await);
    }

    #[tokio::test]
    async fn test_server_state_add_remove_connection() {
        let config = ServerConfig::default();
        let state = ServerState::new(config);

        let (tx, _rx) = mpsc::unbounded_channel();
        let addr = SocketAddr::from(([127, 0, 0, 1], 12345));
        let conn_id = ConnectionId::new();
        let conn_state = Arc::new(ConnectionState::new(conn_id, addr, tx));

        // Add connection
        state.connections.insert(conn_id, conn_state);
        assert_eq!(state.connection_count(), 1);
        assert_eq!(state.connection_ids().len(), 1);

        // Get connection
        let retrieved = state.get_connection(conn_id);
        assert!(retrieved.is_some());

        // Remove connection
        state.remove_connection(conn_id);
        assert_eq!(state.connection_count(), 0);
        assert!(state.get_connection(conn_id).is_none());
    }

    #[tokio::test]
    async fn test_server_state_broadcast() {
        let config = ServerConfig::default();
        let state = ServerState::new(config);

        // Subscribe to broadcast
        let mut rx = state.broadcast_tx.subscribe();

        // Broadcast message
        let count = state.broadcast("test message".to_string());
        assert_eq!(count, 1);

        // Receive message
        let msg = rx.recv().await.unwrap();
        assert_eq!(msg, "test message");
    }

    #[tokio::test]
    async fn test_server_state_send_to() {
        let config = ServerConfig::default();
        let state = ServerState::new(config);

        let (tx, mut rx) = mpsc::unbounded_channel();
        let addr = SocketAddr::from(([127, 0, 0, 1], 12345));
        let conn_id = ConnectionId::new();
        let conn_state = Arc::new(ConnectionState::new(conn_id, addr, tx));

        // Add connection
        state.connections.insert(conn_id, conn_state);

        // Send message
        let result = state.send_to(conn_id, Message::Text("hello".to_string()));
        assert!(result.is_ok());

        // Receive message
        let msg = rx.recv().await.unwrap();
        assert_eq!(msg, Message::Text("hello".to_string()));
    }

    #[tokio::test]
    async fn test_server_state_send_to_not_found() {
        let config = ServerConfig::default();
        let state = ServerState::new(config);

        let conn_id = ConnectionId::new();
        let result = state.send_to(conn_id, Message::Text("hello".to_string()));
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Connection not found");
    }

    #[test]
    fn test_create_router() {
        let config = ServerConfig::default();
        let state = ServerState::new(config);
        let _router = create_router(state);
        // Router created successfully
    }

    #[tokio::test]
    async fn test_auth_middleware_blocks_protected_methods() {
        let config = ServerConfig::with_password("secret".to_string());
        let state = ServerState::new(config);

        let (tx, mut rx) = mpsc::unbounded_channel();
        let addr = SocketAddr::from(([192, 168, 1, 1], 12345));
        let conn_id = ConnectionId::new();
        let conn_state = Arc::new(ConnectionState::new(conn_id, addr, tx));

        state.connections.insert(conn_id, conn_state.clone());

        let request = r#"{"jsonrpc":"2.0","id":"req-1","method":"workspace.list","params":{}}"#;
        let msg = Message::Text(request.to_string());

        let result = handle_message(msg, &conn_state, &state).await;
        assert!(result);

        let response = rx.recv().await.unwrap();
        if let Message::Text(text) = response {
            assert!(text.contains("error"));
            assert!(text.contains("Authentication required"));
        } else {
            panic!("Expected text message");
        }
    }

    #[tokio::test]
    async fn test_auth_login_marks_connection_authenticated() {
        let config = ServerConfig::with_password("secret".to_string());
        let state = ServerState::new(config);

        let (tx, mut rx) = mpsc::unbounded_channel();
        let addr = SocketAddr::from(([192, 168, 1, 1], 12345));
        let conn_id = ConnectionId::new();
        let conn_state = Arc::new(ConnectionState::new(conn_id, addr, tx));

        state.connections.insert(conn_id, conn_state.clone());

        assert!(!conn_state.is_authenticated().await);

        let request = r#"{"jsonrpc":"2.0","id":"req-1","method":"auth.login","params":{"password":"secret"}}"#;
        let msg = Message::Text(request.to_string());

        let result = handle_message(msg, &conn_state, &state).await;
        assert!(result);

        assert!(conn_state.is_authenticated().await);

        let response = rx.recv().await.unwrap();
        if let Message::Text(text) = response {
            assert!(text.contains("success"));
            assert!(text.contains("true"));
        } else {
            panic!("Expected text message");
        }
    }

    #[tokio::test]
    async fn test_auth_login_wrong_password_fails() {
        let config = ServerConfig::with_password("secret".to_string());
        let state = ServerState::new(config);

        let (tx, mut rx) = mpsc::unbounded_channel();
        let addr = SocketAddr::from(([192, 168, 1, 1], 12345));
        let conn_id = ConnectionId::new();
        let conn_state = Arc::new(ConnectionState::new(conn_id, addr, tx));

        state.connections.insert(conn_id, conn_state.clone());

        let request =
            r#"{"jsonrpc":"2.0","id":"req-1","method":"auth.login","params":{"password":"wrong"}}"#;
        let msg = Message::Text(request.to_string());

        let result = handle_message(msg, &conn_state, &state).await;
        assert!(result);

        assert!(!conn_state.is_authenticated().await);

        let response = rx.recv().await.unwrap();
        if let Message::Text(text) = response {
            assert!(text.contains("success"));
            assert!(text.contains("false"));
        } else {
            panic!("Expected text message");
        }
    }

    #[tokio::test]
    async fn test_localhost_bypass_allows_protected_methods() {
        let config = ServerConfig::with_password("secret".to_string());
        let state = ServerState::new(config);

        let (tx, mut rx) = mpsc::unbounded_channel();
        let addr = SocketAddr::from(([127, 0, 0, 1], 12345));
        let conn_id = ConnectionId::new();
        let conn_state = Arc::new(ConnectionState::new(conn_id, addr, tx));

        state.connections.insert(conn_id, conn_state.clone());

        let request = r#"{"jsonrpc":"2.0","id":"req-1","method":"workspace.list","params":{}}"#;
        let msg = Message::Text(request.to_string());

        let result = handle_message(msg, &conn_state, &state).await;
        assert!(result);

        let response = rx.recv().await.unwrap();
        if let Message::Text(text) = response {
            assert!(text.contains("error"));
            assert!(text.contains("Method not found"));
            assert!(!text.contains("Authentication required"));
        } else {
            panic!("Expected text message");
        }
    }

    #[tokio::test]
    async fn test_auth_status_returns_connection_context() {
        let config = ServerConfig::with_password("secret".to_string());
        let state = ServerState::new(config);

        let (tx, mut rx) = mpsc::unbounded_channel();
        let addr = SocketAddr::from(([127, 0, 0, 1], 12345));
        let conn_id = ConnectionId::new();
        let conn_state = Arc::new(ConnectionState::new(conn_id, addr, tx));

        state.connections.insert(conn_id, conn_state.clone());

        let request = r#"{"jsonrpc":"2.0","id":"req-1","method":"auth.status"}"#;
        let msg = Message::Text(request.to_string());

        let result = handle_message(msg, &conn_state, &state).await;
        assert!(result);

        let response = rx.recv().await.unwrap();
        if let Message::Text(text) = response {
            assert!(text.contains("authenticated"));
            assert!(text.contains("auth_required"));
            assert!(text.contains("is_localhost"));
        } else {
            panic!("Expected text message");
        }
    }
}
