import { useState, useCallback } from 'react';
import { AgentRuntimeProvider } from './AgentRuntimeProvider';
import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
} from '@assistant-ui/react';
import { useAgentStatus } from '../../hooks/useAgentStatus';
import { EventCard, EventContentPart } from './EventCards';
import {
  createPermissionCardSchema,
  createToolCardSchema,
  createPlanCardSchema,
  createStatusCardSchema,
  createCardSchema,
  type PermissionCardSchema,
} from './card-schema';
import { Select } from '@base-ui/react/select';
import { Popover } from '@base-ui/react/popover';
import { useStore } from '../../store';
import '../../styles/agent.css';

interface AgentChatProps {
  sessionId: string;
  agentType: string;
  worktreeId: string;
  onSendMessage: (message: string) => void;
}

const AVAILABLE_PROVIDERS = [
  { id: 'claude', name: 'Claude', subtitle: 'Plan Builder' },
  { id: 'opencode', name: 'OpenCode', subtitle: 'Coding' },
  { id: 'pi', name: 'Pi', subtitle: 'Assistant' },
];

const AVAILABLE_MODELS: Record<string, Array<{ id: string; name: string }>> = {
  claude: [
    { id: 'claude-sonnet-4-6', name: 'Sonnet 4.6' },
    { id: 'claude-opus-4', name: 'Opus 4' },
    { id: 'claude-haiku-3-5', name: 'Haiku 3.5' },
  ],
  opencode: [
    { id: 'opencode-default', name: 'OpenCode' },
  ],
  pi: [
    { id: 'pi-default', name: 'Pi' },
  ],
};

function getAgentDisplayName(agentType: string): string {
  const agentNames: Record<string, string> = {
    claude: 'Claude',
    opencode: 'OpenCode',
    'glm-5': 'GLM-5',
    'gpt-4': 'GPT-4',
    'gpt-5': 'GPT-5',
  };
  return agentNames[agentType.toLowerCase()] || agentType;
}

function getAgentSubtitle(agentType: string): string {
  const agentSubtitles: Record<string, string> = {
    claude: 'Plan Builder',
    opencode: 'Coding',
    'glm-5': 'Coding',
    'gpt-4': 'Assistant',
    'gpt-5': 'Assistant',
  };
  return agentSubtitles[agentType.toLowerCase()] || 'Agent';
}

function getStatusDotClass(status: string): string {
  switch (status) {
    case 'working':
      return 'working';
    case 'waiting':
      return 'waiting';
    case 'idle':
      return 'idle';
    case 'error':
      return 'error';
    default:
      return 'idle';
  }
}

