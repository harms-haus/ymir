//! Client connection hub for WebSocket server
//!
//! Manages client connections, broadcasting, and message routing.

use crate::protocol::ServerMessage;
use crate::state::{AppState, ClientState, HEARTBEAT_TIMEOUT_SECS};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::mpsc;
use tracing::{debug, info, warn};
use uuid::Uuid;

impl AppState {
    /// Register a new client connection
    pub async fn connect(&self, client_id: Uuid) -> mpsc::Receiver<ServerMessage> {
        let (tx, rx) = mpsc::channel(256);

        let client_state = ClientState {
            tx,
            last_pong: Instant::now(),
        };

        self.clients.write().await.insert(client_id, client_state);
        info!(%client_id, "Client connected");

        rx
    }

    /// Unregister a client connection
    pub async fn disconnect(&self, client_id: Uuid) {
        if self.clients.write().await.remove(&client_id).is_some() {
            info!(%client_id, "Client disconnected");
        }
    }

    /// Broadcast a message to all connected clients
    pub async fn broadcast(&self, message: ServerMessage) {
        let clients: Vec<_> = self
            .clients
            .read()
            .await
            .iter()
            .map(|(client_id, client_state)| (*client_id, client_state.tx.clone()))
            .collect();
        let mut failed_clients = Vec::new();

        for (client_id, tx) in clients {
            if let Err(e) = tx.send(message.clone()).await {
                warn!(%client_id, error = %e, "Failed to send message to client");
                failed_clients.push(client_id);
            }
        }

        for client_id in failed_clients {
            self.disconnect(client_id).await;
        }
    }

    /// Send a message to a specific client
    pub async fn send_to(&self, client_id: Uuid, message: ServerMessage) -> bool {
        let tx = self
            .clients
            .read()
            .await
            .get(&client_id)
            .map(|client_state| client_state.tx.clone());

        if let Some(tx) = tx {
            if let Err(e) = tx.send(message).await {
                warn!(%client_id, error = %e, "Failed to send message to client");
                self.disconnect(client_id).await;
                return false;
            }
            return true;
        }
        false
    }

    /// Update the last pong timestamp for a client
    pub async fn update_pong(&self, client_id: Uuid) -> bool {
        let mut clients = self.clients.write().await;
        if let Some(client_state) = clients.get_mut(&client_id) {
            client_state.last_pong = Instant::now();
            debug!(%client_id, "Updated pong timestamp");
            return true;
        }
        false
    }

    /// Check if a client has timed out (no pong within timeout period)
    pub async fn is_client_timed_out(&self, client_id: Uuid) -> bool {
        let clients = self.clients.read().await;
        if let Some(client_state) = clients.get(&client_id) {
            let elapsed = client_state.last_pong.elapsed();
            return elapsed > Duration::from_secs(HEARTBEAT_TIMEOUT_SECS);
        }
        true
    }

    /// Get the number of connected clients
    pub async fn client_count(&self) -> usize {
        self.clients.read().await.len()
    }

    /// Get list of connected client IDs
    pub async fn connected_clients(&self) -> Vec<Uuid> {
        self.clients.read().await.keys().copied().collect()
    }
}

/// Handle incoming pong message
pub async fn handle_pong(state: Arc<AppState>, client_id: Uuid, timestamp: u64) {
    debug!(%client_id, timestamp, "Received pong");
    state.update_pong(client_id).await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{Pong, ServerMessagePayload};
    use tokio::time::timeout;

    #[tokio::test]
    async fn test_connect_disconnect() {
        let state = AppState::new_test().await;
        let client_id = Uuid::new_v4();

        let mut rx = state.connect(client_id).await;
        assert_eq!(state.client_count().await, 1);

        state.disconnect(client_id).await;
        assert_eq!(state.client_count().await, 0);

        // Channel should be closed
        assert!(rx.recv().await.is_none());
    }

    #[tokio::test]
    async fn test_send_to_client() {
        let state = AppState::new_test().await;
        let client_id = Uuid::new_v4();

        let mut rx = state.connect(client_id).await;

        let msg = ServerMessage::new(ServerMessagePayload::Pong(Pong { timestamp: 12345 }));
        assert!(state.send_to(client_id, msg.clone()).await);

        let received = timeout(Duration::from_millis(100), rx.recv())
            .await
            .expect("Should receive message")
            .expect("Should have message");

        assert_eq!(received, msg);
    }

    #[tokio::test]
    async fn test_send_to_nonexistent_client() {
        let state = AppState::new_test().await;
        let client_id = Uuid::new_v4();

        let msg = ServerMessage::new(ServerMessagePayload::Pong(Pong { timestamp: 12345 }));
        assert!(!state.send_to(client_id, msg).await);
    }

    #[tokio::test]
    async fn test_broadcast() {
        let state = AppState::new_test().await;

        let client1 = Uuid::new_v4();
        let client2 = Uuid::new_v4();
        let mut rx1 = state.connect(client1).await;
        let mut rx2 = state.connect(client2).await;

        let msg = ServerMessage::new(ServerMessagePayload::Pong(Pong { timestamp: 12345 }));
        state.broadcast(msg.clone()).await;

        let received1 = timeout(Duration::from_millis(100), rx1.recv())
            .await
            .expect("Client 1 should receive")
            .expect("Should have message");

        let received2 = timeout(Duration::from_millis(100), rx2.recv())
            .await
            .expect("Client 2 should receive")
            .expect("Should have message");

        assert_eq!(received1, msg);
        assert_eq!(received2, msg);
    }

    #[tokio::test]
    async fn test_pong_updates_timestamp() {
        let state = AppState::new_test().await;
        let client_id = Uuid::new_v4();

        state.connect(client_id).await;

        // Initially should not be timed out
        assert!(!state.is_client_timed_out(client_id).await);

        // Update pong
        assert!(state.update_pong(client_id).await);

        // Still not timed out
        assert!(!state.is_client_timed_out(client_id).await);
    }

    #[tokio::test]
    async fn test_client_timeout() {
        let state = AppState::new_test().await;
        let client_id = Uuid::new_v4();

        // Manually insert a client with old timestamp
        let (tx, _rx) = mpsc::channel(256);
        let old_time = Instant::now() - Duration::from_secs(HEARTBEAT_TIMEOUT_SECS + 1);
        state.clients.write().await.insert(
            client_id,
            ClientState {
                tx,
                last_pong: old_time,
            },
        );

        assert!(state.is_client_timed_out(client_id).await);
    }

    #[tokio::test]
    async fn test_connected_clients_list() {
        let state = AppState::new_test().await;

        let client1 = Uuid::new_v4();
        let client2 = Uuid::new_v4();

        state.connect(client1).await;
        state.connect(client2).await;

        let clients = state.connected_clients().await;
        assert_eq!(clients.len(), 2);
        assert!(clients.contains(&client1));
        assert!(clients.contains(&client2));
    }
}
