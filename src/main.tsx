import logger from './lib/logger';
import './styles/theme.css';

import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";
import { ThemeProvider } from "./components/ThemeProvider";

// Clean up all PTY sessions when window is about to close
async function setupWindowCleanup() {
  const mainWindow = getCurrentWindow();

  // Use a flag to prevent double cleanup
  let hasCleanedUp = false;

  // Listen for close request
  await mainWindow.onCloseRequested(async (event) => {
    if (hasCleanedUp) return;
    hasCleanedUp = true;

    logger.info('Window close requested, cleaning up PTY sessions');

    // Prevent the default close so we can do cleanup then exit manually
    event.preventDefault();

    try {
      await invoke('kill_all_sessions');
      logger.info('All PTY sessions killed successfully');
    } catch (error) {
      logger.error('Failed to kill all sessions on window close', { error });
    }

    // Now exit the app completely
    logger.info('Exiting application');
    try {
      await invoke('exit_app');
    } catch (err) {
      logger.error('Failed to exit app via command', { error: err });
      // Fallback: force exit via web API
      window.close();
    }
  });
}

// Only set up cleanup if running in Tauri
if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
  setupWindowCleanup();
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
