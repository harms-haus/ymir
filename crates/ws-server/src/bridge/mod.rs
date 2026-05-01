//! Bridge encoder/decoder for ws-server.
//!
//! This module provides JSON serialization/deserialization helpers for BridgeEnvelope
//! messages, enabling the server-side of the binary-to-text WebSocket transition.
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
//!
//! ## Backward Compatibility
//!
//! During the transition, both the legacy MessagePack binary format and the new
//! BridgeEnvelope JSON format are supported. The existing `ClientMessagePayload`
//! and `ServerMessagePayload` enums are preserved and will be removed in Phase 5.
//!
//! ## Protocol Version
//!
//! The `PROTOCOL_VERSION` constant from `crate::protocol` is maintained for
//! backward compatibility checks. The BridgeEnvelope uses its own
//! `ENVELOPE_VERSION` from the `harms_haus_acp_ws_bridge` crate.

mod bridge_codec;
mod decoder;
mod encoder;

pub use bridge_codec::*;
pub use decoder::*;
