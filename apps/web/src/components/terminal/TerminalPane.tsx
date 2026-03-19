import { useState, useEffect, useCallback, useRef } from 'react';
import { Tabs } from '@base-ui/react';
import { useStore, selectTerminalSessionsByWorktreeId } from '../../store';
import { useWebSocketClient } from '../../hooks/useWebSocket';
import { Terminal, type TerminalRef } from './TerminalView';
import { TerminalCreate, TerminalOutput } from '../../types/generated/protocol';
import TerminalIcon from '@mui/icons-material/Terminal';
import AddIcon from '@mui/icons-material/Add';
import { useShallow } from 'zustand/react/shallow';
import '../../styles/terminal.css';

interface TerminalTab {
  sessionId: string;
  label: string;
  worktreeId: string;
}

interface TerminalPanelProps {
  tab: TerminalTab;
}

function TerminalPanel({ tab }: TerminalPanelProps) {
  const client = useWebSocketClient();
  const terminalRef = useRef<TerminalRef>(null);

  useEffect(() => {
    const unsubscribe = client.onMessage('TerminalOutput', (message: TerminalOutput) => {
      if (message.sessionId === tab.sessionId && terminalRef.current) {
        terminalRef.current.write(message.data);
      }
    });

    return unsubscribe;
  }, [client, tab.sessionId]);

  return (
    <Tabs.Panel
      value={tab.sessionId}
      className="terminal-tab-content"
    >
      <Terminal terminalSessionId={tab.sessionId} ref={terminalRef} />
    </Tabs.Panel>
  );
}

interface TerminalPaneProps {
  worktreeId: string;
}

export function TerminalPane({ worktreeId }: TerminalPaneProps) {
  const client = useWebSocketClient();
  const terminalSessions = useStore(
    useShallow((state) => selectTerminalSessionsByWorktreeId(worktreeId)(state))
  );
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const creationInFlightRef = useRef(false);
  const nextTabIndexRef = useRef(1);

  useEffect(() => {
    const newTabs = terminalSessions.map(session => ({
      sessionId: session.id,
      label: session.label,
      worktreeId: session.worktreeId,
    }));
    setTabs(newTabs);

    if (newTabs.length > 0 && (!activeTab || !newTabs.find(tab => tab.sessionId === activeTab))) {
      setActiveTab(newTabs[0].sessionId);
    } else if (newTabs.length === 0) {
      setActiveTab(null);
    }
  }, [terminalSessions, activeTab]);

  const handleTabMouseDown = (sessionId: string, e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      handleCloseTab(sessionId);
    }
  };

  const handleCloseTab = (sessionId: string) => {
    client.send({
      type: 'TerminalKill',
      sessionId,
    });
    // No local state update - let TerminalRemoved message flow handle it
  };

  const handleCreateTab = useCallback(() => {
    const label = `Terminal ${nextTabIndexRef.current++}`;

    const message: TerminalCreate = {
      type: 'TerminalCreate',
      worktreeId,
      label,
    };

    client.send(message);
  }, [worktreeId, client]);

  useEffect(() => {
    if (tabs.length === 0 && worktreeId) {
      if (!creationInFlightRef.current) {
        creationInFlightRef.current = true;
        Promise.resolve(handleCreateTab()).finally(() => {
          creationInFlightRef.current = false;
        });
      }
    }
  }, [worktreeId, tabs.length, handleCreateTab]);

   return (
    <div className="terminal-pane">
      <Tabs.Root
        value={activeTab || (tabs.length === 0 ? 'empty' : undefined)}
        onValueChange={(value: string | null) => setActiveTab(value)}
      >
        <Tabs.List className="terminal-tabs-list">
          {tabs.map((tab) => (
            <Tabs.Tab
              key={tab.sessionId}
              value={tab.sessionId}
              onMouseDown={(e: React.MouseEvent) => handleTabMouseDown(tab.sessionId, e)}
              className="terminal-tab">
              <TerminalIcon className="terminal-tab-icon" />
              <span>{tab.label}</span>
              <div
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseTab(tab.sessionId);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    handleCloseTab(tab.sessionId);
                  }
                }}
                className="terminal-tab-close"
                aria-label="Close tab"
              >
                ×
              </div>
            </Tabs.Tab>
          ))}

          <button
            type="button"
            onClick={handleCreateTab}
            className="terminal-add-tab"
            aria-label="Create new terminal"
            title="Create new terminal"
          >
            <AddIcon className="terminal-add-icon" />
          </button>
        </Tabs.List>

        {tabs.length === 0 ? (
          <Tabs.Panel value="empty">
            <div className="terminal-empty-state">
              <TerminalIcon className="terminal-empty-icon" />
              <p className="terminal-empty-message">No terminals</p>
              <p className="terminal-empty-hint">Click + to create one</p>
            </div>
          </Tabs.Panel>
        ) : (
          tabs.map((tab) => (
            <TerminalPanel key={tab.sessionId} tab={tab} />
          ))
        )}
      </Tabs.Root>
    </div>
  );
}