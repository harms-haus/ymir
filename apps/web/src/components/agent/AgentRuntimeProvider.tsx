import { ReactNode, useCallback, useMemo } from 'react';
import {
  useExternalStoreRuntime,
  AssistantRuntimeProvider,
  ThreadMessageLike,
  AppendMessage,
} from '@assistant-ui/react';
import { useStore } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { useWebSocketClient } from '../../hooks/useWebSocket';
import { AccumulatedMessage } from '../../types/state';

function convertAccumulatedMessage(msg: AccumulatedMessage, _index: number): ThreadMessageLike {
  const content = msg.parts.map((part) => {
    switch (part.type) {
      case 'text':
        return { type: 'text' as const, text: part.text };
      case 'structured':
        return { type: 'text' as const, text: part.data };
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

  return {
    id: msg.id,
    role: msg.role,
    content,
    createdAt: new Date(msg.createdAt),
    ...(msg.role === 'assistant' && { status: { type: 'complete' as const, reason: 'unknown' as const } }),
  };
}

interface AgentRuntimeProviderProps {
  children: ReactNode;
  worktreeId: string;
  onSendMessage: (message: string) => void;
}

export function AgentRuntimeProvider({ children, worktreeId, onSendMessage }: AgentRuntimeProviderProps) {
  const client = useWebSocketClient();
  const dispatchAccumulator = useStore((s) => s.dispatchAccumulator);

  const thread = useStore((state) => state.acpAccumulator.threads.get(worktreeId));
  const messages = thread?.messages ?? [];
  const isStreaming = thread?.isStreaming ?? false;
  const sessionStatus = thread?.sessionStatus ?? 'Working';
  const isRunning = isStreaming || sessionStatus === 'Working';

  const onNew = useCallback(async (message: AppendMessage) => {
    const textContent = message.content
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join('\n');
    if (textContent.trim()) {
      onSendMessage(textContent);
    }
  }, [onSendMessage]);

  const onCancel = useCallback(async () => {
    client.send({ type: 'AgentCancel', worktreeId });
    dispatchAccumulator({ type: 'SET_STREAMING', worktreeId, isStreaming: false });
  }, [client, worktreeId, dispatchAccumulator]);

  const runtime = useExternalStoreRuntime({
    messages,
    isRunning,
    onNew,
    onCancel,
    convertMessage: convertAccumulatedMessage,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}