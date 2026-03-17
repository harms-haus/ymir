import { useState, useRef, useEffect, useCallback } from 'react';
import { useWebSocketClient } from '../../hooks/useWebSocket';
import { useAgentStatus } from '../../hooks/useAgentStatus';
import { AgentOutput, AgentPrompt, AgentStatus } from '../../types/protocol';

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

function getStatusDotColor(status: AgentStatus): string {
  switch (status) {
    case 'working':
      return 'bg-green-500';
    case 'waiting':
      return 'bg-yellow-500';
    case 'idle':
      return 'bg-gray-500';
    case 'error':
      return 'bg-red-500';
    default:
      return 'bg-gray-500';
  }
}

export function AgentChat({ sessionId, agentType, worktreeId, onSendMessage }: AgentChatProps) {
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
      if (msg.sessionId === sessionId) {
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
      if (msg.sessionId === sessionId) {
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
  }, [client, sessionId]);

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
    <div className="flex flex-col h-full">
      <div
        className="flex-1 overflow-y-auto p-4 space-y-4"
        style={{ borderLeft: '3px solid hsl(var(--primary))' }}
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-50">
            <i className="ri-robot-line text-4xl mb-4" />
            <p>Start a conversation with {agentName}</p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${
              msg.type === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                msg.type === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : msg.type === 'system'
                  ? 'bg-muted text-muted-foreground text-sm italic'
                  : 'bg-secondary text-secondary-foreground'
              }`}
            >
              <pre className="whitespace-pre-wrap font-sans text-sm">{msg.content}</pre>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-border p-4 bg-background">
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-2 h-2 rounded-full ${getStatusDotColor(agentStatus)}`} />
          <span className="text-xs text-muted-foreground capitalize">{agentStatus}</span>
          {agentStatusInfo?.taskSummary && (
            <span className="text-xs text-muted-foreground ml-2">{agentStatusInfo.taskSummary}</span>
          )}
        </div>

        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask ${agentName.toLowerCase()}...`}
            className="flex-1 min-h-[60px] max-h-[120px] resize-y rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            rows={2}
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!inputValue.trim()}
            className="self-end px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>

        <div className="flex justify-between items-center mt-2 text-xs text-muted-foreground">
          <div className="flex gap-4">
            <span>{agentName} ({agentSubtitle})</span>
          </div>
          <span>tab: switch agents</span>
        </div>

        <div className="mt-2 text-xs text-muted-foreground/70 text-right">
          Tip: Use instructions in config to load additional rules files
        </div>
      </div>
    </div>
  );
}
