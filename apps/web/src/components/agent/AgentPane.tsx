import { useEffect, useCallback, useRef, useState } from 'react';
import { Tabs } from '@base-ui/react';
import { useStore, selectActiveAgentTabId, selectAgentTabsByWorktreeId, AgentTab } from '../../store';
import { useWebSocketClient } from '../../hooks/useWebSocket';
import { AgentChat } from './AgentChat';
import { DiffTab } from '../editor/DiffTab';
import { AgentCancel, AgentSend, AgentSpawn } from '../../types/generated/protocol';
import { useContextMenu } from '../../hooks/useContextMenu';
import { TabContextMenu } from '../ui/TabContextMenu';
import { useSortableTabs, SortableTab } from '../ui/SortableTabs';
import RobotIcon from '@mui/icons-material/SmartToy';
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
  const { addAgentTab, removeAgentTab, removeAgentTabsRightOf, removeAgentTabsLeftOf, removeAgentTabsOthers, setActiveAgentTab, updateAgentTab, reorderAgentTabs } = useStore();
  const currentActiveTab = activeTabId && tabs.some((t) => t.id === activeTabId)
    ? activeTabId
    : tabs.length > 0
    ? tabs[0].id
    : 'empty';
  const creationInProgressRef = useRef(false);
  const addedTabsRef = useRef<Set<string>>(new Set());
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

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

  const handleCloseTab = useCallback((tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (tab?.sessionId) {
      const session = agentSessions.find((as) => as.id === tab.sessionId);
      if (session) {
        const cancelMessage: AgentCancel = {
          type: 'AgentCancel',
          worktreeId: session.worktreeId,
        };
        client.send(cancelMessage);
      }
    }
    removeAgentTab(worktreeId, tabId);
  }, [worktreeId, tabs, agentSessions, removeAgentTab, client]);

  const handleSendMessage = useCallback((message: string) => {
    agentSessions.forEach(() => {
      const sendMessage: AgentSend = {
        type: 'AgentSend',
        worktreeId,
        message,
      };
      client.send(sendMessage);
    });
  }, [worktreeId, agentSessions.length, client]);

  const { state: contextMenuState, openMenu, closeMenu, handleAction } = useContextMenu({
    onClose: (tabId: string) => handleCloseTab(tabId),
    onCloseRight: (tabId: string) => removeAgentTabsRightOf(worktreeId, tabId),
    onCloseLeft: (tabId: string) => removeAgentTabsLeftOf(worktreeId, tabId),
    onCloseOthers: (tabId: string) => removeAgentTabsOthers(worktreeId, tabId),
    onRename: (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (tab) {
        setRenamingTabId(tabId);
        setRenameValue(tab.label || getTabLabel(tab));
        setTimeout(() => renameInputRef.current?.focus(), 0);
      }
    },
  });

  const handleRenameSubmit = useCallback((tabId: string) => {
    if (renameValue.trim()) {
      updateAgentTab(worktreeId, tabId, { label: renameValue.trim() });
    }
    setRenamingTabId(null);
    setRenameValue('');
  }, [worktreeId, updateAgentTab, renameValue]);

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent, tabId: string) => {
    if (e.key === 'Enter') {
      handleRenameSubmit(tabId);
    } else if (e.key === 'Escape') {
      setRenamingTabId(null);
      setRenameValue('');
    }
  }, [handleRenameSubmit]);

  const {
    draggedIndex,
    dropTargetIndex,
    tabsListRef,
    getTabStyle,
    handleMouseDown,
  } = useSortableTabs({
    onReorder: (from, to) => reorderAgentTabs(worktreeId, from, to),
  });

  return (
    <div className="agent-pane">
      <Tabs.Root
        value={currentActiveTab}
        onValueChange={handleTabChange}
      >
        <Tabs.List className="tabs-list" ref={tabsListRef}>
          {tabs.map((tab, index) => (
            <SortableTab
              key={tab.id}
              index={index}
              draggedIndex={draggedIndex}
              dropTargetIndex={dropTargetIndex}
              getTabStyle={getTabStyle}
              onMouseDown={handleMouseDown}
            >
              <AgentTabContent
                tab={tab}
                renamingTabId={renamingTabId}
                renameValue={renameValue}
                setRenameValue={setRenameValue}
                handleRenameSubmit={handleRenameSubmit}
                handleRenameKeyDown={handleRenameKeyDown}
                renameInputRef={renameInputRef}
                onCloseTab={handleCloseTab}
                onContextMenu={openMenu}
                getTabLabel={getTabLabel}
                getTabIcon={getTabIcon}
              />
            </SortableTab>
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
                <RobotIcon className="agent-empty-icon" style={{ width: '1.5rem', height: '1.5rem' }} />
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
      <TabContextMenu
        state={contextMenuState}
        onAction={handleAction}
        closeMenu={closeMenu}
      />
    </div>
  );
}

interface AgentTabContentProps {
  tab: AgentTab;
  renamingTabId: string | null;
  renameValue: string;
  setRenameValue: (value: string) => void;
  handleRenameSubmit: (tabId: string) => void;
  handleRenameKeyDown: (e: React.KeyboardEvent, tabId: string) => void;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  onCloseTab: (tabId: string) => void;
  onContextMenu: (e: React.MouseEvent, tabId: string, type: 'agent-tab' | 'terminal-tab') => void;
  getTabLabel: (tab: AgentTab) => string;
  getTabIcon: (type: AgentTab['type']) => string;
}

function AgentTabContent({
  tab,
  renamingTabId,
  renameValue,
  setRenameValue,
  handleRenameSubmit,
  handleRenameKeyDown,
  renameInputRef,
  onCloseTab,
  onContextMenu,
  getTabLabel,
  getTabIcon,
}: AgentTabContentProps) {
  return (
    <Tabs.Tab
      value={tab.id}
      onContextMenu={(e) => onContextMenu(e, tab.id, 'agent-tab')}
      className="tab"
    >
      {tab.type === 'agent' ? (
        <RobotIcon className="tab-icon" style={{ width: '0.75rem', height: '0.75rem' }} />
      ) : (
        <i className={`${getTabIcon(tab.type)} tab-icon`} style={{ fontSize: '0.75rem' }} />
      )}
      {renamingTabId === tab.id ? (
        <input
          ref={renameInputRef}
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={() => handleRenameSubmit(tab.id)}
          onKeyDown={(e) => handleRenameKeyDown(e, tab.id)}
          className="tab-rename-input"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="tab-label">{getTabLabel(tab)}</span>
      )}
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onCloseTab(tab.id);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
            onCloseTab(tab.id);
          }
        }}
        className="tab-close"
        aria-label="Close tab"
      >
        ×
      </span>
    </Tabs.Tab>
  );
}
