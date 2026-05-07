import { useRef } from 'react';
import { Thread, Composer } from '@harms-haus/acp-chat-react';
import type { AcpStore } from '@harms-haus/acp-chat-react';
import type { SessionController } from '@harms-haus/acp-chat-core';
import { useScrollbarFade } from '../../hooks/useScrollbarFade';
import { YmirSettingsRow } from './YmirSettingsRow';
import './acp-chat.css';

interface AcpChatProps {
  agentTabId: string;
  agentType: string;
  store: AcpStore;
  controller: SessionController;
}

export function AcpChat({
  agentTabId,
  agentType,
  store,
  controller,
}: AcpChatProps) {
  const threadContainerRef = useRef<HTMLDivElement>(null);

  useScrollbarFade(threadContainerRef);

  return (
    <div className="acp-chat-container" ref={threadContainerRef}>
      <Thread
        store={store}
        controller={controller}
        layout="expanded"
        followScroll={true}
        follow={true}
        className="ymir-agent-thread"
      />
      <Composer
        store={store}
        controller={controller}
        minRows={2}
        placeholder={`Ask ${agentType}...`}
        renderSettingsRow={YmirSettingsRow}
        className="ymir-agent-composer"
      />
    </div>
  );
}
