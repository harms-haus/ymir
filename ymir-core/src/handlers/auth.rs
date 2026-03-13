//! Authentication handler for Ymir WebSocket server
//!
//! This module provides password-based authentication:
//! - auth.login: Validate password and mark connection as authenticated
//! - Auth middleware support for protecting routes
//! - Localhost bypass for simplified local development
//!
//! The authentication system is intentionally simple:
//! - Single password configured via --password CLI flag (future Task 16)
//! - No JWT, sessions, or OAuth complexity
//! - Per-connection authentication state
//! - Localhost connections can bypass auth when no password is set

use crate::server::protocol::{OutgoingMessage, ProtocolError};
use crate::types::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::net::IpAddr;

/// Authentication error types
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AuthError {
    /// Invalid password provided
    InvalidPassword,
    /// Authentication required but not provided
    NotAuthenticated,
    /// Authentication failed
    AuthenticationFailed(String),
}

impl std::fmt::Display for AuthError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AuthError::InvalidPassword => write!(f, "Invalid password"),
            AuthError::NotAuthenticated => write!(f, "Authentication required"),
            AuthError::AuthenticationFailed(msg) => write!(f, "Authentication failed: {}", msg),
        }
    }
}

impl std::error::Error for AuthError {}

impl From<AuthError> for ProtocolError {
    fn from(err: AuthError) -> Self {
        match err {
            AuthError::InvalidPassword => {
                ProtocolError::InvalidParams("Invalid password".to_string())
            }
            AuthError::NotAuthenticated => {
                ProtocolError::InvalidRequest("Authentication required".to_string())
            }
            AuthError::AuthenticationFailed(msg) => ProtocolError::InternalError(msg),
        }
    }
}

/// Login request input
#[derive(Debug, Clone, Deserialize)]
pub struct LoginInput {
    /// Password to authenticate with
    pub password: String,
}

/// Login response output
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoginOutput {
    /// Whether authentication was successful
    pub success: bool,
    /// Session token (for future use, currently empty)
    pub token: String,
    /// Error message if authentication failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Logout request input
#[derive(Debug, Clone, Deserialize)]
pub struct LogoutInput {
    /// Optional reason for logout
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

/// Logout response output
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogoutOutput {
    /// Whether logout was successful
    pub success: bool,
}

/// Check authentication status input
#[derive(Debug, Clone, Deserialize)]
pub struct AuthStatusInput;

/// Check authentication status output
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthStatusOutput {
    /// Whether the connection is authenticated
    pub authenticated: bool,
    /// Whether authentication is required for this server
    pub auth_required: bool,
    /// Whether this is a localhost connection (can bypass auth)
    pub is_localhost: bool,
}

/// Authentication notification types
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "action", rename_all = "camelCase")]
pub enum AuthNotification {
    /// User logged in successfully
    LoggedIn { timestamp: u64 },
    /// User logged out
    LoggedOut { timestamp: u64, reason: Option<String> },
    /// Authentication failed
    AuthFailed { timestamp: u64, reason: String },
}

/// Authentication configuration
#[derive(Debug, Clone)]
pub struct AuthConfig {
    /// The configured password (None = no password required)
    pub password: Option<String>,
    /// Whether to allow localhost connections without password
    pub allow_localhost_bypass: bool,
}

impl Default for AuthConfig {
    fn default() -> Self {
        Self {
            password: None,
            allow_localhost_bypass: true,
        }
    }
}

impl AuthConfig {
    /// Create a new auth config with the given password
    pub fn with_password(password: String) -> Self {
        Self {
            password: Some(password),
            allow_localhost_bypass: true,
        }
    }

    /// Check if authentication is required
    pub fn is_auth_required(&self) -> bool {
        self.password.is_some()
    }
}

/// Authentication handler for password validation
#[derive(Debug, Clone)]
pub struct AuthHandler {
    config: AuthConfig,
}

impl AuthHandler {
    /// Create a new authentication handler with the given config
    pub fn new(config: AuthConfig) -> Self {
        Self { config }
    }

    /// Create a new authentication handler with no password (open mode)
    pub fn open() -> Self {
        Self::new(AuthConfig::default())
    }

