import { useState, useEffect, useCallback, useRef } from 'react';
import { Tabs } from '@base-ui/react';
import { useStore, selectTerminalTabsByWorktreeId, selectIsWorkspacesLoading } from '../../store';
import { useUIStore } from '../../uiStore';
import { useWebSocketClient } from '../../hooks/useWebSocket';
import { Terminal, type TerminalRef } from './TerminalView';
import { TerminalSkeleton } from './TerminalSkeleton';
import type { TerminalMount, TerminalTabClose, TerminalReorder, TerminalRename } from '../../types/protocol';
import TerminalIcon from '@mui/icons-material/Terminal';
import CircularProgress from '@mui/material/CircularProgress';
import { useShallow } from 'zustand/react/shallow';
import { useContextMenu } from '../../hooks/useContextMenu';
import { TabContextMenu } from '../ui/TabContextMenu';
import '../../styles/tabs.css';
import '../../styles/terminal.css';

// crypto.randomUUID may not be available in non-secure contexts (HTTP)
function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: simple UUID v4-ish
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

interface TerminalTabUI {
  id: string;
  label: string;
  worktreeId: string;
  activeSessionId: string | null;
  status: 'active' | 'disconnected';
}

interface TerminalPanelProps {
  tab: TerminalTabUI;
}

