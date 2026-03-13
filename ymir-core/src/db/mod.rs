//! Database module for ymir-core
//!
//! This module provides database infrastructure including:
//! - Migration runner for applying SQL schema changes
//! - Database client with connection pooling and transaction support

pub mod client;
pub mod migrations;

pub use client::{DatabaseClient, DbConfig, Transaction};
pub use migrations::{MigrationRunner, Migration};
