//! Bridge encoder/decoder for ws-server.
//!
//! This module provides JSON serialization/deserialization helpers for BridgeEnvelope
//! messages for the WebSocket transport.
//!
//! ## Encoder (server -> client)
//!
//! The `encoder` module converts `ServerMessage` (with `ServerMessagePayload` variants)
//! into `BridgeEnvelope` messages with appropriate `BridgeMessage` discriminants.
//! The payload data is serialized as structured JSON without modification.
//!
//! ## Decoder (client -> server)
//!
//! The `decoder` module parses incoming JSON text messages as `BridgeEnvelope` and
//! extracts typed `ClientMessagePayload` variants for routing to existing handlers.
//! Non-client messages (AcpPayload, StartAgent) are returned as `NonClient` for
//! separate handling pathways.

mod bridge_codec;
mod decoder;
mod encoder;

pub use bridge_codec::*;
pub use decoder::*;
