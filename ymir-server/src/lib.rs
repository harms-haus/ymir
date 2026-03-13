pub mod browser;
pub mod cli;

pub use browser::{build_url, open_browser};
pub use cli::{Cli, Commands, WebArgs};