    /// Create a new authentication handler with a password
    pub fn with_password(password: String) -> Self {
        Self::new(AuthConfig::with_password(password))
    }

    /// Validate a password against the configured password
    pub fn validate_password(&self, password: &str) -> Result<bool> {
        match &self.config.password {
            Some(expected) => Ok(expected == password),
            None => Ok(true), // No password set, any password is valid
        }
    }

    /// Check if authentication is required
    pub fn is_auth_required(&self) -> bool {
        self.config.is_auth_required()
    }

    /// Check if a socket address is localhost
    pub fn is_localhost(addr: &std::net::SocketAddr) -> bool {
        match addr.ip() {
            IpAddr::V4(ip) => ip.is_loopback(),
            IpAddr::V6(ip) => ip.is_loopback(),
        }
    }

    /// Check if localhost bypass is allowed for this address
    pub fn can_bypass_auth(&self, addr: &std::net::SocketAddr) -> bool {
        self.config.allow_localhost_bypass && Self::is_localhost(addr)
    }

    /// Login with password
    pub async fn login(&self, input: LoginInput) -> Result<LoginOutput> {
        let valid = self.validate_password(&input.password)?;

        if valid {
            Ok(LoginOutput {
                success: true,
                token: "session-token".to_string(), // Placeholder for future session support
                error: None,
            })
        } else {
            Ok(LoginOutput {
                success: false,
                token: String::new(),
                error: Some("Invalid password".to_string()),
            })
        }
    }

    /// Logout (placeholder for future session support)
    pub async fn logout(&self, _input: LogoutInput) -> Result<LogoutOutput> {
        Ok(LogoutOutput { success: true })
    }

    /// Get authentication status
    pub fn get_status(&self, is_authenticated: bool, addr: &std::net::SocketAddr) -> AuthStatusOutput {
        AuthStatusOutput {
            authenticated: is_authenticated || !self.is_auth_required() || self.can_bypass_auth(addr),
            auth_required: self.is_auth_required(),
            is_localhost: Self::is_localhost(addr),
        }
    }

    /// Create an authentication notification
    pub fn create_notification(&self, notification: AuthNotification) -> OutgoingMessage {
        let method = "auth.state_change".to_string();
        let params = serde_json::to_value(notification).ok();
        OutgoingMessage::notification(method, params)
    }
}

/// RPC handler for authentication methods
#[derive(Debug, Clone)]
pub struct AuthRpcHandler {
    inner: AuthHandler,
}

impl AuthRpcHandler {
    /// Create a new RPC handler with the given auth config
    pub fn new(config: AuthConfig) -> Self {
        Self {
            inner: AuthHandler::new(config),
        }
    }

    /// Create a new RPC handler with no password (open mode)
    pub fn open() -> Self {
        Self::new(AuthConfig::default())
    }

    /// Create a new RPC handler with a password
    pub fn with_password(password: String) -> Self {
        Self::new(AuthConfig::with_password(password))
    }

    /// Get reference to inner handler
    pub fn inner(&self) -> &AuthHandler {
        &self.inner
    }

    /// Handle JSON-RPC authentication methods
    pub async fn handle(
        &self,
        method: &str,
        params: Option<Value>,
    ) -> std::result::Result<Value, ProtocolError> {
        match method {
            "auth.login" => {
                let input: LoginInput = params
                    .map(|p| serde_json::from_value(p).map_err(|e| ProtocolError::InvalidParams(e.to_string())))
                    .unwrap_or(Err(ProtocolError::InvalidParams("Missing params".to_string())))?;

                let output = self.inner.login(input).await.map_err(|e| {
                    ProtocolError::InternalError(format!("Login failed: {}", e))
                })?;

                serde_json::to_value(output).map_err(|e| ProtocolError::InternalError(e.to_string()))
            }
            "auth.logout" => {
                let input: LogoutInput = params
                    .map(|p| serde_json::from_value(p).unwrap_or(LogoutInput { reason: None }))
                    .unwrap_or(LogoutInput { reason: None });

                let output = self.inner.logout(input).await.map_err(|e| {
                    ProtocolError::InternalError(format!("Logout failed: {}", e))
                })?;

                serde_json::to_value(output).map_err(|e| ProtocolError::InternalError(e.to_string()))
            }
            "auth.status" => {
                // This method needs connection context, handled separately
                // Return placeholder that will be replaced by server
                let output = AuthStatusOutput {
                    authenticated: false,
                    auth_required: self.inner.is_auth_required(),
                    is_localhost: false,
                };
                serde_json::to_value(output).map_err(|e| ProtocolError::InternalError(e.to_string()))
            }
            _ => Err(ProtocolError::MethodNotFound(method.to_string())),
        }
    }
}

