import { useState, useRef, useEffect, useCallback } from 'react';
import { useWebSocketClient } from '../../hooks/useWebSocket';
import { useAgentStatus } from '../../hooks/useAgentStatus';
import { AgentOutput, AgentPrompt, AgentStatus } from '../../types/generated/protocol';
import '../../styles/agent.css';

interface AgentMessage {
  id: string;
  type: 'user' | 'agent' | 'system';
  content: string;
  timestamp: number;
}

interface AgentChatProps {
  sessionId: string;
  agentType: string;
  worktreeId: string;
  onSendMessage: (message: string) => void;
}

function getAgentDisplayName(agentType: string): string {
  const agentNames: Record<string, string> = {
    'claude': 'Claude',
    'opencode': 'OpenCode',
    'glm-5': 'GLM-5',
    'gpt-4': 'GPT-4',
    'gpt-5': 'GPT-5',
  };
  return agentNames[agentType.toLowerCase()] || agentType;
}

function getAgentSubtitle(agentType: string): string {
  const agentSubtitles: Record<string, string> = {
    'claude': 'Plan Builder',
    'opencode': 'Coding',
    'glm-5': 'Coding',
    'gpt-4': 'Assistant',
    'gpt-5': 'Assistant',
  };
  return agentSubtitles[agentType.toLowerCase()] || 'Agent';
}

function getStatusDotClass(status: AgentStatus): string {
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

export function AgentChat({ sessionId: _sessionId, agentType, worktreeId, onSendMessage }: AgentChatProps) {
  const client = useWebSocketClient();
  const agentStatusInfo = useAgentStatus(worktreeId);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const agentName = getAgentDisplayName(agentType);
  const agentSubtitle = getAgentSubtitle(agentType);
  const agentStatus = agentStatusInfo?.status ?? 'idle';

  useEffect(() => {
    const unsubscribeOutput = client.onMessage('AgentOutput', (msg: AgentOutput) => {
      if (msg.worktreeId === worktreeId) {
        setMessages((prev) => [
          ...prev,
          {
            id: `output-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'agent',
            content: msg.output,
            timestamp: Date.now(),
          },
        ]);
      }
    });

    const unsubscribePrompt = client.onMessage('AgentPrompt', (msg: AgentPrompt) => {
      if (msg.worktreeId === worktreeId) {
        setMessages((prev) => [
          ...prev,
          {
            id: `prompt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'system',
            content: msg.prompt,
            timestamp: Date.now(),
          },
        ]);
      }
    });

    return () => {
      unsubscribeOutput();
      unsubscribePrompt();
    };
  }, [client, worktreeId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'user',
        content: trimmed,
        timestamp: Date.now(),
      },
    ]);

    onSendMessage(trimmed);
    setInputValue('');
  }, [inputValue, onSendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <div className="agent-chat">
      <div className="agent-chat-messages">
        {messages.length === 0 && (
          <div className="agent-chat-empty">
            <i className="ri-robot-line agent-chat-empty-icon" />
            <p>Start a conversation with {agentName}</p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`${msg.type === 'user' ? 'agent-chat-message user-wrapper' : msg.type === 'system' ? 'agent-chat-message system-wrapper' : 'agent-chat-message agent-wrapper'}`}
          >
            <div
              className={`agent-chat-message ${msg.type === 'user' ? 'user' : msg.type === 'system' ? 'system' : 'agent'}`}
            >
              <pre className="agent-chat-message-content">{msg.content}</pre>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="agent-chat-input-area">
        <div className="agent-chat-status">
          <div className={`agent-chat-status-dot ${getStatusDotClass(agentStatus)}`} />
          <span className="agent-chat-status-text">{agentStatus}</span>
          {agentStatusInfo?.taskSummary && (
            <span className="agent-chat-status-task">{agentStatusInfo.taskSummary}</span>
          )}
        </div>

        <div className="agent-chat-input-wrapper">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask ${agentName.toLowerCase()}...`}
            className="agent-chat-input"
            rows={2}
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!inputValue.trim()}
            className="agent-chat-send-button"
          >
            Send
          </button>
        </div>

        <div className="agent-chat-footer">
          <div className="agent-chat-info">
            <span>{agentName} ({agentSubtitle})</span>
          </div>
          <span className="agent-chat-tab-hint">tab: switch agents</span>
        </div>

        <div className="agent-chat-tip">
          Tip: Use instructions in config to load additional rules files
        </div>
      </div>
    </div>
  );
}