function TerminalPanel({ tab }: TerminalPanelProps) {
  const terminalRef = useRef<TerminalRef>(null);
  const client = useWebSocketClient();
  const retryCountRef = useRef(0);
  const isDisconnected = !tab.activeSessionId && tab.status === 'disconnected';

  // DEBUG: Log which render path TerminalPanel takes
  console.log(
    '[TerminalPanel] render:',
    tab.id.slice(0, 8),
    '| status:', tab.status,
    '| activeSessionId:', tab.activeSessionId?.slice(0, 8) ?? 'null',
    '| isDisconnected:', isDisconnected,
    '| label:', tab.label
  );

  // Auto-retry TerminalMount with bounded exponential backoff.
  // Effect is always called (Rules of Hooks compliant); the disconnected
  // check is handled inside the effect body. Uses recursive setTimeout so
  // each retry schedules the next one with increasing delay.
  useEffect(() => {
    if (!isDisconnected) {
      retryCountRef.current = 0; // Reset counter when tab reconnects
      return;
    }

    let cancelled = false;

    const scheduleRetry = (retries: number) => {
      if (cancelled || retries >= 10) return; // Give up after 10 attempts

      const delay = Math.min(1000 * Math.pow(2, retries), 30000); // Exponential backoff, max 30s
      const timer = setTimeout(() => {
        if (cancelled) return;
        retryCountRef.current = retries + 1;
        console.log('[TerminalPanel] sending TerminalMount retry:', retries, 'tabId:', tab.id.slice(0, 8), 'label:', tab.label);
        const message: TerminalMount = {
          type: 'TerminalMount',
          tabId: tab.id,
          worktreeId: tab.worktreeId,
          label: tab.label,
        };
        client.send(message);
        scheduleRetry(retries + 1); // Schedule next retry recursively
      }, delay);

      return () => clearTimeout(timer);
    };

    const cleanup = scheduleRetry(0);

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [isDisconnected, tab.id, tab.worktreeId, tab.label, client]);

  // Tab is disconnected with no active session — show reconnecting state
  if (isDisconnected) {
    return (
      <Tabs.Panel
        value={tab.id}
        className="terminal-tab-content"
      >
        <div className="terminal-empty-state">
          <CircularProgress size={24} style={{ marginBottom: '1rem', color: 'hsl(var(--muted-foreground))' }} />
          <p className="terminal-empty-message">Reconnecting...</p>
          <p className="terminal-empty-hint">Waiting for terminal session</p>
        </div>
      </Tabs.Panel>
    );
  }

  // Tab has no session and is not in disconnected state (e.g., brand new, still mounting)
  if (!tab.activeSessionId) {
    return (
      <Tabs.Panel
        value={tab.id}
        className="terminal-tab-content"
      >
        <div className="terminal-empty-state">
          <TerminalIcon className="terminal-empty-icon" style={{ width: '1.5rem', height: '1.5rem' }} />
          <p className="terminal-empty-message">Initializing...</p>
        </div>
      </Tabs.Panel>
    );
  }

  return (
    <Tabs.Panel
      value={tab.id}
      className="terminal-tab-content"
    >
      <Terminal tabId={tab.id} sessionId={tab.activeSessionId} ref={terminalRef} />
    </Tabs.Panel>
  );
}

interface TerminalPaneProps {
  worktreeId: string;
}

export function TerminalPane({ worktreeId }: TerminalPaneProps) {
  const client = useWebSocketClient();
  const isWorkspacesLoading = useStore(selectIsWorkspacesLoading);
  const terminalTabs = useStore(
    useShallow((state) => selectTerminalTabsByWorktreeId(worktreeId)(state))
  );
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [tabs, setTabs] = useState<TerminalTabUI[]>([]);
  const creationInFlightRef = useRef(false);
  const nextTabIndexRef = useRef(1);

  const prevTabIdsRef = useRef<string>('');
  const tabIdsKey = terminalTabs.map(t => t.id).join(',');

  // Sync store tabs to local state
  useEffect(() => {
    const newTabs: TerminalTabUI[] = terminalTabs.map(tab => ({
      id: tab.id,
      label: tab.label,
      worktreeId: tab.worktreeId,
      activeSessionId: tab.activeSessionId,
      status: tab.status,
    }));
    setTabs(newTabs);

    const savedTabId = useUIStore.getState().activeTerminalTabIds[worktreeId];
    const tabsChanged = prevTabIdsRef.current !== tabIdsKey;

    if (savedTabId && newTabs.some(tab => tab.id === savedTabId)) {
      setActiveTab(savedTabId);
    } else if (newTabs.length > 0 && tabsChanged) {
      setActiveTab(prev =>
        prev && newTabs.find(tab => tab.id === prev)
          ? prev
          : newTabs[0].id
      );
    } else if (newTabs.length === 0) {
      setActiveTab(null);
    }

    prevTabIdsRef.current = tabIdsKey;
  }, [terminalTabs, worktreeId, tabIdsKey]);

  // Persist active tab
  useEffect(() => {
    if (activeTab) {
      useUIStore.getState().setActiveTerminalTabId(worktreeId, activeTab);
    }
  }, [activeTab, worktreeId]);

  // Auto-create first tab on mount if none exist
  useEffect(() => {
    if (terminalTabs.length === 0 && worktreeId && !creationInFlightRef.current && !isWorkspacesLoading) {
      creationInFlightRef.current = true;
      Promise.resolve(handleCreateTab()).finally(() => {
        creationInFlightRef.current = false;
      });
    }
  }, [worktreeId, terminalTabs.length, isWorkspacesLoading]);

  // Track which tabs have TerminalMount requests in-flight (prevents spamming).
  // A tabId in this Set means we've sent a mount and are waiting for TerminalMounted.
  // When the tab becomes active (sessionId received), it is removed from the set,
  // allowing future re-mounts if the session ends again.
  const mountInFlightRef = useRef<Set<string>>(new Set());

  // Reset local state on worktree change — prevents history bleeding across worktrees
  const prevWorktreeRef = useRef(worktreeId);
  useEffect(() => {
    if (prevWorktreeRef.current !== worktreeId) {
      setTabs([]);
      setActiveTab(null);
      mountInFlightRef.current.clear();
      nextTabIndexRef.current = 1;
      prevWorktreeRef.current = worktreeId;
    }
  }, [worktreeId]);

  // Re-spawn PTY for disconnected tabs. Uses in-flight tracking instead of
  // a persistent "ever mounted" Set, so tabs can be re-mounted after session ends.
  useEffect(() => {
    for (const tab of terminalTabs) {
      // If tab is active (has sessionId), clear any in-flight marker
      if (tab.activeSessionId !== null) {
        mountInFlightRef.current.delete(tab.id);
        continue;
      }

      // If tab is disconnected with no sessionId and not already in-flight, send mount
      if (tab.status === 'disconnected' && !mountInFlightRef.current.has(tab.id)) {
        mountInFlightRef.current.add(tab.id);
        const message: TerminalMount = {
          type: 'TerminalMount',
          tabId: tab.id,
          worktreeId: tab.worktreeId,
          label: tab.label,
        };
        client.send(message);
      }
    }
  }, [terminalTabs, worktreeId, client]);

  const handleTabMouseDown = (tabId: string, e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      handleCloseTab(tabId);
    }
  };

  const handleCloseTab = (tabId: string) => {
    const message: TerminalTabClose = {
      type: 'TerminalTabClose',
      tabId,
    };
    client.send(message);
  };

  const handleCloseRight = (tabId: string) => {
    const index = tabs.findIndex((t) => t.id === tabId);
    if (index === -1) return;
    const tabsToClose = tabs.slice(index + 1);
    for (const t of tabsToClose) {
      handleCloseTab(t.id);
    }
  };

  const handleCloseLeft = (tabId: string) => {
    const index = tabs.findIndex((t) => t.id === tabId);
    if (index === -1) return;
    const tabsToClose = tabs.slice(0, index);
    for (const t of tabsToClose) {
      handleCloseTab(t.id);
    }
  };

  const handleCloseOthers = (tabId: string) => {
    const tabsToClose = tabs.filter((t) => t.id !== tabId);
    for (const t of tabsToClose) {
      handleCloseTab(t.id);
    }
  };

  const handleRenameTab = useCallback((tabId: string, newLabel: string) => {
    const message: TerminalRename = {
      type: 'TerminalRename',
      tabId,
      newLabel,
      requestId: generateId(),
    };
    client.send(message);
  }, [client]);

  const handleCreateTab = useCallback(() => {
    const tabId = generateId();
    const label = `Terminal ${nextTabIndexRef.current++}`;

    const message: TerminalMount = {
      type: 'TerminalMount',
      tabId,
      worktreeId,
      label,
    };

    client.send(message);
  }, [worktreeId, client]);

  const { state: contextMenuState, openMenu, closeMenu, handleAction } = useContextMenu({
    onClose: (tabId: string) => handleCloseTab(tabId),
    onCloseRight: (tabId: string) => handleCloseRight(tabId),
    onCloseLeft: (tabId: string) => handleCloseLeft(tabId),
    onCloseOthers: (tabId: string) => handleCloseOthers(tabId),
    onRename: (tabId: string) => {
      const newLabel = prompt('Rename terminal:');
      if (newLabel && newLabel.trim()) {
        handleRenameTab(tabId, newLabel.trim());
      }
    },
  });

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [isDropping, setIsDropping] = useState(false);
  const dragStartXRef = useRef(0);
  const tabsListRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback((index: number, clientX: number) => {
    setDraggedIndex(index);
    setDropTargetIndex(null);
    dragStartXRef.current = clientX;
  }, []);

  const handleDragMove = useCallback((clientX: number) => {
    if (draggedIndex === null || !tabsListRef.current) return;

    const deltaX = clientX - dragStartXRef.current;
    const allTabs = Array.from(tabsListRef.current.querySelectorAll('[data-tab="true"]'));
    if (allTabs.length === 0) return;

    const draggedRect = allTabs[draggedIndex]?.getBoundingClientRect();
    if (!draggedRect) return;

    const draggedCenter = draggedRect.left + draggedRect.width / 2 + deltaX;

    let newIndex = draggedIndex;
    for (let i = 0; i < allTabs.length; i++) {
      if (i === draggedIndex) continue;
      const otherRect = allTabs[i].getBoundingClientRect();
      const otherCenter = otherRect.left + otherRect.width / 2;

      if (deltaX > 0 && draggedCenter > otherCenter && draggedIndex < i) {
        newIndex = i;
        break;
      } else if (deltaX < 0 && draggedCenter < otherCenter && draggedIndex > i) {
        newIndex = i;
        break;
      }
    }

    setDropTargetIndex(newIndex !== draggedIndex ? newIndex : null);
  }, [draggedIndex]);

  const handleDragEnd = useCallback(() => {
    if (draggedIndex !== null && dropTargetIndex !== null && dropTargetIndex !== draggedIndex) {
      setIsDropping(true);
      const newTabs = [...tabs];
      const [moved] = newTabs.splice(draggedIndex, 1);
      newTabs.splice(dropTargetIndex, 0, moved);
      setTabs(newTabs);

      const tabIds = newTabs.map(t => t.id);
      const message: TerminalReorder = {
        type: 'TerminalReorder',
        worktreeId,
        tabIds,
        requestId: generateId(),
      };
      client.send(message);

      setTimeout(() => setIsDropping(false), 50);
    }
    setDraggedIndex(null);
    setDropTargetIndex(null);
  }, [draggedIndex, dropTargetIndex, tabs, worktreeId, client]);

  const getTabTransform = (index: number): string => {
    if (draggedIndex === null || dropTargetIndex === null) return 'translateX(0)';

    if (index === draggedIndex) {
      return 'translateX(0)';
    }

    const tabWidthEstimate = 120;

    if (draggedIndex < dropTargetIndex) {
      if (index > draggedIndex && index <= dropTargetIndex) {
        return `translateX(-${tabWidthEstimate}px)`;
      }
    } else {
      if (index >= dropTargetIndex && index < draggedIndex) {
        return `translateX(${tabWidthEstimate}px)`;
      }
    }

    return 'translateX(0)';
  };

  return (
    <div className="terminal-pane">
      <Tabs.Root
        value={activeTab ?? (tabs.length > 0 ? tabs[0].id : 'empty')}
        onValueChange={(value: string | null) => setActiveTab(value)}
      >
        <Tabs.List className="tabs-list" ref={tabsListRef}>
          {tabs.map((tab, index) => (
            <SortableTerminalTab
              key={tab.id}
              tab={tab}
              index={index}
              isDragging={draggedIndex === index}
              isDropTarget={dropTargetIndex === index}
              isDropping={isDropping}
              transform={getTabTransform(index)}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
              onMouseDown={handleTabMouseDown}
              onCloseTab={handleCloseTab}
              onContextMenu={openMenu}
            />
          ))}

          <button
            type="button"
            onClick={handleCreateTab}
            className="new-tab-button"
            aria-label="Create new terminal"
            title="Create new terminal"
          >
            +
          </button>
        </Tabs.List>

        {isWorkspacesLoading ? (
          <TerminalSkeleton />
        ) : tabs.length === 0 ? (
          <Tabs.Panel value="empty">
            <div className="terminal-empty-state">
              <TerminalIcon className="terminal-empty-icon" style={{ width: '1.5rem', height: '1.5rem' }} />
              <p className="terminal-empty-message">No terminals</p>
              <p className="terminal-empty-hint">Click + to create one</p>
            </div>
          </Tabs.Panel>
        ) : (
          tabs.map((tab) => (
            <TerminalPanel key={tab.id} tab={tab} />
          ))
        )}
      </Tabs.Root>
      <TabContextMenu
        state={contextMenuState}
        onAction={handleAction}
        closeMenu={closeMenu}
      />
    </div>
  );
}

