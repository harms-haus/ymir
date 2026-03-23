import { ReactNode, useCallback } from 'react';
import {
  useExternalStoreRuntime,
  AssistantRuntimeProvider,
  ThreadMessageLike,
  AppendMessage,
} from '@assistant-ui/react';
import { useStore } from '../../store';
import { useWebSocketClient } from '../../hooks/useWebSocket';
import { AccumulatedMessage } from '../../types/state';

function safeStringify(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function convertAccumulatedMessage(msg: AccumulatedMessage, index: number, messages: AccumulatedMessage[], isStreaming: boolean): ThreadMessageLike {
  const content = msg.parts.map((part) => {
    switch (part.type) {
      case 'text':
        return { type: 'text' as const, text: part.text };
      case 'structured':
        return { type: 'text' as const, text: safeStringify(part.data) };
      case 'tool':
        return {
          type: 'tool-call' as const,
          toolCallId: part.toolUseId,
          toolName: part.toolName,
          args: part.input ? (() => { try { return JSON.parse(part.input); } catch { return {}; } })() : {},
          result: part.output ? { type: 'tool-result' as const, result: part.output } : undefined,
        };
      case 'context':
        return { type: 'data' as const, name: `context-${part.updateType}`, data: part.data };
      case 'permission':
        return { type: 'data' as const, name: 'permission', data: { toolUseId: part.toolUseId, toolName: part.toolName } };
      case 'error':
        return { type: 'text' as const, text: `Error (${part.code}): ${part.message}` };
      default:
        return { type: 'text' as const, text: '[Unknown]' };
    }
  });

  const isLastAssistantMessage = msg.role === 'assistant' && index === messages.length - 1;
  const assistantStatus = msg.role === 'assistant'
    ? isLastAssistantMessage && isStreaming
      ? { type: 'running' as const }
      : { type: 'complete' as const, reason: 'unknown' as const }
    : undefined;

  return {
    id: msg.id,
    role: msg.role,
    content,
    createdAt: new Date(msg.createdAt),
    ...(assistantStatus && { status: assistantStatus }),
  };
}

interface AgentRuntimeProviderProps {
 children: ReactNode;
 worktreeId: string;
 sessionId: string;
 onSendMessage: (message: string) => void;
}

export function AgentRuntimeProvider({ children, worktreeId, sessionId, onSendMessage }: AgentRuntimeProviderProps) {
 const client = useWebSocketClient();
 const dispatchAccumulator = useStore((s) => s.dispatchAccumulator);

 const thread = useStore((state) => state.acpAccumulator.threads.get(worktreeId));
 const messages = thread?.messages ?? [];
 const isStreaming = thread?.isStreaming ?? false;
 const sessionStatus = thread?.sessionStatus ?? 'Complete';
 const isRunning = isStreaming || sessionStatus === 'Working';

 const onNew = useCallback(async (message: AppendMessage) => {
 const textContent = message.content
 .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
 .map((part) => part.text)
 .join('\n');
 if (textContent.trim()) {
 dispatchAccumulator({ type: 'USER_MESSAGE', worktreeId, content: textContent });
 onSendMessage(textContent);
 }
 }, [onSendMessage, dispatchAccumulator, worktreeId]);

 const onCancel = useCallback(async () => {
 client.send({ type: 'AgentCancel', worktreeId, sessionId });
 dispatchAccumulator({ type: 'SET_STREAMING', worktreeId, isStreaming: false });
 }, [client, worktreeId, sessionId, dispatchAccumulator]);

  const runtime = useExternalStoreRuntime({
    messages,
    isRunning,
    onNew,
    onCancel,
    convertMessage: (msg, index) => convertAccumulatedMessage(msg, index, messages, isStreaming),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}