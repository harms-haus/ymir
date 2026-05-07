import type { SettingsRowRenderProps } from '@harms-haus/acp-chat-react';
import { Select } from '@base-ui/react/select';

export function YmirSettingsRow(props: SettingsRowRenderProps) {
  const {
    modes,
    models,
    sessions,
    selectedModeId,
    selectedModelId,
    selectedSessionId,
    onModeChange,
    onModelChange,
    onSessionChange,
    disabled,
  } = props;

  return (
    <div data-ymir-settings-row className="ymir-settings-row">
      <div className="ymir-settings-row__left">
        {modes.length > 0 && (
          <ModeSelector
            modes={modes}
            selectedModeId={selectedModeId}
            onModeChange={onModeChange}
            disabled={disabled}
          />
        )}
        {models.length > 0 && (
          <ModelSelector
            models={models}
            selectedModelId={selectedModelId}
            onModelChange={onModelChange}
            disabled={disabled}
          />
        )}
        {sessions.length > 0 && (
          <SessionSelector
            sessions={sessions}
            selectedSessionId={selectedSessionId}
            onSessionChange={onSessionChange}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
}

function ModeSelector({
  modes,
  selectedModeId,
  onModeChange,
  disabled,
}: {
  modes: SettingsRowRenderProps['modes'];
  selectedModeId: SettingsRowRenderProps['selectedModeId'];
  onModeChange: SettingsRowRenderProps['onModeChange'];
  disabled: boolean;
}) {
  return (
    <Select.Root
      value={selectedModeId ?? null}
      onValueChange={(value) => {
        const mode = modes.find((m) => m.id === value);
        if (mode) {
          onModeChange(mode);
        }
      }}
      disabled={disabled}
    >
      <Select.Trigger className="ymir-selector-trigger ymir-mode-selector">
        <span>{modes.find((m) => m.id === selectedModeId)?.name ?? 'Mode'}</span>
        <Select.Icon className="ymir-selector-icon">▼</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className="ymir-selector-positioner" sideOffset={4}>
          <Select.Popup className="ymir-selector-popup">
            {modes.map((mode) => (
              <Select.Item key={mode.id} value={mode.id} className="ymir-selector-item">
                <Select.ItemText>{mode.name}</Select.ItemText>
                <Select.ItemIndicator className="ymir-selector-indicator">
                  ✓
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

function ModelSelector({
  models,
  selectedModelId,
  onModelChange,
  disabled,
}: {
  models: SettingsRowRenderProps['models'];
  selectedModelId: SettingsRowRenderProps['selectedModelId'];
  onModelChange: SettingsRowRenderProps['onModelChange'];
  disabled: boolean;
}) {
  return (
    <Select.Root
      value={selectedModelId ?? null}
      onValueChange={(value) => {
        const model = models.find((m) => m.id === value);
        if (model) {
          onModelChange(model);
        }
      }}
      disabled={disabled}
    >
      <Select.Trigger className="ymir-selector-trigger ymir-model-selector">
        <span>{models.find((m) => m.id === selectedModelId)?.name ?? 'Model'}</span>
        <Select.Icon className="ymir-selector-icon">▼</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className="ymir-selector-positioner" sideOffset={4}>
          <Select.Popup className="ymir-selector-popup">
            {models.map((model) => (
              <Select.Item key={model.id} value={model.id} className="ymir-selector-item">
                <Select.ItemText>{model.name}</Select.ItemText>
                <Select.ItemIndicator className="ymir-selector-indicator">
                  ✓
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

function SessionSelector({
  sessions,
  selectedSessionId,
  onSessionChange,
  disabled,
}: {
  sessions: SettingsRowRenderProps['sessions'];
  selectedSessionId: SettingsRowRenderProps['selectedSessionId'];
  onSessionChange: SettingsRowRenderProps['onSessionChange'];
  disabled: boolean;
}) {
  const selectedSession = sessions.find((s) => s.sessionId === selectedSessionId);

  return (
    <Select.Root
      value={selectedSessionId ?? null}
      onValueChange={(value) => {
        const session = sessions.find((s) => s.sessionId === value);
        if (session) {
          onSessionChange(session);
        }
      }}
      disabled={disabled}
    >
      <Select.Trigger className="ymir-selector-trigger ymir-session-selector">
        <span>{selectedSession?.title ?? 'Session'}</span>
        <Select.Icon className="ymir-selector-icon">▼</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className="ymir-selector-positioner" sideOffset={4}>
          <Select.Popup className="ymir-selector-popup">
            {sessions.map((session) => (
              <Select.Item
                key={session.sessionId}
                value={session.sessionId}
                className="ymir-selector-item"
              >
                <Select.ItemText>{session.title}</Select.ItemText>
                <Select.ItemIndicator className="ymir-selector-indicator">
                  ✓
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