interface SortableTerminalTabProps {
  tab: TerminalTabUI;
  index: number;
  isDragging: boolean;
  isDropTarget: boolean;
  isDropping: boolean;
  transform: string;
  onDragStart: (index: number, clientX: number) => void;
  onDragMove: (clientX: number) => void;
  onDragEnd: () => void;
  onMouseDown: (tabId: string, e: React.MouseEvent) => void;
  onCloseTab: (tabId: string) => void;
  onContextMenu: (e: React.MouseEvent, tabId: string, type: 'agent-tab' | 'terminal-tab') => void;
}

function SortableTerminalTab({
  tab,
  index,
  isDragging,
  isDropping,
  transform: baseTransform,
  onDragStart,
  onDragMove,
  onDragEnd,
  onMouseDown,
  onCloseTab,
  onContextMenu,
}: SortableTerminalTabProps) {
  const [dragStartX, setDragStartX] = useState(0);
  const [dragCurrentX, setDragCurrentX] = useState(0);
  const tabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setDragCurrentX(e.clientX);
      onDragMove(e.clientX);
    };

    const handleMouseUp = () => {
      onDragEnd();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onDragMove, onDragEnd]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    onDragStart(index, e.clientX);
    setDragStartX(e.clientX);
    setDragCurrentX(e.clientX);
    e.preventDefault();
  };

  const dragOffset = isDragging ? dragCurrentX - dragStartX : 0;
  const transform = isDragging ? `translateX(${dragOffset}px)` : baseTransform;
  const transition = isDragging || isDropping ? 'none' : 'transform 0.2s ease';
  const opacity = isDragging ? 0.3 : 1;

  // Status indicator
  const statusColor = tab.status === 'active' ? '#3fb950' : '#f85149';

  return (
    <Tabs.Tab
      ref={tabRef}
      value={tab.id}
      data-tab="true"
      onMouseDown={(e) => {
        onMouseDown(tab.id, e);
        handleMouseDown(e);
      }}
      onContextMenu={(e) => onContextMenu(e, tab.id, 'terminal-tab')}
      className="tab"
      style={{
        transform,
        transition,
        opacity,
        cursor: isDragging ? 'grabbing' : 'pointer',
      }}
    >
      <div
        className="tab-status-dot"
        style={{
          width: '0.5rem',
          height: '0.5rem',
          borderRadius: '50%',
          backgroundColor: statusColor,
          flexShrink: 0,
        }}
      />
      <TerminalIcon className="tab-icon" style={{ width: '0.75rem', height: '0.75rem' }} />
      <span className="tab-label">{tab.label}</span>
      <div
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
      </div>
    </Tabs.Tab>
  );
}