#[async_trait::async_trait]
impl crate::server::protocol::RequestHandler for AuthRpcHandler {
    async fn handle(&self, method: &str, params: Option<Value>) -> std::result::Result<Value, crate::server::protocol::ProtocolError> {
        self.handle(method, params).await
    }
}

/// Authentication middleware for protecting routes
///
/// This middleware checks if a request should be allowed based on:
/// 1. Whether authentication is required
/// 2. Whether the connection is authenticated
/// 3. Whether localhost bypass is allowed
pub struct AuthMiddleware {
    handler: AuthHandler,
}

impl AuthMiddleware {
    /// Create new auth middleware
    pub fn new(handler: AuthHandler) -> Self {
        Self { handler }
    }

    /// Check if a request is authorized
    ///
    /// Returns Ok(()) if authorized, Err(AuthError) if not
    pub fn check_auth(
        &self,
        is_authenticated: bool,
        addr: &std::net::SocketAddr,
    ) -> std::result::Result<(), AuthError> {
        // If already authenticated, allow
        if is_authenticated {
            return Ok(());
        }

        // If no password required, allow
        if !self.handler.is_auth_required() {
            return Ok(());
        }

        // If localhost bypass is allowed and this is localhost, allow
        if self.handler.can_bypass_auth(addr) {
            return Ok(());
        }

        // Otherwise, require authentication
        Err(AuthError::NotAuthenticated)
    }

