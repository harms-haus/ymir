import * as React from 'react';
import { useMemo, useCallback, useState, useEffect } from 'react';
import {
  Folder,
  Terminal,
  Code,
  GitBranch,
  Cpu,
  Server,
  Database,
  Cloud,
  Layers,
  Layout,
  Package,
  Wrench,
  Monitor,
  Smartphone,
  Globe,
  File,
  Search,
  Settings,
  Loader2,
  AlertCircle,
  FolderOpen,
  Hammer,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  DialogRoot,
  DialogPortal,
  DialogBackdrop,
  DialogViewport,
  DialogPopup,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from './ui/Dialog';
import { Button } from './ui/Button';
import { useWorkspaceSettings } from '../hooks/useWorkspaceSettings';

const WORKSPACE_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#d946ef',
  '#f43f5e',
  '#64748b',
] as const;

const WORKSPACE_ICONS = [
  'folder',
  'terminal',
  'code',
  'git-branch',
  'cpu',
  'server',
  'database',
  'cloud',
  'layers',
  'layout',
  'package',
  'wrench',
  'monitor',
  'smartphone',
  'globe',
  'file',
  'search',
  'settings',
  'hammer',
] as const;

const iconMap: Record<string, LucideIcon> = {
  folder: Folder,
  terminal: Terminal,
  code: Code,
  'git-branch': GitBranch,
  cpu: Cpu,
  server: Server,
  database: Database,
  cloud: Cloud,
  layers: Layers,
  layout: Layout,
  package: Package,
  wrench: Wrench,
  monitor: Monitor,
  smartphone: Smartphone,
  globe: Globe,
  file: File,
  search: Search,
  settings: Settings,
  hammer: Hammer,
};

function debounce<T extends (...args: Parameters<T>) => Promise<void>>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      void fn(...args);
    }, delay);
  };
}

interface WorkspaceSettingsDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
}

export function WorkspaceSettingsDialog({
  isOpen,
  onOpenChange,
  workspaceId,
}: WorkspaceSettingsDialogProps) {
  const { settings, loading, error, updateSettings } = useWorkspaceSettings(workspaceId);
  const [saving, setSaving] = useState(false);
  const [localSubtitle, setLocalSubtitle] = useState('');

  useEffect(() => {
    if (settings?.subtitle !== undefined) {
      setLocalSubtitle(settings.subtitle);
    }
  }, [settings?.subtitle]);

  const debouncedUpdate = useMemo(
    () =>
      debounce(async (updates: Parameters<typeof updateSettings>[0]) => {
        setSaving(true);
        try {
          await updateSettings(updates);
        } finally {
          setSaving(false);
        }
      }, 300),
    [updateSettings]
  );

  const handleColorSelect = useCallback(
    async (color: string) => {
      setSaving(true);
      try {
        await updateSettings({ color });
      } finally {
        setSaving(false);
      }
    },
    [updateSettings]
  );

  const handleIconSelect = useCallback(
    async (icon: string) => {
      setSaving(true);
      try {
        await updateSettings({ icon });
      } finally {
        setSaving(false);
      }
    },
    [updateSettings]
  );

  const handleDirectorySelect = useCallback(async () => {
    const selected = window.prompt(
      'Enter working directory path:',
      settings?.workingDirectory || ''
    );

    if (selected !== null && selected !== settings?.workingDirectory) {
      setSaving(true);
      try {
        await updateSettings({ workingDirectory: selected });
      } finally {
        setSaving(false);
      }
    }
  }, [settings?.workingDirectory, updateSettings]);

  const handleSubtitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newSubtitle = e.target.value;
      setLocalSubtitle(newSubtitle);
      debouncedUpdate({ subtitle: newSubtitle });
    },
    [debouncedUpdate]
  );

  const currentColor = settings?.color ?? WORKSPACE_COLORS[0];
  const currentIcon = settings?.icon ?? WORKSPACE_ICONS[0];

  return (
    <DialogRoot open={isOpen} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogViewport>
          <DialogPopup className="workspace-settings-dialog">
        <DialogTitle className="workspace-settings-title">
          Workspace Settings
        </DialogTitle>
        <DialogDescription className="workspace-settings-description">
          Customize your workspace appearance and configuration.
        </DialogDescription>

        <div className="workspace-settings-content">
          {loading && (
            <div className="workspace-settings-loading">
              <Loader2 className="animate-spin" size={20} />
              <span>Loading settings...</span>
            </div>
          )}

          {error && (
            <div className="workspace-settings-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {saving && (
            <div className="workspace-settings-saving">
              <Loader2 className="animate-spin" size={14} />
              <span>Saving...</span>
            </div>
          )}

          <div className="workspace-settings-section">
            <span className="workspace-settings-label">Color</span>
            <div className="workspace-settings-color-grid">
              {WORKSPACE_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`workspace-settings-color-button ${
                    currentColor === color ? 'selected' : ''
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => handleColorSelect(color)}
                  aria-label={`Select color ${color}`}
                  aria-pressed={currentColor === color}
                />
              ))}
            </div>
          </div>

          <div className="workspace-settings-section">
            <span className="workspace-settings-label">Icon</span>
            <div className="workspace-settings-icon-grid">
              {WORKSPACE_ICONS.map((iconName) => {
                const IconComponent = iconMap[iconName];
                return (
                  <button
                    key={iconName}
                    type="button"
                    className={`workspace-settings-icon-button ${
                      currentIcon === iconName ? 'selected' : ''
                    }`}
                    onClick={() => handleIconSelect(iconName)}
                    aria-label={`Select icon ${iconName}`}
                    aria-pressed={currentIcon === iconName}
                  >
                    {IconComponent && <IconComponent size={20} />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="workspace-settings-section">
            <span className="workspace-settings-label">Working Directory</span>
            <div className="workspace-settings-directory-row">
              <span className="workspace-settings-directory-path">
                {settings?.workingDirectory || 'No directory set'}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDirectorySelect}
                disabled={saving}
              >
                <FolderOpen size={14} />
                Browse
              </Button>
            </div>
          </div>

          <div className="workspace-settings-section">
            <label htmlFor="workspace-subtitle" className="workspace-settings-label">
              Subtitle
            </label>
            <input
              id="workspace-subtitle"
              type="text"
              className="workspace-settings-input"
              value={localSubtitle}
              onChange={handleSubtitleChange}
              placeholder="Enter workspace subtitle..."
              disabled={loading}
            />
          </div>
        </div>

      <div className="workspace-settings-footer">
        <DialogClose className="workspace-settings-close">
          Close
        </DialogClose>
      </div>
          </DialogPopup>
        </DialogViewport>
      </DialogPortal>
    </DialogRoot>
  );
}

export default WorkspaceSettingsDialog;
