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
import '../../styles/agent.css';

interface AgentChatProps {
  sessionId: string;
  agentType: string;
  worktreeId: string;
  onSendMessage: (message: string) => void;
}

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
      <div className="agent-chat-message agent">
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
  const agentName = getAgentDisplayName(agentType);
  const agentSubtitle = getAgentSubtitle(agentType);
  const agentStatusInfo = useAgentStatus(worktreeId);
  const agentStatus = agentStatusInfo?.status ?? 'idle';

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
            {({ message }) => (
              <MessagePrimitive.Root key={message.id}>
                {message.role === 'user' ? <UserMessage /> : <AgentMessage />}
              </MessagePrimitive.Root>
            )}
          </ThreadPrimitive.Messages>
        </ThreadPrimitive.Root>
      </div>

      <div className="agent-chat-input-area">
        <div className="agent-chat-status">
          <div className={`agent-chat-status-dot ${getStatusDotClass(agentStatus)}`} />
          <span className="agent-chat-status-text">{agentStatus}</span>
          {agentStatusInfo?.taskSummary && (
            <span className="agent-chat-status-task">{agentStatusInfo.taskSummary}</span>
          )}
        </div>

        <ComposerPrimitive.Root className="agent-chat-input-wrapper">
          <ComposerPrimitive.Input
            className="agent-chat-input"
            placeholder={`Ask ${agentName.toLowerCase()}...`}
          />
          <ComposerPrimitive.Send className="agent-chat-send-button">Send</ComposerPrimitive.Send>
        </ComposerPrimitive.Root>

        <div className="agent-chat-footer">
          <div className="agent-chat-info">
            <span>
              {agentName} ({agentSubtitle})
            </span>
          </div>
          <span className="agent-chat-tab-hint">tab: switch agents</span>
        </div>
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

export { EventCard, EventContentPart, createPermissionCardSchema, createToolCardSchema, createPlanCardSchema, createStatusCardSchema, createCardSchema };
export type { PermissionCardSchema };
