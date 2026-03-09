//! Logging configuration and utilities

//!
//!
#[allow(dead_code)]
pub const SENSITIVE_FIELDS: &[&str] = &[
    "password",
    "token",
    "secret",
    "apiKey",
    "api_key",
    "authorization",
    "credential",
    "privateKey",
    "private_key",
    "sessionId",
];

#[allow(dead_code)]
pub fn redact_sensitive(s: &str) -> String {
    let mut result = s.to_string();

    for field in SENSITIVE_FIELDS {
        // Simple pattern matching for JSON-like key-value pairs
        // Handles: "field": "value", "field":"value", field: value
        let patterns = [
            // JSON format with quotes
            format!(r#""{}":\s*"[^"]*""#, field),
            format!(r#""{}":\s*'[^']*'"#, field),
            // Key-value format
            format!(r#"{}:\s*[^,\s\}}]*"#, field),
        ];

        for pattern in patterns {
            if let Ok(re) = regex::Regex::new(&pattern) {
                let replacement = format!(r#""{}": "[REDACTED]""#, field);
                result = re.replace_all(&result, replacement.as_str()).to_string();
            }
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_redact_password() {
        let input = r#"{"password": "secret123", "user": "test"}"#;
        let output = redact_sensitive(input);
        assert!(output.contains("[REDACTED]"));
        assert!(!output.contains("secret123"));
    }

    #[test]
    fn test_redact_token() {
        let input = r#"{"token": "abc123xyz", "name": "session"}"#;
        let output = redact_sensitive(input);
        assert!(output.contains("[REDACTED]"));
        assert!(!output.contains("abc123xyz"));
    }

    #[test]
    fn test_preserve_non_sensitive() {
        let input = r#"{"workspace": "main", "paneId": "123"}"#;
        let output = redact_sensitive(input);
        assert!(output.contains("main"));
        assert!(output.contains("123"));
    }

    // Tests for all sensitive field patterns
    #[test]
    fn test_redact_secret() {
        let input = r#"{"secret": "my-api-secret", "app": "test"}"#;
        let output = redact_sensitive(input);
        assert!(output.contains("[REDACTED]"));
        assert!(!output.contains("my-api-secret"));
    }

    #[test]
    fn test_redact_api_key() {
        let input = r#"{"apiKey": "sk-1234567890abcdef", "user": "admin"}"#;
        let output = redact_sensitive(input);
        assert!(output.contains("[REDACTED]"));
        assert!(!output.contains("sk-1234567890abcdef"));
    }

    #[test]
    fn test_redact_api_key_snake_case() {
        let input = r#"{"api_key": "key_12345", "service": "auth"}"#;
        let output = redact_sensitive(input);
        assert!(output.contains("[REDACTED]"));
        assert!(!output.contains("key_12345"));
    }

    #[test]
    fn test_redact_authorization() {
        let input =
            r#"{"authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", "type": "jwt"}"#;
        let output = redact_sensitive(input);
        assert!(output.contains("[REDACTED]"));
        assert!(!output.contains("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"));
    }

    #[test]
    fn test_redact_credential() {
        let input = r#"{"credential": "cert.pem", "path": "/etc/ssl"}"#;
        let output = redact_sensitive(input);
        assert!(output.contains("[REDACTED]"));
        assert!(!output.contains("cert.pem"));
    }

    #[test]
    fn test_redact_private_key() {
        let input = r#"{"privateKey": "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...", "type": "RSA"}"#;
        let output = redact_sensitive(input);
        assert!(output.contains("[REDACTED]"));
        assert!(!output.contains("MIIEpAIBAAKCAQEA"));
    }

    #[test]
    fn test_redact_private_key_snake_case() {
        let input =
            r#"{"private_key": "-----BEGIN EC PRIVATE KEY-----\nMHQCAQEE...", "type": "EC"}"#;
        let output = redact_sensitive(input);
        assert!(output.contains("[REDACTED]"));
        assert!(!output.contains("MHQCAQEE"));
    }

    #[test]
    fn test_redact_session_id() {
        let input = r#"{"sessionId": "sess_abc123xyz789", "user": "john"}"#;
        let output = redact_sensitive(input);
        assert!(output.contains("[REDACTED]"));
        assert!(!output.contains("sess_abc123xyz789"));
    }

    // Edge cases
    #[test]
    fn test_redact_empty_string() {
        let input = "";
        let output = redact_sensitive(input);
        assert_eq!(output, "");
    }

    #[test]
    fn test_redact_no_sensitive_data() {
        let input = r#"{"message": "Hello World", "count": 42, "active": true}"#;
        let output = redact_sensitive(input);
        assert_eq!(output, input);
    }

    #[test]
    fn test_redact_multiple_sensitive_fields() {
        let input =
            r#"{"password": "pass123", "token": "tok456", "apiKey": "key789", "user": "test"}"#;
        let output = redact_sensitive(input);
        assert!(!output.contains("pass123"));
        assert!(!output.contains("tok456"));
        assert!(!output.contains("key789"));
        assert!(output.contains("test"));
        // Count occurrences of [REDACTED]
        let redacted_count = output.matches("[REDACTED]").count();
        assert_eq!(redacted_count, 3);
    }

    #[test]
    fn test_redact_empty_value() {
        let input = r#"{"password": "", "token": ""}"#;
        let output = redact_sensitive(input);
        assert!(output.contains("[REDACTED]"));
    }

    #[test]
    fn test_redact_single_quotes() {
        let input = r#"{'password': 'secret123', 'user': 'test'}"#;
        let output = redact_sensitive(input);
        assert!(output.contains("[REDACTED]"));
        assert!(!output.contains("secret123"));
    }

    #[test]
    fn test_redact_no_spaces() {
        let input = r#"{"password":"secret123","user":"test"}"#;
        let output = redact_sensitive(input);
        assert!(output.contains("[REDACTED]"));
        assert!(!output.contains("secret123"));
    }

    #[test]
    fn test_redact_nested_json() {
        let input = r#"{"data": {"password": "nested_secret", "value": 123}, "status": "ok"}"#;
        let output = redact_sensitive(input);
        assert!(output.contains("[REDACTED]"));
        assert!(!output.contains("nested_secret"));
        assert!(output.contains("123"));
    }

    #[test]
    fn test_redact_special_characters_in_value() {
        let input = r#"{"password": "p@$$w0rd!#$%^&*()", "user": "test"}"#;
        let output = redact_sensitive(input);
        assert!(output.contains("[REDACTED]"));
        assert!(!output.contains("p@$$w0rd"));
    }

    #[test]
    fn test_redact_unicode_in_value() {
        let input = r#"{"password": "пароль123🔐", "user": "test"}"#;
        let output = redact_sensitive(input);
        assert!(output.contains("[REDACTED]"));
        assert!(!output.contains("пароль123"));
    }

    #[test]
    fn test_redact_partial_match_not_redacted() {
        // "passwordHash" should NOT be redacted (it's not in SENSITIVE_FIELDS)
        let input = r#"{"passwordHash": "abc123", "password": "secret"}"#;
        let output = redact_sensitive(input);
        assert!(output.contains("abc123"));
        assert!(!output.contains("secret"));
    }

    #[test]
    fn test_redact_case_sensitive() {
        // "Password" (capital P) should NOT be redacted
        let input = r#"{"Password": "secret123", "password": "real_secret"}"#;
        let output = redact_sensitive(input);
        assert!(output.contains("secret123"));
        assert!(!output.contains("real_secret"));
    }

    #[test]
    fn test_redact_key_value_format() {
        // Key-value format without quotes
        let input = "password: secret123, user: test";
        let output = redact_sensitive(input);
        assert!(output.contains("[REDACTED]"));
        assert!(!output.contains("secret123"));
    }

    #[test]
    fn test_redact_mixed_formats() {
        let input = r#"password: secret123, "token": "abc", api_key: xyz"#;
        let output = redact_sensitive(input);
        assert!(!output.contains("secret123"));
        assert!(!output.contains("abc"));
        assert!(!output.contains("xyz"));
    }

    #[test]
    fn test_redact_very_long_value() {
        let long_value = "x".repeat(10000);
        let input = format!(r#"{{"password": "{}", "user": "test"}}"#, long_value);
        let output = redact_sensitive(&input);
        assert!(output.contains("[REDACTED]"));
        assert!(!output.contains(&long_value[..100]));
    }

    #[test]
    fn test_redact_url_with_credentials() {
        // URLs with credentials should have password redacted
        let input = r#"{"url": "https://user:password@example.com", "password": "secret123"}"#;
        let output = redact_sensitive(input);
        assert!(!output.contains("secret123"));
    }

    #[test]
    fn test_redact_array_with_sensitive() {
        let input = r#"{"items": [{"password": "secret1"}, {"password": "secret2"}]}"#;
        let output = redact_sensitive(input);
        assert!(!output.contains("secret1"));
        assert!(!output.contains("secret2"));
        let redacted_count = output.matches("[REDACTED]").count();
        assert_eq!(redacted_count, 2);
    }
}
