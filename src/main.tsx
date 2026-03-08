import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";

// Clean up all PTY sessions when window is about to close
async function setupWindowCleanup() {
  const mainWindow = getCurrentWindow();
  
  mainWindow.onCloseRequested(async () => {
    // Kill all PTY sessions before window closes
    // Note: We don't preventDefault(), so the window will close after this handler completes
    try {
      await invoke('kill_all_sessions');
    } catch (error) {
      console.error('Failed to kill all sessions on window close:', error);
    }
    // Window will close automatically - no need to call anything else
  });
}

// Only set up cleanup if running in Tauri
if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
  setupWindowCleanup();
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
