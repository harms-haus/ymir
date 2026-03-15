use std::sync::Mutex;

use tauri::{Manager, RunEvent, WindowEvent};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;
use tracing::{error, info, warn};

use crate::commands;
use crate::platform;

const EMBEDDED_SERVICE_HOST: &str = "127.0.0.1";
const EMBEDDED_SERVICE_PORT: u16 = 7319;

struct EmbeddedService {
    port: u16,
    child: CommandChild,
}

#[derive(Default)]
struct EmbeddedServiceManager {
    service: Mutex<Option<EmbeddedService>>,
}

pub fn run(web_mode: bool) {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(EmbeddedServiceManager::default())
        .invoke_handler(tauri::generate_handler![
            platform::get_platform_info,
            commands::kill_all_sessions,
            commands::exit_app,
            commands::get_app_cwd,
        ])
        .setup(move |app| {
            start_embedded_service(app.handle());

            if web_mode {
                let url = format!("http://{}:{}", EMBEDDED_SERVICE_HOST, EMBEDDED_SERVICE_PORT);
                if let Err(e) = webbrowser::open(&url) {
                    warn!(%e, "Failed to open browser in web mode");
                } else {
                    info!(url, "Opened browser in web mode");
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| match event {
        RunEvent::WindowEvent {
            label,
            event: WindowEvent::CloseRequested { .. },
            ..
        } if label == "main" => {
            stop_embedded_service(app_handle, "main window close requested");
        }
        RunEvent::WindowEvent {
            label,
            event: WindowEvent::Destroyed,
            ..
        } if label == "main" => {
            stop_embedded_service(app_handle, "main window destroyed");
        }
        RunEvent::ExitRequested { .. } => {
            stop_embedded_service(app_handle, "exit requested");
        }
        RunEvent::Exit => {
            stop_embedded_service(app_handle, "application exit");
        }
        _ => {}
    });
}

fn start_embedded_service(app_handle: &tauri::AppHandle) {
    let command = match app_handle.shell().sidecar(sidecar_binary_name()) {
        Ok(command) => command,
        Err(error) => {
            error!(%error, "Failed to resolve embedded service sidecar binary");
            return;
        }
    };

    let spawn_result = command
        .args([
            "web",
            "--host",
            EMBEDDED_SERVICE_HOST,
            "--port",
            &EMBEDDED_SERVICE_PORT.to_string(),
            "--no-browser",
        ])
        .env("RUST_LOG", "ymir_core::pty=debug")
        .spawn();

    match spawn_result {
        Ok((_events, child)) => {
            let manager = app_handle.state::<EmbeddedServiceManager>();
            let mut service_guard = match manager.service.lock() {
                Ok(guard) => guard,
                Err(error) => {
                    error!(%error, "Embedded service lock poisoned while starting sidecar");
                    return;
                }
            };

            *service_guard = Some(EmbeddedService {
                port: EMBEDDED_SERVICE_PORT,
                child,
            });

            info!(
                host = EMBEDDED_SERVICE_HOST,
                port = EMBEDDED_SERVICE_PORT,
                "Embedded service sidecar started"
            );
        }
        Err(error) => {
            error!(%error, "Failed to start embedded service sidecar");
        }
    }
}

fn stop_embedded_service(app_handle: &tauri::AppHandle, reason: &str) {
    let manager = app_handle.state::<EmbeddedServiceManager>();
    let mut service_guard = match manager.service.lock() {
        Ok(guard) => guard,
        Err(error) => {
            error!(%error, "Embedded service lock poisoned while stopping sidecar");
            return;
        }
    };

    let Some(service) = service_guard.take() else {
        return;
    };

    let EmbeddedService { port, child } = service;
    if let Err(error) = child.kill() {
        warn!(%error, port, reason, "Failed to kill embedded service sidecar");
        return;
    }

    info!(port, reason, "Embedded service sidecar stopped");
}

fn sidecar_binary_name() -> &'static str {
    "ymir-server"
}
