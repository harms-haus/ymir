mod app;
mod commands;
mod platform;

pub fn run(web_mode: bool) {
    init_logging();
    app::run(web_mode);
}

fn init_logging() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .with_target(true)
        .init();
}
