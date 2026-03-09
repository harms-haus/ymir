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
}
