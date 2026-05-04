import { useCallback, useEffect, useRef, useState } from 'react';
import { Thread } from '@harms-haus/acp-chat-react';
import type { AcpStore } from '@harms-haus/acp-chat-react';
import { acpSessionManager } from '../../lib/acp-session-manager';
import './acp-chat.css';

interface AcpChatProps {
  sessionId: string;
  agentType: string;
  worktreeId: string;
  onSendMessage: (message: string) => void;
}

export function AcpChat({
  sessionId: _sessionId,
  agentType,
  worktreeId,
  onSendMessage,
}: AcpChatProps) {
  const store = acpSessionManager.getAcpStore(worktreeId);
  const state = acpSessionManager.getSessionState(worktreeId);

  const handleSend = useCallback(
    async (text: string) => {
      try {
        await acpSessionManager.sendPrompt(worktreeId, text);
        onSendMessage(text);
      } catch (error) {
        console.error('[AcpChat] Failed to send prompt:', error);
      }
    },
    [worktreeId, onSendMessage]
  );

  const handleStop = useCallback(async () => {
    try {
      await acpSessionManager.cancelPrompt(worktreeId);
    } catch (error) {
      console.error('[AcpChat] Failed to cancel prompt:', error);
    }
  }, [worktreeId]);

  const handlePermissionRespond = useCallback(
    async (requestId: number, optionId: string) => {
      try {
        // Update local store state
        store?.respondToPermission(requestId, optionId);
        // Note: The actual response is sent via the store's internal
        // mechanism. If we need to send through the controller directly,
        // we would need controller.respondToPermission(requestId, optionId).
      } catch (error) {
        console.error('[AcpChat] Failed to respond to permission:', error);
      }
    },
    [store]
  );

  const isConnected = state?.connectionStatus === 'connected';
  const isInitialized = state?.initialized;
  const hasSessionId = !!state?.sessionId;
  const isReady = isConnected && isInitialized && hasSessionId;

  if (!store) {
    return (
      <div className="acp-chat-container">
        <div className="acp-chat-empty">
          <p>No ACP session available for this worktree.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="acp-chat-container">
      <div className="acp-chat-thread-wrapper">
        <Thread
          store={store}
          className="acp-chat-thread"
          layout="expanded"
          followScroll={true}
          onPermissionRespond={handlePermissionRespond}
          follow={true}
        />
      </div>
      <div className="acp-chat-composer-wrapper">
        <AcpChatComposer
          store={store}
          onSend={handleSend}
          onStop={handleStop}
          disabled={!isReady}
          agentType={agentType}
        />
      </div>
    </div>
  );
}

/**
 * Minimal Composer wrapper that uses acpSessionManager for send/stop
 * instead of the built-in controller.sendPrompt.
 */
function AcpChatComposer({
  store,
  onSend,
  onStop,
  disabled,
  agentType,
}: {
  store: AcpStore;
  onSend: (text: string) => void;
  onStop: () => void;
  disabled: boolean;
  agentType: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isComposing, setIsComposing] = useState(false);

  // Monitor streaming state from the store
  useEffect(() => {
    const unsubscribe = store.subscribe(() => {
      const snapshot = store.getSnapshot();
      const streaming = Array.from(snapshot.messages.values()).some(
        (msg) => msg.status === 'streaming'
      );
      setIsStreaming(streaming);
    });
    return unsubscribe;
  }, [store]);

  const canSend = value.trim().length > 0 && !isStreaming && !disabled;
  const canStop = isStreaming && !disabled;

  const handleSend = useCallback(() => {
    if (!canSend) return;
    const text = value.trim();
    setValue('');
    onSend(text);
  }, [canSend, value, onSend]);

  const handleStop = useCallback(() => {
    if (!canStop) return;
    onStop();
  }, [canStop, onStop]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend, isComposing]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value);
    },
    []
  );

  const handleCompositionStart = useCallback(() => {
    setIsComposing(true);
  }, []);

  const handleCompositionEnd = useCallback(() => {
    setIsComposing(false);
  }, []);

  const lineCount = value.split('\n').length;
  const rows = Math.min(Math.max(lineCount, 2), 8);

  return (
    <div className="acp-composer-wrapper" data-acp-composer-state={isStreaming ? 'stop' : 'send'}>
      <div className="acp-composer-input-container">
        <textarea
          ref={textareaRef}
          className="acp-composer-textarea"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder={`Ask ${agentType}...`}
          disabled={disabled}
          rows={rows}
          aria-label="Message input"
        />
        <div className="acp-composer-controls">
          {isStreaming ? (
            <button
              type="button"
              className="acp-composer-button acp-composer-button--stop"
              onClick={handleStop}
              disabled={disabled}
              aria-label="Stop generation"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              <span className="acp-composer-button-text">Stop</span>
            </button>
          ) : (
            <button
              type="button"
              className="acp-composer-button acp-composer-button--send"
              onClick={handleSend}
              disabled={!canSend}
              aria-label="Send message"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
              <span className="acp-composer-button-text">Send</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
