import { WindowControls as TauriWindowControls } from 'tauri-controls';
import './WindowControls.css';

interface CustomWindowControlsProps {
  position?: 'left' | 'right';
  platform?: string;
}

/**
 * WindowControls component that provides custom window control buttons
 * (minimize, maximize, close) for the custom titlebar.
 *
 * Renders tauri-controls WindowControls directly (NOT wrapped in WindowTitlebar).
 * WindowTitlebar would render its own internal WindowControls + children,
 * causing duplicate buttons.
 *
 * @param position - Position of window controls ('left' or 'right'). Default: 'right'
 * @param platform - Platform identifier (e.g., 'windows', 'macos', 'linux')
 */
export function WindowControls({
  position = 'right',
  platform = 'unknown',
}: CustomWindowControlsProps) {
  // On macOS, window controls are typically on the left
  // On Windows/Linux, they're on the right
  const controlsOrder: 'left' | 'right' =
    platform === 'macos' || position === 'left' ? 'left' : 'right';

  return (
    <div
      className={`window-controls-container window-controls-${controlsOrder}`}
      data-tauri-drag-region
    >
      <div className="window-controls">
        <TauriWindowControls />
      </div>
    </div>
  );
}

export default WindowControls;
