use tracing::{info, warn};

/// Opens the default web browser to the specified URL.
///
/// This helper function is designed for standalone server mode to automatically
/// open the browser when the server starts. It handles failures gracefully by
/// logging warnings instead of panicking.
///
/// # Arguments
///
/// * `url` - The URL to open in the browser (e.g., "http://127.0.0.1:7139")
///
/// # Returns
///
/// Returns `Ok(true)` if the browser was opened successfully,
/// `Ok(false)` if opening failed but was handled gracefully,
/// or an error if the URL is invalid.
///
/// # Examples
///
/// ```no_run
/// use ymir_server::browser::open_browser;
///
/// if let Ok(success) = open_browser("http://127.0.0.1:7139") {
///     if success {
///         println!("Browser opened successfully");
///     } else {
///         println!("Failed to open browser, but server continues");
///     }
/// }
/// ```
pub fn open_browser(url: &str) -> Result<bool, String> {
    // Validate URL format
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(format!("Invalid URL format: {}", url));
    }

    info!("Attempting to open browser to: {}", url);

    match webbrowser::open(url) {
        Ok(_) => {
            info!("Browser opened successfully to: {}", url);
            Ok(true)
        }
        Err(e) => {
            warn!(
                "Failed to open browser: {}. Server will continue running.",
                e
            );
            Ok(false) // Graceful degradation - don't crash
        }
    }
}

/// Constructs the web UI URL from host and port.
///
/// This helper builds the URL for the standalone web UI, ensuring proper
/// URL formatting and handling edge cases.
///
/// # Arguments
///
/// * `host` - The host address (e.g., "127.0.0.1", "localhost")
/// * `port` - The port number (e.g., 7139)
///
/// # Returns
///
/// A properly formatted URL string.
///
/// # Examples
///
/// ```
/// use ymir_server::browser::build_url;
///
/// let url = build_url("127.0.0.1", 7139);
/// assert_eq!(url, "http://127.0.0.1:7139");
/// ```
pub fn build_url(host: &str, port: u16) -> String {
    format!("http://{}:{}", host, port)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_url_with_ipv4() {
        let url = build_url("127.0.0.1", 7139);
        assert_eq!(url, "http://127.0.0.1:7139");
    }

    #[test]
    fn test_build_url_with_localhost() {
        let url = build_url("localhost", 8080);
        assert_eq!(url, "http://localhost:8080");
    }

    #[test]
    fn test_build_url_with_custom_host() {
        let url = build_url("192.168.1.100", 3000);
        assert_eq!(url, "http://192.168.1.100:3000");
    }

    #[test]
    fn test_open_browser_invalid_url_rejected() {
        let result = open_browser("not-a-url");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid URL format"));
    }

    #[test]
    fn test_open_browser_missing_protocol_rejected() {
        let result = open_browser("example.com:8080");
        assert!(result.is_err());
    }

    #[test]
    fn test_open_browser_https_accepted() {
        let result = open_browser("https://example.com");
        assert!(result.is_ok());
    }

    #[test]
    fn test_open_browser_http_accepted() {
        let result = open_browser("http://127.0.0.1:7139");
        assert!(result.is_ok());
    }

    #[test]
    fn test_build_url_with_default_port() {
        let url = build_url("127.0.0.1", 7139);
        assert_eq!(url, "http://127.0.0.1:7139");
    }
}
