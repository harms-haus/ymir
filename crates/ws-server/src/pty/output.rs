//! PTY output reader task

use std::io::Read;
use std::sync::Arc;
use std::time::Duration;

use tokio::task::JoinHandle;
use tracing::{debug, error, info, instrument, warn};
use uuid::Uuid;

use crate::protocol::{ServerMessage, ServerMessagePayload, TerminalOutput};
use crate::state::AppState;

const READ_BUFFER_SIZE: usize = 4096;

const READ_TIMEOUT_MS: u64 = 100;

#[instrument(skip(reader, state), fields(session_id = %session_id))]
pub fn spawn_output_reader(
    session_id: Uuid,
    mut reader: Box<dyn Read + Send>,
    state: Arc<AppState>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        info!("PTY output reader started");

        let mut leftover_bytes: Vec<u8> = Vec::new();

        loop {
            let mut buf = [0u8; READ_BUFFER_SIZE];
            let read_result = reader.read(&mut buf);

            match read_result {
                Ok(0) => {
                    info!("PTY output reader reached EOF, session exiting");
                    break;
                }
                Ok(n) => {
                    let data = &buf[..n];
                    
                    if data.is_empty() {
                        tokio::time::sleep(Duration::from_millis(READ_TIMEOUT_MS)).await;
                        continue;
                    }

                    let mut combined = std::mem::take(&mut leftover_bytes);
                    combined.extend_from_slice(data);

                    let (valid_str, remaining) = split_at_valid_utf8(&combined);

                    leftover_bytes = remaining;

            if !valid_str.is_empty() {
                let output_data = valid_str.to_string();
                let output_msg = ServerMessage::new(ServerMessagePayload::TerminalOutput(
                    TerminalOutput {
                        session_id,
                        data: output_data.clone(),
                    },
                ));

                state.broadcast(output_msg).await;
                debug!(bytes = data.len(), "Broadcast terminal output");

                let db = state.db.clone();
                let session_id_str = session_id.to_string();
                let output_data_clone = output_data.clone();
                tokio::spawn(async move {
                    if let Err(e) = db.append_terminal_output(&session_id_str, &output_data_clone).await {
                        tracing::error!("Failed to store terminal output: {}", e);
                    }
                });
            }
                }
                Err(e) => {
                    if e.kind() == std::io::ErrorKind::WouldBlock {
                        tokio::time::sleep(Duration::from_millis(READ_TIMEOUT_MS)).await;
                        continue;
                    } else {
                        error!("PTY read error: {}", e);
                        break;
                    }
                }
            }
        }

    if !leftover_bytes.is_empty() {
        let lossy_str = String::from_utf8_lossy(&leftover_bytes);
        if !lossy_str.is_empty() {
            let output_data = lossy_str.to_string();
            let output_msg = ServerMessage::new(ServerMessagePayload::TerminalOutput(
                TerminalOutput {
                    session_id,
                    data: output_data.clone(),
                },
            ));
            state.broadcast(output_msg).await;

            let db = state.db.clone();
            let session_id_str = session_id.to_string();
            tokio::spawn(async move {
                if let Err(e) = db.append_terminal_output(&session_id_str, &output_data).await {
                    tracing::error!("Failed to store terminal output: {}", e);
                }
            });
        }
    }

        info!("PTY output reader stopped");
    })
}

/// Splits a byte slice at the last valid UTF-8 boundary.
///
/// Returns a tuple of (valid_utf8_string, remaining_bytes).
/// The remaining bytes may be incomplete UTF-8 sequences that should
/// be prepended to the next chunk.
fn split_at_valid_utf8(bytes: &[u8]) -> (&str, Vec<u8>) {
    match std::str::from_utf8(bytes) {
        Ok(s) => (s, Vec::new()),
        Err(e) => {
            let valid_end = e.valid_up_to();

            // Check if there are incomplete sequences at the end
            let (valid, remaining) = bytes.split_at(valid_end);

            // Safety: valid_up_to() returns a valid UTF-8 boundary
            let valid_str = unsafe { std::str::from_utf8_unchecked(valid) };

            (valid_str, remaining.to_vec())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_split_at_valid_utf8_complete() {
        let bytes = b"Hello, World!";
        let (valid, remaining) = split_at_valid_utf8(bytes);
        assert_eq!(valid, "Hello, World!");
        assert!(remaining.is_empty());
    }

    #[test]
    fn test_split_at_valid_utf8_partial() {
        // "Hello" followed by an incomplete UTF-8 sequence for "世" (should be 3 bytes)
        let bytes = b"Hello\xe4\xb8";
        let (valid, remaining) = split_at_valid_utf8(bytes);
        assert_eq!(valid, "Hello");
        assert_eq!(remaining, vec![0xe4, 0xb8]);
    }

    #[test]
    fn test_split_at_valid_utf8_empty() {
        let bytes: &[u8] = b"";
        let (valid, remaining) = split_at_valid_utf8(bytes);
        assert_eq!(valid, "");
        assert!(remaining.is_empty());
    }

    #[test]
    fn test_split_at_valid_utf8_multibyte() {
        // "Hello世界" in UTF-8
        let bytes = "Hello世界".as_bytes();
        let (valid, remaining) = split_at_valid_utf8(bytes);
        assert_eq!(valid, "Hello世界");
        assert!(remaining.is_empty());
    }

    #[test]
    fn test_split_at_valid_utf8_incomplete_multibyte() {
        // "Hello世" followed by incomplete "界" (only 2 of 3 bytes)
        let bytes = b"Hello\xe4\xb8\x96\xe7\x95";
        let (valid, remaining) = split_at_valid_utf8(bytes);
        assert_eq!(valid, "Hello世");
        assert_eq!(remaining, vec![0xe7, 0x95]);
    }
}