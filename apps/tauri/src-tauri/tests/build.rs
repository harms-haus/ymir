use std::fs;
use std::path::Path;

#[test]
fn test_tauri_config_exists() {
    let config_path = Path::new("tauri.conf.json");
    assert!(config_path.exists(), "tauri.conf.json should exist");
}

#[test]
fn test_tauri_config_valid_json() {
    let config_path = Path::new("tauri.conf.json");
    let content = fs::read_to_string(config_path).expect("Failed to read tauri.conf.json");
    let _: serde_json::Value =
        serde_json::from_str(&content).expect("tauri.conf.json should be valid JSON");
}

#[test]
fn test_capabilities_file_exists() {
    let capabilities_path = Path::new("capabilities/default.json");
    assert!(
        capabilities_path.exists(),
        "capabilities/default.json should exist"
    );
}

#[test]
fn test_capabilities_valid_json() {
    let capabilities_path = Path::new("capabilities/default.json");
    let content =
        fs::read_to_string(capabilities_path).expect("Failed to read capabilities/default.json");
    let _: serde_json::Value =
        serde_json::from_str(&content).expect("capabilities/default.json should be valid JSON");
}

#[test]
fn test_icon_32x32_exists() {
    let icon_path = Path::new("icons/32x32.png");
    assert!(icon_path.exists(), "icons/32x32.png should exist");
}

#[test]
fn test_icon_128x128_exists() {
    let icon_path = Path::new("icons/128x128.png");
    assert!(icon_path.exists(), "icons/128x128.png should exist");
}

#[test]
fn test_icon_128x128_2x_exists() {
    let icon_path = Path::new("icons/128x128@2x.png");
    assert!(icon_path.exists(), "icons/128x128@2x.png should exist");
}

#[test]
fn test_icon_icns_exists() {
    let icon_path = Path::new("icons/icon.icns");
    assert!(icon_path.exists(), "icons/icon.icns should exist");
}

#[test]
fn test_icon_ico_exists() {
    let icon_path = Path::new("icons/icon.ico");
    assert!(icon_path.exists(), "icons/icon.ico should exist");
}
