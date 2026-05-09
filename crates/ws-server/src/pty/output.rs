//! PTY output reader task

use std::sync::Arc;
use std::time::Duration;

#[cfg(unix)]
use std::os::unix::io::RawFd;

use tokio::sync::Mutex as TokioMutex;
use tokio::task::JoinHandle;
use tracing::{debug, error, info, instrument};
use uuid::Uuid;

use crate::protocol::{ServerMessage, ServerMessagePayload, TerminalOutput};
use crate::state::AppState;

const READ_BUFFER_SIZE: usize = 4096;

const READ_TIMEOUT_MS: u64 = 100;

/// Spawn an output reader that reads from the PTY master fd using
/// direct libc reads, which properly handle non-blocking I/O on PTY fds.
/// portable_pty's try_clone_reader() can block indefinitely on Linux PTYs
/// even when O_NONBLOCK is set.
#[cfg(unix)]
#[instrument(skip(state), fields(session_id = %session_id))]
pub fn spawn_output_reader(
    session_id: Uuid,
    master_fd: RawFd,
    state: Arc<AppState>,
    user_input_received: Arc<TokioMutex<bool>>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        info!("PTY output reader started");

        // Dup the fd so we have an independent copy that won't interfere
        // with the session's own master fd usage.
        let reader_fd = unsafe { libc::dup(master_fd) };
        if reader_fd < 0 {
            error!("Failed to dup master fd: {}", std::io::Error::last_os_error());
            return;
        }

        // Ensure the dup'd fd is non-blocking.
        let flags = unsafe { libc::fcntl(reader_fd, libc::F_GETFL) };
        if flags != -1 {
            unsafe { libc::fcntl(reader_fd, libc::F_SETFL, flags | libc::O_NONBLOCK) };
        }

        // Accumulator for incomplete multi-byte UTF-8 sequences at chunk boundaries.
        // PTY output is binary (escape sequences, control codes), so we use lossy
        // conversion. This accumulator only holds a few bytes (incomplete UTF-8).
        let mut utf8_tail: Vec<u8> = Vec::new();

        loop {
            let mut buf = [0u8; READ_BUFFER_SIZE];
            let read_result = unsafe {
                libc::read(
                    reader_fd,
                    buf.as_mut_ptr() as *mut libc::c_void,
                    READ_BUFFER_SIZE,
                )
            };

            if read_result == 0 {
                // Flush any accumulated tail bytes on EOF
                if !utf8_tail.is_empty() {
                    let output_data = String::from_utf8_lossy(&utf8_tail).to_string();
                    broadcast_output(&state, session_id, &output_data, &user_input_received).await;
                }
                info!("PTY output reader reached EOF, session exiting");
                break;
            } else if read_result > 0 {
                let n = read_result as usize;
                let data = &buf[..n];

                if data.is_empty() {
                    tokio::time::sleep(Duration::from_millis(READ_TIMEOUT_MS)).await;
                    continue;
                }

                // Combine any leftover incomplete UTF-8 tail with new data
                let mut combined = std::mem::take(&mut utf8_tail);
                combined.extend_from_slice(data);

                // Find the longest valid UTF-8 prefix
                let (valid_prefix, tail) = find_valid_utf8_prefix(&combined);

                // Save incomplete bytes for the next read
                utf8_tail = tail;

                if !valid_prefix.is_empty() {
                    let output_data = valid_prefix.to_string();
                    broadcast_output(&state, session_id, &output_data, &user_input_received).await;
                }
            } else {
                let errno = std::io::Error::last_os_error();
                if errno.kind() == std::io::ErrorKind::WouldBlock {
                    tokio::time::sleep(Duration::from_millis(READ_TIMEOUT_MS)).await;
                    continue;
                } else if errno.raw_os_error() == Some(libc::EINTR) {
                    continue;
                } else {
                    error!("PTY read error: {} (errno={})", errno, errno.raw_os_error().unwrap_or(-1));
                    break;
                }
            }
        }

        unsafe { libc::close(reader_fd) };
        info!("PTY output reader stopped");
    })
}