function AgentSelector({
  worktreeId,
  currentAgentType,
  onAgentChange,
}: {
  worktreeId: string;
  currentAgentType: string;
  onAgentChange: (agentId: string) => void;
}) {
  const agentSessions = useStore((state) =>
    state.agentSessions.filter((as) => as.worktreeId === worktreeId)
  );

  const currentSession = agentSessions.find(
    (s) => s.agentType === currentAgentType
  );
  const currentAgent = AVAILABLE_PROVIDERS.find(
    (p) => p.id === currentAgentType.toLowerCase()
  );

  return (
    <Select.Root
      value={currentAgentType}
      onValueChange={(value) => onAgentChange(value)}
    >
      <Select.Trigger className="au-selector-trigger agent-selector">
        <span
          className={`au-status-dot ${getStatusDotClass(
            currentSession?.status ?? 'idle'
          )}`}
        />
        <Select.Value placeholder="Select agent" />
        <Select.Icon className="au-selector-icon">▼</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className="au-selector-positioner" sideOffset={4}>
          <Select.Popup className="au-selector-popup">
            {AVAILABLE_PROVIDERS.map((provider) => {
              const session = agentSessions.find(
                (s) => s.agentType.toLowerCase() === provider.id
              );
              return (
                <Select.Item
                  key={provider.id}
                  value={provider.id}
                  className="au-selector-item"
                >
                  <span
                    className={`au-status-dot ${getStatusDotClass(
                      session?.status ?? 'idle'
                    )}`}
                  />
                  <Select.ItemText>{provider.name}</Select.ItemText>
                  <Select.ItemIndicator className="au-selector-indicator">
                    ✓
                  </Select.ItemIndicator>
                </Select.Item>
              );
            })}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

function ModelSelector({
  providerId,
  currentModel,
  onModelChange,
}: {
  providerId: string;
  currentModel: string;
  onModelChange: (modelId: string) => void;
}) {
  const models = AVAILABLE_MODELS[providerId] || [];

  return (
    <Select.Root value={currentModel} onValueChange={(value) => onModelChange(value)}>
      <Select.Trigger className="au-selector-trigger model-selector">
        <Select.Value placeholder="Model" />
        <Select.Icon className="au-selector-icon">▼</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className="au-selector-positioner" sideOffset={4}>
          <Select.Popup className="au-selector-popup">
            {models.map((model) => (
              <Select.Item
                key={model.id}
                value={model.id}
                className="au-selector-item"
              >
                <Select.ItemText>{model.name}</Select.ItemText>
                <Select.ItemIndicator className="au-selector-indicator">
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

function ProviderSelector({
  currentProvider,
  onProviderChange,
}: {
  currentProvider: string;
  onProviderChange: (providerId: string) => void;
}) {
  const current = AVAILABLE_PROVIDERS.find(
    (p) => p.id === currentProvider.toLowerCase()
  );

  return (
    <Popover.Root>
      <Popover.Trigger className="au-provider-trigger">
        <span className="au-provider-name">{current?.name || 'OpenCode'}</span>
        <span className="au-provider-subtitle">
          {current?.subtitle || 'Coding'}
        </span>
        <span className="au-selector-icon">▼</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="au-selector-positioner" sideOffset={4}>
          <Popover.Popup className="au-selector-popup au-provider-popup">
            {AVAILABLE_PROVIDERS.map((provider) => (
              <button
                key={provider.id}
                type="button"
                className={`au-provider-option ${
                  provider.id === currentProvider.toLowerCase() ? 'active' : ''
                }`}
                onClick={() => onProviderChange(provider.id)}
              >
                <span className="au-provider-option-name">{provider.name}</span>
                <span className="au-provider-option-subtitle">
                  {provider.subtitle}
                </span>
              </button>
            ))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ThinkingBlock({ content }: { content: string }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="thinking-block">
      <button
        type="button"
        className="thinking-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <span className="thinking-icon">💭</span>
        <span className="thinking-label">Thinking</span>
        <span className={`thinking-chevron ${isExpanded ? 'expanded' : ''}`}>
          ▼
        </span>
      </button>
      {isExpanded && (
        <div className="thinking-content">
          <pre>{content}</pre>
        </div>
      )}
    </div>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="agent-chat-message user-wrapper">
      <div className="agent-chat-message user">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  );
}

function AgentMessage() {
  return (
    <MessagePrimitive.Root className="agent-chat-message agent-wrapper">
      <div className="agent-chat-message agent surface">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  );
}

function AgentChatContent({
  agentType,
  worktreeId,
}: {
  agentType: string;
  worktreeId: string;
}) {
  const [selectedProvider, setSelectedProvider] = useState(agentType);
  const [selectedModel, setSelectedModel] = useState(
    AVAILABLE_MODELS[agentType.toLowerCase()]?.[0]?.id || 'default'
  );

  const agentName = getAgentDisplayName(agentType);
  const agentSubtitle = getAgentSubtitle(agentType);
  const agentStatusInfo = useAgentStatus(worktreeId);
  const agentStatus = agentStatusInfo?.status ?? 'idle';

  const handleAgentChange = useCallback((agentId: string) => {
    setSelectedProvider(agentId);
    const defaultModel = AVAILABLE_MODELS[agentId]?.[0]?.id;
    if (defaultModel) {
      setSelectedModel(defaultModel);
    }
  }, []);

  const handleModelChange = useCallback((modelId: string) => {
    setSelectedModel(modelId);
  }, []);

  const handleProviderChange = useCallback((providerId: string) => {
    setSelectedProvider(providerId);
    const defaultModel = AVAILABLE_MODELS[providerId]?.[0]?.id;
    if (defaultModel) {
      setSelectedModel(defaultModel);
    }
  }, []);

  return (
    <div className="agent-chat">
      <div className="agent-chat-messages">
        <ThreadPrimitive.Root>
          <ThreadPrimitive.If empty>
            <div className="agent-chat-empty">
              <i className="ri-robot-line agent-chat-empty-icon" />
              <p>Start a conversation with {agentName}</p>
            </div>
          </ThreadPrimitive.If>
          <ThreadPrimitive.Messages>
            {({ message }) =>
              message.role === 'user' ? (
                <UserMessage key={message.id} />
              ) : (
                <AgentMessage key={message.id} />
              )
            }
          </ThreadPrimitive.Messages>
        </ThreadPrimitive.Root>
      </div>

      <div className="agent-chat-input-area">
        <ComposerPrimitive.Root className="au-composer-root">
          <div className="au-composer-container">
            <div className="au-composer-input-row">
              <ComposerPrimitive.Input
                className="au-composer-input"
                placeholder={`Ask ${agentName.toLowerCase()}...`}
              />
              <ComposerPrimitive.Send className="au-composer-send" asChild>
                <button type="button" aria-label="Send message">
                  <i className="ri-send-plane-fill" />
                </button>
              </ComposerPrimitive.Send>
            </div>
            <div className="au-composer-footer compact">
              <div className="au-composer-status-row">
                <AgentSelector
                  worktreeId={worktreeId}
                  currentAgentType={selectedProvider}
                  onAgentChange={handleAgentChange}
                />
                <ModelSelector
                  providerId={selectedProvider}
                  currentModel={selectedModel}
                  onModelChange={handleModelChange}
                />
              </div>
              <div className="au-composer-meta compact">
                <ProviderSelector
                  currentProvider={selectedProvider}
                  onProviderChange={handleProviderChange}
                />
              </div>
            </div>
          </div>
        </ComposerPrimitive.Root>
      </div>
    </div>
  );
}

export function AgentChat({
  sessionId: _sessionId,
  agentType,
  worktreeId,
  onSendMessage,
}: AgentChatProps) {
  return (
    <AgentRuntimeProvider worktreeId={worktreeId} onSendMessage={onSendMessage}>
      <AgentChatContent agentType={agentType} worktreeId={worktreeId} />
    </AgentRuntimeProvider>
  );
}

export {
  EventCard,
  EventContentPart,
  createPermissionCardSchema,
  createToolCardSchema,
  createPlanCardSchema,
  createStatusCardSchema,
  createCardSchema,
};
export type { PermissionCardSchema };
