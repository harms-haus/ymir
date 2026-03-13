use clap::Parser;
use ymir_server::cli::{Cli, Commands};

#[test]
fn test_cli_parsing_no_subcommand() {
    let cli = Cli::try_parse_from(["ymir-server"]).unwrap();
    assert!(cli.command.is_none());
}

#[test]
fn test_cli_parsing_web_defaults() {
    let cli = Cli::try_parse_from(["ymir-server", "web"]).unwrap();

    match cli.command {
        Some(Commands::Web(web_args)) => {
            assert_eq!(web_args.host, "127.0.0.1");
            assert_eq!(web_args.port, 7139);
            assert!(web_args.password.is_none());
            assert_eq!(web_args.bind_address(), "127.0.0.1:7139");
        }
        _ => panic!("Expected Web command"),
    }
}

#[test]
fn test_cli_parsing_web_custom_host() {
    let cli = Cli::try_parse_from(["ymir-server", "web", "--host", "0.0.0.0"]).unwrap();

    match cli.command {
        Some(Commands::Web(web_args)) => {
            assert_eq!(web_args.host, "0.0.0.0");
            assert_eq!(web_args.port, 7139);
        }
        _ => panic!("Expected Web command"),
    }
}

#[test]
fn test_cli_parsing_web_custom_port() {
    let cli = Cli::try_parse_from(["ymir-server", "web", "--port", "3000"]).unwrap();

    match cli.command {
        Some(Commands::Web(web_args)) => {
            assert_eq!(web_args.host, "127.0.0.1");
            assert_eq!(web_args.port, 3000);
        }
        _ => panic!("Expected Web command"),
    }
}

#[test]
fn test_cli_parsing_web_with_password() {
    let cli = Cli::try_parse_from(["ymir-server", "web", "--password", "secret123"]).unwrap();

    match cli.command {
        Some(Commands::Web(web_args)) => {
            assert_eq!(web_args.host, "127.0.0.1");
            assert_eq!(web_args.port, 7139);
            assert_eq!(web_args.password, Some("secret123".to_string()));
        }
        _ => panic!("Expected Web command"),
    }
}

#[test]
fn test_cli_parsing_web_all_options() {
    let cli = Cli::try_parse_from([
        "ymir-server",
        "web",
        "--host",
        "192.168.1.1",
        "--port",
        "9000",
        "--password",
        "mypassword",
    ])
    .unwrap();

    match cli.command {
        Some(Commands::Web(web_args)) => {
            assert_eq!(web_args.host, "192.168.1.1");
            assert_eq!(web_args.port, 9000);
            assert_eq!(web_args.password, Some("mypassword".to_string()));
            assert_eq!(web_args.bind_address(), "192.168.1.1:9000");
        }
        _ => panic!("Expected Web command"),
    }
}

#[test]
fn test_cli_parsing_web_short_options() {
    let cli = Cli::try_parse_from(["ymir-server", "web", "-H", "localhost", "-p", "5000"]).unwrap();

    match cli.command {
        Some(Commands::Web(web_args)) => {
            assert_eq!(web_args.host, "localhost");
            assert_eq!(web_args.port, 5000);
        }
        _ => panic!("Expected Web command"),
    }
}

#[test]
fn test_cli_parsing_invalid_subcommand() {
    let result = Cli::try_parse_from(["ymir-server", "invalid"]);
    assert!(result.is_err());
}

#[test]
fn test_cli_parsing_invalid_argument() {
    let result = Cli::try_parse_from(["ymir-server", "web", "--invalid", "value"]);
    assert!(result.is_err());
}

#[test]
fn test_web_args_validation_success() {
    let cli = Cli::try_parse_from([
        "ymir-server",
        "web",
        "--host",
        "127.0.0.1",
        "--port",
        "7139",
    ])
    .unwrap();

    match cli.command {
        Some(Commands::Web(web_args)) => {
            assert!(web_args.validate().is_ok());
        }
        _ => panic!("Expected Web command"),
    }
}

#[test]
fn test_cli_help_shows_web_subcommand() {
    let result = Cli::try_parse_from(["ymir-server", "--help"]);
    assert!(result.is_err());

    let error = result.unwrap_err();
    let error_string = error.to_string();

    assert!(error_string.contains("web"));
}

#[test]
fn test_cli_web_help_shows_options() {
    let result = Cli::try_parse_from(["ymir-server", "web", "--help"]);
    assert!(result.is_err());

    let error = result.unwrap_err();
    let error_string = error.to_string();

    assert!(error_string.contains("--host"));
    assert!(error_string.contains("--port"));
    assert!(error_string.contains("--password"));
}
