import { useEffect, useCallback, useRef } from 'react';
import { Tabs } from '@base-ui/react';
import { useStore, selectActiveAgentTabId, selectAgentTabsByWorktreeId, AgentTab } from '../../store';
import { useWebSocketClient } from '../../hooks/useWebSocket';
import { AgentChat } from './AgentChat';
import { DiffTab } from '../editor/DiffTab';
import { AgentCancel, AgentSend, AgentSpawn } from '../../types/generated/protocol';
import '../../styles/tabs.css';
import '../../styles/agent.css';

interface AgentPaneProps {
  worktreeId: string;
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

export function AgentPane({ worktreeId }: AgentPaneProps) {
  const client = useWebSocketClient();
  const tabs = useStore(selectAgentTabsByWorktreeId(worktreeId));
  const activeTabId = useStore(selectActiveAgentTabId(worktreeId));
  const allAgentSessions = useStore((state) => state.agentSessions);
  const { addAgentTab, removeAgentTab, setActiveAgentTab } = useStore();
  const currentActiveTab = activeTabId && tabs.some((t) => t.id === activeTabId) 
    ? activeTabId 
    : tabs.length > 0 
      ? tabs[0].id 
      : 'empty';
  const creationInProgressRef = useRef(false);
  const addedTabsRef = useRef<Set<string>>(new Set());

  const agentSessions = allAgentSessions.filter((as) => as.worktreeId === worktreeId);

  const handleSpawnAgent = useCallback(() => {
    const agentType = 'opencode';

    const message: AgentSpawn = {
      type: 'AgentSpawn',
      worktreeId,
      agentType,
    };

    client.send(message);
  }, [worktreeId, client]);

  // Create tabs for sessions that don't have them yet
  useEffect(() => {
    const tabSessionIds = new Set(tabs.map((t) => t.sessionId));
    agentSessions.forEach((session) => {
      if (!addedTabsRef.current.has(session.id) && !tabSessionIds.has(session.id)) {
        const agentTab: AgentTab = {
          id: `agent-${session.id}`,
          type: 'agent',
          sessionId: session.id,
          label: session.agentType,
        };
        addedTabsRef.current.add(session.id);
        addAgentTab(worktreeId, agentTab);
      }
    });
  }, [worktreeId, tabs.length, agentSessions.length, addAgentTab]);

  useEffect(() => {
    // Only auto-spawn if there's no agent session AND no tabs
    if (tabs.length === 0 && worktreeId && agentSessions.length === 0 && !creationInProgressRef.current) {
      creationInProgressRef.current = true;
      Promise.resolve(handleSpawnAgent()).finally(() => {
        creationInProgressRef.current = false;
      });
    }
  }, [worktreeId, tabs.length, agentSessions.length, handleSpawnAgent]);

  const handleTabChange = useCallback((value: string | null) => {
    if (value && value !== 'empty') {
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
    // Find the session for this tab and close the agent on the server
    const tab = tabs.find((t) => t.id === tabId);
    if (tab?.sessionId) {
      const session = agentSessions.find((as) => as.id === tab.sessionId);
      if (session) {
        // Send cancel request to server
        const cancelMessage: AgentCancel = {
          type: 'AgentCancel',
          worktreeId: session.worktreeId,
        };
        client.send(cancelMessage);
        // Don't remove session locally - wait for AgentRemoved broadcast
      }
    }
    // Remove tab from UI (the session will be removed by AgentRemoved handler)
    removeAgentTab(worktreeId, tabId);
  }, [worktreeId, tabs, agentSessions, removeAgentTab, client]);

  const handleSendMessage = useCallback((message: string) => {
    // Send to all agent sessions for this worktree
    agentSessions.forEach(() => {
      const sendMessage: AgentSend = {
        type: 'AgentSend',
        worktreeId,
        message,
      };
      client.send(sendMessage);
    });
  }, [worktreeId, agentSessions.length, client]);

  return (
    <div className="agent-pane">
      <Tabs.Root
        value={currentActiveTab}
        onValueChange={handleTabChange}
      >
      <Tabs.List className="tabs-list">
        {tabs.map((tab) => (
          <Tabs.Tab
            key={tab.id}
            value={tab.id}
            onMouseDown={(e) => handleTabMouseDown(tab.id, e)}
            className="tab"
          >
            <i className={`${getTabIcon(tab.type)} tab-icon`} />
            <span className="tab-label">{getTabLabel(tab)}</span>
            <span
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
              className="tab-close"
              aria-label="Close tab"
            >
              ×
            </span>
          </Tabs.Tab>
        ))}

        <button
          type="button"
          onClick={handleSpawnAgent}
          className="new-tab-button"
          aria-label="Create new agent"
          title="Create new agent"
        >
          +
        </button>
      </Tabs.List>

        <div className="agent-panel-content">
          {tabs.length === 0 ? (
            <Tabs.Panel value="empty" className="h-full">
              <div className="agent-empty-state">
                <i className="ri-robot-line agent-empty-icon" />
                <p className="agent-empty-title">No agent session</p>
                <p className="agent-empty-hint">Click + to create one</p>
              </div>
            </Tabs.Panel>
          ) : (
            tabs.map((tab) => {
              const sessionForTab = agentSessions.find((as) => as.id === tab.sessionId);
              return (
                <Tabs.Panel
                  key={tab.id}
                  value={tab.id}
                  className="agent-panel-content"
                >
                  {tab.type === 'agent' && sessionForTab && (
                    <AgentChat
                      sessionId={sessionForTab.id}
                      agentType={sessionForTab.agentType}
                      worktreeId={worktreeId}
                      onSendMessage={handleSendMessage}
                    />
                  )}
                  {tab.type === 'agent' && !sessionForTab && (
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
              );
            })
          )}
        </div>
      </Tabs.Root>
    </div>
  );
}