    /// Check if a method requires authentication
    ///
    /// Some methods like auth.login and auth.status are always allowed
    pub fn method_requires_auth(method: &str) -> bool {
        match method {
            "auth.login" | "auth.status" => false,
            _ => true,
        }
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::SocketAddr;

    #[test]
    fn test_auth_config_default() {
        let config = AuthConfig::default();
        assert!(config.password.is_none());
        assert!(config.allow_localhost_bypass);
        assert!(!config.is_auth_required());
    }

    #[test]
    fn test_auth_config_with_password() {
        let config = AuthConfig::with_password("secret".to_string());
        assert_eq!(config.password, Some("secret".to_string()));
        assert!(config.is_auth_required());
    }

    #[test]
    fn test_auth_handler_open() {
        let handler = AuthHandler::open();
        assert!(!handler.is_auth_required());
    }

    #[test]
    fn test_auth_handler_with_password() {
        let handler = AuthHandler::with_password("secret".to_string());
        assert!(handler.is_auth_required());
    }

    #[test]
    fn test_validate_password_no_password_set() {
        let handler = AuthHandler::open();
        assert!(handler.validate_password("anything").unwrap());
    }

    #[test]
    fn test_validate_password_correct() {
        let handler = AuthHandler::with_password("secret".to_string());
        assert!(handler.validate_password("secret").unwrap());
    }

    #[test]
    fn test_validate_password_incorrect() {
        let handler = AuthHandler::with_password("secret".to_string());
        assert!(!handler.validate_password("wrong").unwrap());
    }

    #[test]
    fn test_is_localhost_ipv4() {
        let localhost = SocketAddr::from(([127, 0, 0, 1], 7139));
        assert!(AuthHandler::is_localhost(&localhost));

        let not_local = SocketAddr::from(([192, 168, 1, 1], 7139));
        assert!(!AuthHandler::is_localhost(&not_local));
    }

    #[test]
    fn test_is_localhost_ipv6() {
        let localhost = SocketAddr::from(([0, 0, 0, 0, 0, 0, 0, 1], 7139));
        assert!(AuthHandler::is_localhost(&localhost));
    }

    #[test]
    fn test_can_bypass_auth_localhost() {
        let handler = AuthHandler::with_password("secret".to_string());
        let localhost = SocketAddr::from(([127, 0, 0, 1], 7139));
        assert!(handler.can_bypass_auth(&localhost));
    }

    #[test]
    fn test_can_bypass_auth_remote() {
        let handler = AuthHandler::with_password("secret".to_string());
        let remote = SocketAddr::from(([192, 168, 1, 1], 7139));
        assert!(!handler.can_bypass_auth(&remote));
    }

    #[test]
    fn test_can_bypass_auth_disabled() {
        let config = AuthConfig {
            password: Some("secret".to_string()),
            allow_localhost_bypass: false,
        };
        let handler = AuthHandler::new(config);
        let localhost = SocketAddr::from(([127, 0, 0, 1], 7139));
        assert!(!handler.can_bypass_auth(&localhost));
    }

    #[tokio::test]
    async fn test_login_success() {
        let handler = AuthHandler::with_password("secret".to_string());
        let input = LoginInput {
            password: "secret".to_string(),
        };
        let output = handler.login(input).await.unwrap();
        assert!(output.success);
        assert!(output.error.is_none());
    }

    #[tokio::test]
    async fn test_login_failure() {
        let handler = AuthHandler::with_password("secret".to_string());
        let input = LoginInput {
            password: "wrong".to_string(),
        };
        let output = handler.login(input).await.unwrap();
        assert!(!output.success);
        assert!(output.error.is_some());
    }

    #[tokio::test]
    async fn test_login_no_password() {
        let handler = AuthHandler::open();
        let input = LoginInput {
            password: "anything".to_string(),
        };
        let output = handler.login(input).await.unwrap();
        assert!(output.success);
    }

    #[tokio::test]
    async fn test_logout() {
        let handler = AuthHandler::open();
        let input = LogoutInput { reason: None };
        let output = handler.logout(input).await.unwrap();
        assert!(output.success);
    }

    #[test]
    fn test_get_status_authenticated() {
        let handler = AuthHandler::with_password("secret".to_string());
        let addr = SocketAddr::from(([127, 0, 0, 1], 7139));
        let status = handler.get_status(true, &addr);
        assert!(status.authenticated);
        assert!(status.auth_required);
        assert!(status.is_localhost);
    }

    #[test]
    fn test_get_status_not_authenticated_localhost() {
        let handler = AuthHandler::with_password("secret".to_string());
        let addr = SocketAddr::from(([127, 0, 0, 1], 7139));
        let status = handler.get_status(false, &addr);
        // Should be authenticated due to localhost bypass
        assert!(status.authenticated);
        assert!(status.auth_required);
        assert!(status.is_localhost);
    }

    #[test]
    fn test_get_status_not_authenticated_remote() {
        let handler = AuthHandler::with_password("secret".to_string());
        let addr = SocketAddr::from(([192, 168, 1, 1], 7139));
        let status = handler.get_status(false, &addr);
        assert!(!status.authenticated);
        assert!(status.auth_required);
        assert!(!status.is_localhost);
    }

    #[test]
    fn test_get_status_no_auth_required() {
        let handler = AuthHandler::open();
        let addr = SocketAddr::from(([192, 168, 1, 1], 7139));
        let status = handler.get_status(false, &addr);
        // Should be authenticated because no auth required
        assert!(status.authenticated);
        assert!(!status.auth_required);
        assert!(!status.is_localhost);
    }

    #[test]
    fn test_auth_middleware_check_auth_authenticated() {
        let handler = AuthHandler::with_password("secret".to_string());
        let middleware = AuthMiddleware::new(handler);
        let addr = SocketAddr::from(([192, 168, 1, 1], 7139));
        assert!(middleware.check_auth(true, &addr).is_ok());
    }

    #[test]
    fn test_auth_middleware_check_auth_no_password() {
        let handler = AuthHandler::open();
        let middleware = AuthMiddleware::new(handler);
        let addr = SocketAddr::from(([192, 168, 1, 1], 7139));
        assert!(middleware.check_auth(false, &addr).is_ok());
    }

    #[test]
    fn test_auth_middleware_check_auth_localhost_bypass() {
        let handler = AuthHandler::with_password("secret".to_string());
        let middleware = AuthMiddleware::new(handler);
        let addr = SocketAddr::from(([127, 0, 0, 1], 7139));
        assert!(middleware.check_auth(false, &addr).is_ok());
    }

    #[test]
    fn test_auth_middleware_check_auth_required() {
        let handler = AuthHandler::with_password("secret".to_string());
        let middleware = AuthMiddleware::new(handler);
        let addr = SocketAddr::from(([192, 168, 1, 1], 7139));
        let result = middleware.check_auth(false, &addr);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().to_string(), "Authentication required");
    }

