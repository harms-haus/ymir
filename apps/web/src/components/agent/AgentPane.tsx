import { useState, useEffect, useCallback, useRef } from 'react';
import { Tabs } from '@base-ui/react';
import { useStore, selectActiveAgentTabId, selectAgentTabsByWorktreeId, AgentTab } from '../../store';
import { useWebSocketClient } from '../../hooks/useWebSocket';
import { AgentChat } from './AgentChat';
import { DiffTab } from '../editor/DiffTab';
import { AgentSession, AgentSend, AgentSpawn } from '../../types/generated/protocol';

interface AgentPaneProps {
  worktreeId: string;
  agentSession?: AgentSession;
}

function getTabIcon(type: AgentTab['type']) {
  switch (type) {
    case 'agent':
      return 'ri-robot-line';
    case 'diff':
      return 'ri-git-diff-line';
    case 'editor':
      return 'ri-code-line';
    default:
      return 'ri-robot-line';
  }
}

function getTabLabel(tab: AgentTab): string {
  if (tab.label) return tab.label;
  switch (tab.type) {
    case 'agent':
      return 'Agent';
    case 'diff':
      return tab.filePath ? `Diff: ${tab.filePath.split('/').pop()}` : 'Diff';
    case 'editor':
      return tab.filePath ? tab.filePath.split('/').pop() || 'Editor' : 'Editor';
    default:
      return 'Tab';
  }
}

export function AgentPane({ worktreeId, agentSession }: AgentPaneProps) {
  const client = useWebSocketClient();
  const tabs = useStore(selectAgentTabsByWorktreeId(worktreeId));
  const activeTabId = useStore(selectActiveAgentTabId(worktreeId));
  const { addAgentTab, removeAgentTab, setActiveAgentTab } = useStore();
  const [localActiveTab, setLocalActiveTab] = useState<string | null>(activeTabId);
  const creationInProgressRef = useRef(false);

  const handleSpawnAgent = useCallback(() => {
    const agentType = 'opencode';

    const message: AgentSpawn = {
      type: 'AgentSpawn',
      worktreeId,
      agentType,
    };

    client.send(message);
  }, [worktreeId, client]);

  useEffect(() => {
    if (tabs.length === 0 && agentSession) {
      const agentTab: AgentTab = {
        id: `agent-${agentSession.id}`,
        type: 'agent',
        sessionId: agentSession.id,
        label: agentSession.agentType,
      };
      addAgentTab(worktreeId, agentTab);
    }
  }, [worktreeId, agentSession, tabs.length, addAgentTab]);

  useEffect(() => {
    // Only auto-spawn if there's no agent session AND no tabs
    if (tabs.length === 0 && worktreeId && !agentSession && !creationInProgressRef.current) {
      creationInProgressRef.current = true;
      Promise.resolve(handleSpawnAgent()).finally(() => {
        creationInProgressRef.current = false;
      });
    }
  }, [worktreeId, tabs.length, agentSession, handleSpawnAgent]);

  useEffect(() => {
    if (activeTabId && tabs.some((t) => t.id === activeTabId)) {
      setLocalActiveTab(activeTabId);
    } else if (tabs.length > 0) {
      setLocalActiveTab(tabs[0].id);
    } else {
      setLocalActiveTab(null);
    }
  }, [activeTabId, tabs]);

  const handleTabChange = useCallback((value: string | null) => {
    if (value) {
      setLocalActiveTab(value);
      setActiveAgentTab(worktreeId, value);
    }
  }, [worktreeId, setActiveAgentTab]);

  const handleTabMouseDown = useCallback((tabId: string, e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      removeAgentTab(worktreeId, tabId);
    }
  }, [worktreeId, removeAgentTab]);

  const handleCloseTab = useCallback((tabId: string) => {
    removeAgentTab(worktreeId, tabId);
  }, [worktreeId, removeAgentTab]);

  const handleSendMessage = useCallback((message: string) => {
    if (!agentSession) return;

    const sendMessage: AgentSend = {
      type: 'AgentSend',
      worktreeId,
      message,
    };
    client.send(sendMessage);
  }, [worktreeId, agentSession, client]);

  return (
    <div className="flex flex-col h-full">
      <Tabs.Root
        value={localActiveTab || (tabs.length === 0 ? 'empty' : undefined)}
        onValueChange={handleTabChange}
        className="flex flex-col h-full"
      >
        <Tabs.List className="flex items-center border-b border-border bg-background px-2 overflow-x-auto">
          {tabs.map((tab) => (
            <Tabs.Tab
              key={tab.id}
              value={tab.id}
              onMouseDown={(e) => handleTabMouseDown(tab.id, e)}
              className={`
                flex items-center gap-2 px-3 py-2 text-sm font-medium
                border-b-2 border-transparent
                hover:bg-muted/50 hover:border-border
                data-[selected]:text-foreground data-[selected]:border-primary
                text-muted-foreground
                cursor-pointer select-none whitespace-nowrap
                `}
            >
              <i className={`${getTabIcon(tab.type)} text-base`} />
              <span>{getTabLabel(tab)}</span>
              <div
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseTab(tab.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    handleCloseTab(tab.id);
                  }
                }}
                className="ml-1 p-1 rounded opacity-50 hover:opacity-100 hover:bg-muted/50 cursor-pointer"
                aria-label="Close tab"
              >
                ×
              </div>
            </Tabs.Tab>
          ))}

          <button
            type="button"
            onClick={handleSpawnAgent}
            className="ml-2 p-2 rounded hover:bg-muted opacity-50 hover:opacity-100"
            aria-label="Create new agent"
            title="Create new agent"
          >
            +
          </button>
        </Tabs.List>

        <div className="flex-1 overflow-hidden">
          {tabs.length === 0 ? (
            <Tabs.Panel value="empty" className="h-full">
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <i className="ri-robot-line text-4xl mb-4 opacity-50" />
                <p className="text-lg mb-2">No agent session</p>
                <p className="text-sm">Click + to create one</p>
              </div>
            </Tabs.Panel>
          ) : (
            tabs.map((tab) => (
              <Tabs.Panel
                key={tab.id}
                value={tab.id}
                className="h-full data-[inactive]:hidden"
              >
                {tab.type === 'agent' && agentSession && (
                  <AgentChat
                    sessionId={agentSession.id}
                    agentType={agentSession.agentType}
                    worktreeId={worktreeId}
                    onSendMessage={handleSendMessage}
                  />
                )}
                {tab.type === 'agent' && !agentSession && (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <p>No active agent session</p>
                  </div>
                )}
                {tab.type === 'diff' && tab.filePath && (
                  <DiffTab
                    filePath={tab.filePath}
                    worktreeId={worktreeId}
                    sessionId={tab.sessionId}
                  />
                )}
                {tab.type === 'editor' && (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <p>Editor placeholder (T24)</p>
                  </div>
                )}
              </Tabs.Panel>
            ))
          )}
        </div>
      </Tabs.Root>
    </div>
  );
}
