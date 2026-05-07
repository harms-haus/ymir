import { useStore } from '../../store';
import { AgentRuntimeProvider } from './AgentRuntimeProvider';
import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  MessagePartPrimitive,
} from '@assistant-ui/react';
import './acp-chat.css';

interface AcpChatProps {
  sessionId: string;
  agentType: string;
  /** Worktree ID for context/labeling only. Not used for routing — use threadId instead. */
  worktreeId: string;
  threadId: string;
  onSendMessage: (message: string) => void;
}

function AcpUserMessage() {
  return (
    <MessagePrimitive.Root className="acp-message-row user">
      <div className="acp-message user">
        <MessagePrimitive.Parts
          components={{
            Text: () => (
              <p className="acp-message-text user">
                <MessagePartPrimitive.Text />
              </p>
            ),
          }}
        />
      </div>
    </MessagePrimitive.Root>
  );
}

function AcpAgentMessage() {
  return (
    <MessagePrimitive.Root className="acp-message-row assistant">
      <div className="acp-message assistant">
        <MessagePrimitive.Parts
          components={{
            Text: () => (
              <div className="acp-message-text assistant">
                <MessagePartPrimitive.Text />
              </div>
            ),
          }}
        />
      </div>
    </MessagePrimitive.Root>
  );
}

export function AcpChat({
  sessionId,
  agentType,
  worktreeId,
  threadId,
  onSendMessage,
}: AcpChatProps) {
  // Read accumulator state for this thread
  const thread = useStore((state) => state.acpAccumulator.threads.get(threadId));

  // Show empty state while waiting for session init
  if (!thread) {
    return (
      <div className="acp-chat-container">
        <div className="acp-chat-empty">
          <p>Waiting for agent session...</p>
        </div>
      </div>
    );
  }

  return (
    <AgentRuntimeProvider
      worktreeId={worktreeId}
      threadId={threadId}
      sessionId={sessionId}
      onSendMessage={onSendMessage}
    >
      <div className="acp-chat-container">
        <ThreadPrimitive.Root className="acp-chat-thread-root">
          <ThreadPrimitive.Viewport className="acp-chat-thread-viewport">
            <ThreadPrimitive.Messages>
              {({ message }) =>
                message.role === 'user' ? (
                  <AcpUserMessage key={message.id} />
                ) : (
                  <AcpAgentMessage key={message.id} />
                )
              }
            </ThreadPrimitive.Messages>
            <ThreadPrimitive.ViewportFooter>
              <ComposerPrimitive.Root className="acp-composer-root">
                <ComposerPrimitive.Input
                  className="acp-composer-input"
                  placeholder={`Ask ${agentType}...`}
                />
                <div className="acp-composer-actions">
                  <ComposerPrimitive.Send asChild>
                    <button type="button" className="acp-composer-btn send" aria-label="Send message">
                      Send
                    </button>
                  </ComposerPrimitive.Send>
                  <ComposerPrimitive.Cancel asChild>
                    <button type="button" className="acp-composer-btn stop" aria-label="Stop generation">
                      Stop
                    </button>
                  </ComposerPrimitive.Cancel>
                </div>
              </ComposerPrimitive.Root>
            </ThreadPrimitive.ViewportFooter>
          </ThreadPrimitive.Viewport>
        </ThreadPrimitive.Root>
      </div>
    </AgentRuntimeProvider>
  );
}