    #[test]
    fn test_method_requires_auth() {
        assert!(!AuthMiddleware::method_requires_auth("auth.login"));
        assert!(!AuthMiddleware::method_requires_auth("auth.status"));
        assert!(AuthMiddleware::method_requires_auth("workspace.create"));
        assert!(AuthMiddleware::method_requires_auth("pane.list"));
        assert!(AuthMiddleware::method_requires_auth("tab.create"));
    }

    #[tokio::test]
    async fn test_rpc_handler_login() {
        let handler = AuthRpcHandler::with_password("secret".to_string());
        let params = serde_json::json!({ "password": "secret" });
        let result = handler.handle("auth.login", Some(params)).await;
        assert!(result.is_ok());
        let output: LoginOutput = serde_json::from_value(result.unwrap()).unwrap();
        assert!(output.success);
    }

    #[tokio::test]
    async fn test_rpc_handler_login_invalid() {
        let handler = AuthRpcHandler::with_password("secret".to_string());
        let params = serde_json::json!({ "password": "wrong" });
        let result = handler.handle("auth.login", Some(params)).await;
        assert!(result.is_ok());
        let output: LoginOutput = serde_json::from_value(result.unwrap()).unwrap();
        assert!(!output.success);
    }

    #[tokio::test]
    async fn test_rpc_handler_logout() {
        let handler = AuthRpcHandler::open();
        let result = handler.handle("auth.logout", None).await;
        assert!(result.is_ok());
        let output: LogoutOutput = serde_json::from_value(result.unwrap()).unwrap();
        assert!(output.success);
    }

    #[tokio::test]
    async fn test_rpc_handler_status() {
        let handler = AuthRpcHandler::with_password("secret".to_string());
        let result = handler.handle("auth.status", None).await;
        assert!(result.is_ok());
        let status: AuthStatusOutput = serde_json::from_value(result.unwrap()).unwrap();
        assert!(status.auth_required);
    }

    #[tokio::test]
    async fn test_rpc_handler_method_not_found() {
        let handler = AuthRpcHandler::open();
        let result = handler.handle("auth.unknown", None).await;
        assert!(result.is_err());
    }

    #[test]
    fn test_auth_error_display() {
        assert_eq!(AuthError::InvalidPassword.to_string(), "Invalid password");
        assert_eq!(
            AuthError::NotAuthenticated.to_string(),
            "Authentication required"
        );
        assert_eq!(
            AuthError::AuthenticationFailed("test".to_string()).to_string(),
            "Authentication failed: test"
        );
    }

    #[test]
    fn test_auth_error_into_protocol_error() {
        let err = AuthError::InvalidPassword;
        let protocol_err: ProtocolError = err.into();
        match protocol_err {
            ProtocolError::InvalidParams(msg) => assert!(msg.contains("Invalid password")),
            _ => panic!("Expected InvalidParams"),
        }
    }

    #[test]
    fn test_create_notification() {
        let handler = AuthHandler::open();
        let notification = AuthNotification::LoggedIn { timestamp: 12345 };
        let message = handler.create_notification(notification);
        match message {
            OutgoingMessage::Notification { method, .. } => {
                assert_eq!(method, "auth.state_change");
            }
            _ => panic!("Expected Notification variant"),
        }
    }
}
