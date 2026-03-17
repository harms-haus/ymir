import { useState, useEffect, useCallback, useRef } from 'react';
import { Tabs } from '@base-ui/react';
import { useStore, selectTerminalSessionsByWorktreeId } from '../../store';
import { useWebSocketClient } from '../../hooks/useWebSocket';
import { Terminal, type TerminalRef } from './TerminalView';
import { TerminalCreate, TerminalOutput } from '../../types/protocol';
import TerminalIcon from '@mui/icons-material/Terminal';

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
      className="h-full data-[inactive]:hidden"
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
  const terminalSessions = useStore(selectTerminalSessionsByWorktreeId(worktreeId));
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

    if (activeTab === sessionId) {
      const remainingTabs = tabs.filter(tab => tab.sessionId !== sessionId);
      if (remainingTabs.length > 0) {
        setActiveTab(remainingTabs[0].sessionId);
      } else {
        setActiveTab(null);
      }
    }
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
        handleCreateTab().finally(() => {
          creationInFlightRef.current = false;
        });
      }
    }
  }, [worktreeId, tabs.length, handleCreateTab]);

  if (tabs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <TerminalIcon className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-lg mb-2">No terminals</p>
        <p className="text-sm">Click + to create one</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Tabs.Root
        value={activeTab || undefined}
        onValueChange={(value: string | null) => setActiveTab(value)}
        className="flex flex-col h-full"
      >
        <Tabs.List className="flex items-center border-b border-border bg-background px-2">
          {tabs.map((tab) => (
              <Tabs.Tab
              key={tab.sessionId}
              value={tab.sessionId}
              onMouseDown={(e: React.MouseEvent) => handleTabMouseDown(tab.sessionId, e)}
              className={`
                flex items-center gap-2 px-3 py-2 text-sm font-medium
                border-b-2 border-transparent
                hover:bg-muted/50 hover:border-border
                data-[selected]:text-foreground data-[selected]:border-primary
                text-muted-foreground
                cursor-pointer select-none
              `}
            >
              <TerminalIcon className="w-4 h-4" />
              <span>{tab.label}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseTab(tab.sessionId);
                }}
                className="ml-1 p-1 rounded hover:bg-muted opacity-50 hover:opacity-100"
                aria-label="Close tab"
              >
                ×
              </button>
            </Tabs.Tab>
          ))}
          
          <button
            type="button"
            onClick={handleCreateTab}
            className="ml-2 p-2 rounded hover:bg-muted opacity-50 hover:opacity-100"
            aria-label="Create new terminal"
            title="Create new terminal"
          >
            +
          </button>
        </Tabs.List>

        <div className="flex-1 overflow-hidden">
          {tabs.map((tab) => (
            <TerminalPanel key={tab.sessionId} tab={tab} />
          ))}
        </div>
      </Tabs.Root>
    </div>
  );
}