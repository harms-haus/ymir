use clap::{Parser, Subcommand};

/// Ymir Server - WebSocket-based terminal emulator server
#[derive(Parser, Debug)]
#[command(name = "ymir-server")]
#[command(about = "WebSocket-based terminal emulator server for Ymir", long_about = None)]
pub struct Cli {
    /// Subcommand to execute
    #[command(subcommand)]
    pub command: Option<Commands>,
}

/// Available subcommands
#[derive(Subcommand, Debug)]
pub enum Commands {
    /// Start the web server
    #[command(name = "web")]
    Web(WebArgs),
}

/// Arguments for the web server subcommand
#[derive(Parser, Debug)]
pub struct WebArgs {
    /// Host address to bind to (default: 127.0.0.1)
    #[arg(short = 'H', long, default_value = "127.0.0.1")]
    pub host: String,

    /// Port to listen on (default: 7139)
    #[arg(short, long, default_value = "7319")]
    pub port: u16,

    /// Optional password for authentication (default: none, no auth required)
    #[arg(long, value_name = "PASSWORD")]
    pub password: Option<String>,
}

impl WebArgs {
    /// Validate the web server arguments
    ///
    /// Returns an error if the arguments are invalid
    pub fn validate(&self) -> Result<(), String> {
        if self.port == 0 {
            return Err("Port cannot be 0".to_string());
        }

        if self.host.is_empty() {
            return Err("Host cannot be empty".to_string());
        }

        Ok(())
    }

    /// Get the bind address as a string (host:port)
    pub fn bind_address(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_web_args_default() {
        let args = WebArgs {
            host: "127.0.0.1".to_string(),
            port: 7319,
            password: None,
        };
        assert!(args.validate().is_ok());
        assert_eq!(args.bind_address(), "127.0.0.1:7319");
    }

    #[test]
    fn test_web_args_custom_host_port() {
        let args = WebArgs {
            host: "0.0.0.0".to_string(),
            port: 3000,
            password: Some("secret".to_string()),
        };
        assert!(args.validate().is_ok());
        assert_eq!(args.bind_address(), "0.0.0.0:3000");
        assert_eq!(args.password, Some("secret".to_string()));
    }

    #[test]
    fn test_web_args_invalid_port_zero() {
        let args = WebArgs {
            host: "127.0.0.1".to_string(),
            port: 0,
            password: None,
        };
        assert!(args.validate().is_err());
    }

    #[test]
    fn test_web_args_empty_host() {
        let args = WebArgs {
            host: "".to_string(),
            port: 7319,
            password: None,
        };
        assert!(args.validate().is_err());
    }

    #[test]
    fn test_cli_no_subcommand() {
        let cli = Cli { command: None };
        assert!(cli.command.is_none());
    }

    #[test]
    fn test_cli_with_web_subcommand() {
        let web_args = WebArgs {
            host: "127.0.0.1".to_string(),
            port: 7319,
            password: None,
        };
        let cli = Cli {
            command: Some(Commands::Web(web_args)),
        };
        assert!(cli.command.is_some());
        match cli.command {
            Some(Commands::Web(args)) => {
                assert_eq!(args.host, "127.0.0.1");
                assert_eq!(args.port, 7319);
            }
            _ => panic!("Expected Web command"),
        }
    }
}