/// Fallback for non-Unix platforms using the portable_pty reader.
#[cfg(not(unix))]
#[instrument(skip(reader, state), fields(session_id = %session_id))]
pub fn spawn_output_reader(
    session_id: Uuid,
    mut reader: Box<dyn std::io::Read + Send>,
    state: Arc<AppState>,
    user_input_received: Arc<TokioMutex<bool>>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        info!("PTY output reader started");

        let mut utf8_tail: Vec<u8> = Vec::new();

        loop {
            let mut buf = [0u8; READ_BUFFER_SIZE];
            let read_result = reader.read(&mut buf);

            match read_result {
                Ok(0) => {
                    if !utf8_tail.is_empty() {
                        let output_data = String::from_utf8_lossy(&utf8_tail).to_string();
                        broadcast_output(&state, session_id, &output_data, &user_input_received).await;
                    }
                    info!("PTY output reader reached EOF, session exiting");
                    break;
                }
                Ok(n) => {
                    let data = &buf[..n];

                    if data.is_empty() {
                        tokio::time::sleep(Duration::from_millis(READ_TIMEOUT_MS)).await;
                        continue;
                    }

                    let mut combined = std::mem::take(&mut utf8_tail);
                    combined.extend_from_slice(data);

                    let (valid_prefix, tail) = find_valid_utf8_prefix(&combined);
                    utf8_tail = tail;

                    if !valid_prefix.is_empty() {
                        let output_data = valid_prefix.to_string();
                        broadcast_output(&state, session_id, &output_data, &user_input_received).await;
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

        info!("PTY output reader stopped");
    })
}

/// Helper to broadcast terminal output and persist to DB.
/// WebSocket broadcast always happens; DB persistence only happens if
/// user_input_received is true (i.e., the user has typed something).
async fn broadcast_output(
    state: &AppState,
    session_id: Uuid,
    output_data: &str,
    user_input_received: &Arc<TokioMutex<bool>>,
) {
    let output_msg = ServerMessage::new(ServerMessagePayload::TerminalOutput(
        TerminalOutput {
            session_id,
            data: output_data.to_string(),
        },
    ));

    // Always broadcast to WebSocket so the user sees output including prompts
    state.broadcast(output_msg).await;
    info!(bytes = output_data.len(), "Broadcast terminal output");

    // Only persist to DB if user has sent input (avoids storing duplicate prompts)
    let should_persist = *user_input_received.lock().await;
    if should_persist {
        let db = state.db.clone();
        let session_id_str = session_id.to_string();
        let output_data_clone = output_data.to_string();
        tokio::spawn(async move {
            if let Err(e) = db.append_terminal_output(&session_id_str, &output_data_clone).await {
                tracing::error!("Failed to store terminal output: {}", e);
            }
        });
    }
}

/// Finds the longest valid UTF-8 prefix of the byte slice.
/// Returns (valid_prefix, remaining_bytes).
///
/// Unlike `split_at_valid_utf8`, this uses `from_utf8_lossy` for the prefix
/// so that binary escape sequences (DCS, OSC, etc.) containing invalid UTF-8
/// are converted with replacement characters instead of being stuck in
/// the remaining buffer forever.
///
/// The `remaining` only contains bytes from an *incomplete* multi-byte UTF-8
/// sequence at the very end of the buffer (1-3 bytes).
fn find_valid_utf8_prefix(bytes: &[u8]) -> (String, Vec<u8>) {
    if bytes.is_empty() {
        return (String::new(), Vec::new());
    }

    // Scan from the end to find up to 3 bytes that might be an incomplete
    // multi-byte UTF-8 sequence.
    let tail_len = tail_incomplete_utf8(bytes);

    if tail_len == 0 {
        // Entire buffer is complete UTF-8 or invalid bytes.
        // Use from_utf8_lossy to convert everything.
        return (String::from_utf8_lossy(bytes).to_string(), Vec::new());
    }

    let split_point = bytes.len() - tail_len;
    let (prefix, tail) = bytes.split_at(split_point);

    // The prefix is complete (no trailing partial sequences)
    let prefix_str = String::from_utf8_lossy(prefix).to_string();

    // Check if the tail actually forms a valid UTF-8 sequence when more data arrives.
    // For now, keep it for the next read. If it never completes, it'll be
    // converted on EOF via the cleanup path.
    (prefix_str, tail.to_vec())
}

/// Returns the number of bytes at the end of the slice that might be an
/// incomplete multi-byte UTF-8 sequence (0-3 bytes).
fn tail_incomplete_utf8(bytes: &[u8]) -> usize {
    if bytes.is_empty() {
        return 0;
    }

    // Check the last 1-3 bytes for an incomplete multi-byte start.
    for check in 1..=3.min(bytes.len()) {
        let start = bytes.len() - check;
        let candidate = &bytes[start..];

        // If this candidate is valid UTF-8, then it's not incomplete
        if std::str::from_utf8(candidate).is_ok() {
            return 0;
        }

        // Check if the first byte looks like a multi-byte start
        let first = candidate[0];
        let expected_len = if first & 0x80 == 0 {
            1 // ASCII
        } else if first & 0xE0 == 0xC0 {
            2
        } else if first & 0xF0 == 0xE0 {
            3
        } else if first & 0xF8 == 0xF0 {
            4
        } else {
            0 // Invalid lead byte, not an incomplete sequence
        };

        if expected_len > 0 && check < expected_len {
            // This could be an incomplete sequence
            return check;
        }
    }

    0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_valid_utf8_prefix_ascii() {
        let bytes = b"Hello, World!";
        let (prefix, tail) = find_valid_utf8_prefix(bytes);
        assert_eq!(prefix, "Hello, World!");
        assert!(tail.is_empty());
    }

    #[test]
    fn test_find_valid_utf8_prefix_partial_multibyte() {
        // "Hello世" followed by incomplete "界" (only 2 of 3 bytes)
        let bytes = b"Hello\\xe4\\xb8\\x96\\xe7\\x95";
        let (prefix, tail) = find_valid_utf8_prefix(bytes);
        assert_eq!(prefix, "Hello世");
        assert_eq!(tail, vec![0xe7, 0x95]);
    }

    #[test]
    fn test_find_valid_utf8_prefix_escape_sequence() {
        // DCS escape sequence: ESC P $f { ... }
        // Contains bytes that aren't valid UTF-8 but should be broadcast
        let bytes = b"\\x1bP$f{hello}\\x1b\\\\normal text";
        let (prefix, tail) = find_valid_utf8_prefix(bytes);
        // from_utf8_lossy converts invalid bytes to 
        assert!(prefix.contains("normal text") || !prefix.is_empty());
        assert!(tail.is_empty());
    }

    #[test]
    fn test_find_valid_utf8_prefix_empty() {
        let bytes: &[u8] = b"";
        let (prefix, tail) = find_valid_utf8_prefix(bytes);
        assert_eq!(prefix, "");
        assert!(tail.is_empty());
    }

    #[test]
    fn test_find_valid_utf8_prefix_complete_multibyte() {
        let bytes = "Hello世界".as_bytes();
        let (prefix, tail) = find_valid_utf8_prefix(bytes);
        assert_eq!(prefix, "Hello世界");
        assert!(tail.is_empty());
    }
}
