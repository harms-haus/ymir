use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformInfo {
    pub platform: String,
    pub window_manager: String,
}

fn detect_platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "macOS"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unknown"
    }
}

fn detect_window_manager() -> String {
    if !cfg!(target_os = "linux") {
        return String::new();
    }

    if let Ok(desktop) = std::env::var("XDG_CURRENT_DESKTOP") {
        let desktop_lower = desktop.to_lowercase();
        if desktop_lower.contains("gnome") {
            return "gnome".to_string();
        }
        if desktop_lower.contains("kde") {
            return "kde".to_string();
        }
        if desktop_lower.contains("xfce") {
            return "xfce".to_string();
        }
    }

    if let Ok(session) = std::env::var("DESKTOP_SESSION") {
        let session_lower = session.to_lowercase();
        if session_lower.contains("gnome") {
            return "gnome".to_string();
        }
        if session_lower.contains("kde") || session_lower.contains("plasma") {
            return "kde".to_string();
        }
        if session_lower.contains("xfce") {
            return "xfce".to_string();
        }
    }

    if std::env::var("GNOME_DESKTOP_SESSION_ID").is_ok() {
        return "gnome".to_string();
    }

    if std::env::var("KDE_FULL_SESSION").is_ok() {
        return "kde".to_string();
    }

    "unknown".to_string()
}

#[tauri::command]
pub fn get_platform_info() -> PlatformInfo {
    PlatformInfo {
        platform: detect_platform().to_string(),
        window_manager: detect_window_manager(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_platform_returns_valid_string() {
        let platform = detect_platform();
        assert!(
            platform == "macOS"
                || platform == "windows"
                || platform == "linux"
                || platform == "unknown",
            "Platform should be one of: macOS, windows, linux, unknown. Got: {}",
            platform
        );
    }

    #[test]
    fn test_detect_platform_matches_current_os() {
        let platform = detect_platform();
        if cfg!(target_os = "macos") {
            assert_eq!(platform, "macOS");
        } else if cfg!(target_os = "windows") {
            assert_eq!(platform, "windows");
        } else if cfg!(target_os = "linux") {
            assert_eq!(platform, "linux");
        }
    }

    #[test]
    fn test_detect_window_manager_returns_valid_string() {
        let wm = detect_window_manager();
        if !cfg!(target_os = "linux") {
            assert_eq!(wm, "");
        } else {
            assert!(
                wm == "gnome" || wm == "kde" || wm == "xfce" || wm == "unknown",
                "Window manager should be one of: gnome, kde, xfce, unknown. Got: {}",
                wm
            );
        }
    }

    #[test]
    fn test_get_platform_info_returns_struct() {
        let info = get_platform_info();
        assert!(!info.platform.is_empty(), "Platform should not be empty");
        if cfg!(target_os = "linux") {
            assert!(
                info.window_manager == "gnome"
                    || info.window_manager == "kde"
                    || info.window_manager == "xfce"
                    || info.window_manager == "unknown",
                "Linux window manager should be detected"
            );
        }
    }

    #[test]
    fn test_platform_info_serializes() {
        let info = get_platform_info();
        let json = serde_json::to_string(&info).expect("Should serialize to JSON");
        assert!(
            json.contains("platform"),
            "JSON should contain platform field"
        );
        assert!(
            json.contains("windowManager"),
            "JSON should contain windowManager field"
        );
    }
}
