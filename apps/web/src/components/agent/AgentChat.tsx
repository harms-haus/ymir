import { useCallback, useMemo, useState } from 'react';
import { AgentRuntimeProvider } from './AgentRuntimeProvider';
import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  MessagePartPrimitive,
} from '@assistant-ui/react';
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
import { useStore } from '../../store';
import { useWebSocketClient } from '../../hooks/useWebSocket';
import { useAgentStatus } from '../../hooks/useAgentStatus';
import type { AcpSessionConfigOption } from '../../types/protocol';
import '../../styles/agent.css';

interface AgentChatProps {
  sessionId: string;
  agentType: string;
  worktreeId: string;
  onSendMessage: (message: string) => void;
}

const EMPTY_CONFIG_OPTIONS: AcpSessionConfigOption[] = [];
const AVAILABLE_AGENTS = ['claude', 'opencode', 'pi'] as const;

function getAgentDisplayName(agentType: string): string {
  const agentNames: Record<string, string> = {
    claude: 'Claude',
    opencode: 'OpenCode',
    pi: 'Pi',
    'glm-5': 'GLM-5',
    'gpt-4': 'GPT-4',
    'gpt-5': 'GPT-5',
  };
  return agentNames[agentType.toLowerCase()] || agentType;
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

function getOptionLabel(option: AcpSessionConfigOption | undefined): string {
  if (!option) {
    return '';
  }
  return option.options.find((item) => item.value === option.currentValue)?.name || option.currentValue;
}

function getConfigOption(
  configOptions: AcpSessionConfigOption[],
  id: string,
  category?: string
): AcpSessionConfigOption | undefined {
  return configOptions.find((option) => option.id === id)
    || configOptions.find((option) => option.category === category)
    || undefined;
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
  const allAgentSessions = useStore((state) => state.agentSessions);
  const currentSession = useMemo(
    () => allAgentSessions.find(
      (session) => session.worktreeId === worktreeId && session.agentType === currentAgentType
    ),
    [allAgentSessions, worktreeId, currentAgentType]
  );

  return (
    <Select.Root
      value={currentAgentType}
      onValueChange={(value) => {
        if (value) {
          onAgentChange(value);
        }
      }}
    >
      <Select.Trigger className="au-selector-trigger agent-selector">
        <span
          className={`au-status-dot ${getStatusDotClass(currentSession?.status ?? 'idle')}`}
        />
        <span>{getAgentDisplayName(currentAgentType)}</span>
        <Select.Icon className="au-selector-icon">▼</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className="au-selector-positioner" sideOffset={4}>
          <Select.Popup className="au-selector-popup">
            {AVAILABLE_AGENTS.map((agentId) => {
              const session = allAgentSessions.find(
                (item) => item.worktreeId === worktreeId && item.agentType === agentId
              );
              const sessionStatus = session ? session.status : 'idle';

              return (
              <Select.Item
                key={agentId}
                value={agentId}
                className="au-selector-item"
              >
                <span
                  className={`au-status-dot ${getStatusDotClass(sessionStatus)}`}
                />
                <Select.ItemText>{getAgentDisplayName(agentId)}</Select.ItemText>
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

function ConfigSelector({
  option,
  placeholder,
  className,
  onChange,
}: {
  option?: AcpSessionConfigOption;
  placeholder: string;
  className: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select.Root
      value={option?.currentValue ?? null}
      onValueChange={(value) => {
        if (value) {
          onChange(value);
        }
      }}
    >
      <Select.Trigger className={`au-selector-trigger ${className}`}>
        <span>{option ? getOptionLabel(option) : placeholder}</span>
        <Select.Icon className="au-selector-icon">▼</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className="au-selector-positioner" sideOffset={4}>
          <Select.Popup className="au-selector-popup">
            {(option?.options ?? []).map((item) => (
              <Select.Item
                key={`${option?.id ?? placeholder}-${item.value}`}
                value={item.value}
                className="au-selector-item"
              >
                <Select.ItemText>{item.name}</Select.ItemText>
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

function UserMessage() {
  return (
    <MessagePrimitive.Root className="assistant-demo-message-row user">
      <div className="assistant-demo-message user">
        <MessagePrimitive.Parts
          components={{
            Text: () => (
              <p className="assistant-demo-message-text user">
                <MessagePartPrimitive.Text />
              </p>
            ),
          }}
        />
      </div>
    </MessagePrimitive.Root>
  );
}

function AgentToolPart(props: Parameters<typeof EventContentPart>[0]['part']) {
  return <EventContentPart part={props} />;
}

function AgentMessage() {
  return (
    <MessagePrimitive.Root className="assistant-demo-message-row assistant">
      <div className="assistant-demo-assistant-stack">
        <MessagePrimitive.Parts
          components={{
            Text: () => (
              <div className="assistant-demo-message assistant">
                <p className="assistant-demo-message-text assistant">
                  <MessagePartPrimitive.Text />
                </p>
              </div>
            ),
            tools: {
              Fallback: AgentToolPart,
            },
            data: {
              Fallback: AgentToolPart,
            },
          }}
        />
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
  const client = useWebSocketClient();
  const agentStatus = useAgentStatus(worktreeId);
  const [selectedAgentType, setSelectedAgentType] = useState(agentType);
  const thread = useStore((state) => state.acpAccumulator.threads.get(worktreeId));
  const configOptions = thread?.configOptions ?? EMPTY_CONFIG_OPTIONS;
  const hasMessages = (thread?.messages.length ?? 0) > 0;

  const agentName = getAgentDisplayName(selectedAgentType);
  const modeOption = useMemo(
    () => getConfigOption(configOptions, 'mode', 'mode'),
    [configOptions]
  );
  const modelOption = useMemo(
    () => getConfigOption(configOptions, 'model', 'model'),
    [configOptions]
  );

  const handleConfigChange = useCallback((configId: string, value: string) => {
    client.send({
      type: 'AgentSetConfigOption',
      worktreeId,
      configId,
      value,
    });
  }, [client, worktreeId]);

  const handleAgentChange = useCallback((nextAgentType: string) => {
    setSelectedAgentType(nextAgentType);
  }, []);

  return (
    <div className="agent-chat agent-chat-demo">
      <ThreadPrimitive.Root className={`assistant-demo-thread-root agent-chat-thread-root${hasMessages ? '' : ' empty'}`}>
        <ThreadPrimitive.Viewport className={`assistant-demo-thread-viewport${hasMessages ? '' : ' empty'}`} autoScroll={false}>
          {hasMessages && (
            <div className="assistant-demo-thread-frame agent-chat-thread-frame">
              <ThreadPrimitive.Messages>
                {({ message }) =>
                  message.role === 'user' ? (
                    <UserMessage key={message.id} />
                  ) : (
                    <AgentMessage key={message.id} />
                  )
                }
              </ThreadPrimitive.Messages>
            </div>
          )}

          <ThreadPrimitive.ViewportFooter className="assistant-demo-footer-shell">
            <ComposerPrimitive.Root className="assistant-demo-composer-root">
              <div className="assistant-demo-composer-shell">
                <ComposerPrimitive.Input
                  className="assistant-demo-composer-input"
                  placeholder={`Ask ${agentName.toLowerCase()}...`}
                />
                <div className="assistant-demo-float-actions">
                  <ComposerPrimitive.Send asChild>
                    <button type="button" className="assistant-demo-float-button" aria-label="Send message">
                      <i className="ri-send-plane-fill" />
                    </button>
                  </ComposerPrimitive.Send>
                  <ComposerPrimitive.Cancel asChild>
                    <button type="button" className="assistant-demo-float-button" aria-label="Stop generation">
                      <i className="ri-stop-circle-line" />
                    </button>
                  </ComposerPrimitive.Cancel>
                </div>
              </div>

              <div className="assistant-demo-composer-footer agent-chat-composer-footer">
                <div className="assistant-demo-composer-controls">
                  <ConfigSelector
                    option={modeOption}
                    placeholder="Mode"
                    className="mode-selector"
                    onChange={(value) => {
                      if (modeOption) {
                        handleConfigChange(modeOption.id, value);
                      }
                    }}
                  />
                  <ConfigSelector
                    option={modelOption}
                    placeholder="Model"
                    className="model-selector"
                    onChange={(value) => {
                      if (modelOption) {
                        handleConfigChange(modelOption.id, value);
                      }
                    }}
                  />
                </div>
                <div className="assistant-demo-connection-state">
                  <AgentSelector
                    worktreeId={worktreeId}
                    currentAgentType={selectedAgentType}
                    onAgentChange={handleAgentChange}
                  />
                  <span className={`au-status-dot ${getStatusDotClass(agentStatus?.status ?? 'idle')}`} />
                  <span className="assistant-demo-connection-label">{agentStatus?.status ?? 'idle'}</span>
                </div>
              </div>
            </ComposerPrimitive.Root>
          </ThreadPrimitive.ViewportFooter>
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>
    </div>
  );
}

export function AgentChat({
 sessionId,
 agentType,
 worktreeId,
 onSendMessage,
}: AgentChatProps) {
 return (
 <AgentRuntimeProvider worktreeId={worktreeId} sessionId={sessionId} onSendMessage={onSendMessage}>
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
