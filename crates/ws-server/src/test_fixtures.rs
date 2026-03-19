//! Test fixture infrastructure for cross-language testing
//!
//! This module provides utilities for creating and managing test fixtures
//! used in cross-language protocol compatibility tests.

use anyhow::Result;
use serde::Serialize;
use std::path::PathBuf;

/// Returns the path to the test fixtures directory
///
/// The fixtures directory is located at `<workspace_root>/test-fixtures/`
pub fn fixture_dir() -> PathBuf {
    // Get workspace root by navigating up from current file location
    let mut path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    // Navigate from crates/ws-server to workspace root (3 levels up)
    path.pop(); // src
    path.pop(); // ws-server
    path.pop(); // crates
    path.push("test-fixtures");
    path
}

/// Writes a serializable type to a test fixture file
///
/// # Arguments
/// * `name` - The name of the fixture file (without extension)
/// * `data` - The data to serialize and write
///
/// # Returns
/// The full path to the created fixture file
///
/// # Example
/// ```ignore
/// let msg = ClientMessage::new(ClientMessagePayload::Ping(Ping { timestamp: 12345 }));
/// let path = write_fixture("ping_message", &msg)?;
/// // File created at: <workspace>/test-fixtures/ping_message.msgpack
/// ```
pub fn write_fixture<T: Serialize>(name: &str, data: &T) -> Result<PathBuf> {
    let fixture_dir = fixture_dir();
    std::fs::create_dir_all(&fixture_dir)?;

    let file_path = fixture_dir.join(format!("{}.msgpack", name));
    let bytes = rmp_serde::to_vec(data)?;
    std::fs::write(&file_path, bytes)?;

    Ok(file_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fixture_dir_points_to_correct_location() {
        let dir = fixture_dir();
        assert!(dir.ends_with("test-fixtures"));
    }

    #[test]
    fn test_write_fixture_creates_file() -> Result<()> {
        let test_data = vec![1, 2, 3];
        let path = write_fixture("test_vec", &test_data)?;

        assert!(path.exists());
        assert!(path.ends_with("test-fixtures/test_vec.msgpack"));

        // Cleanup
        std::fs::remove_file(path)?;
        Ok(())
    }

    #[test]
    fn test_write_fixture_serializes_correctly() -> Result<()> {
        use serde::{Deserialize, Serialize};

        #[derive(Debug, Serialize, Deserialize, PartialEq)]
        struct TestStruct {
            name: String,
            value: i32,
        }

        let original = TestStruct {
            name: "test".to_string(),
            value: 42,
        };

        let path = write_fixture("test_struct", &original)?;
        let bytes = std::fs::read(&path)?;
        let decoded: TestStruct = rmp_serde::from_slice(&bytes)?;

        assert_eq!(original, decoded);

        // Cleanup
        std::fs::remove_file(path)?;
        Ok(())
    }
}
