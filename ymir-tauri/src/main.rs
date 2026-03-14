#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;

fn main() {
    let args: Vec<String> = env::args().collect();
    let web_mode = args.iter().any(|arg| arg == "web");
    ymir_tauri_lib::run(web_mode);
}
