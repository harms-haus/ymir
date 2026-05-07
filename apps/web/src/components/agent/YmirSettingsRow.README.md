# YmirSettingsRow

A custom settings row component for the ACP Chat Composer, providing Mode, Model, and Session selection controls using @base-ui/react Select components.

## Features

- **Mode Selector**: Dropdown to select ACP mode configuration
- **Model Selector**: Dropdown to select ACP model configuration  
- **Session Selector**: Dropdown to select agent/session (Claude, OpenCode, Pi)
- Left-aligned selects in a single row layout
- Status indicators showing agent working/idle/waiting/error states
- Consistent styling with existing Ymir UI components

## Usage

```tsx
import { YmirSettingsRow } from './YmirSettingsRow';
import { useWebSocketClient } from '../../hooks/useWebSocket';

function MyAcpChat({ worktreeId, agentType }: { worktreeId: string; agentType: string }) {
  const client = useWebSocketClient();

  const handleConfigChange = (configId: string, value: string) => {
    client.send({
      type: 'AgentSetConfigOption',
      worktreeId,
      configId,
      value,
    });
  };

  const handleAgentChange = (agentType: string) => {
    // Handle agent/session change
    console.log('Agent changed to:', agentType);
  };

  return (
    <div>
      <Thread /* ... */ />
      <Composer /* ... */ />
      <YmirSettingsRow
        worktreeId={worktreeId}
        currentAgentType={agentType}
        onConfigChange={handleConfigChange}
        onAgentChange={handleAgentChange}
      />
    </div>
  );
}
```

## Props

- `worktreeId`: string - The worktree ID for the current session
- `currentAgentType`: string - The currently selected agent type (e.g., 'claude', 'opencode', 'pi')
- `onConfigChange`: (configId: string, value: string) => void - Callback when mode/model config changes
- `onAgentChange`: (agentType: string) => void - Callback when agent/session selection changes

## Implementation Details

- Uses Zustand store (`useStore`) to access:
  - `agentSessions`: All agent session states for status indicators
  - `acpAccumulator.threads`: Configuration options from ACP thread
- Mode and Model options are retrieved from `AcpSessionConfigOption` array with categories 'mode' and 'model'
- Session options are from hardcoded `AVAILABLE_AGENTS` array: `['claude', 'opencode', 'pi']`

## CSS Classes

The component uses the following CSS classes (defined in `acp-chat.css`):

- `.ymir-settings-row`: Main container row
- `.ymir-settings-controls`: Container for Mode and Model selects (left-aligned)
- `.ymir-settings-session`: Container for Session select
- `.ymir-selector-trigger`: Select button trigger
- `.ymir-selector-icon`: Dropdown arrow icon
- `.ymir-selector-popup`: Dropdown menu popup
- `.ymir-selector-item`: Individual dropdown items
- `.ymir-selector-indicator`: Checkmark for selected items
- `.ymir-status-dot`: Status indicator dot (with working/idle/waiting/error states)

## Dependencies

- React
- @base-ui/react Select components
- Zustand store (useStore)
- Types: `AcpSessionConfigOption` from `types/protocol`
