import { useState, useEffect, useCallback, useRef } from 'react';
import { Tabs } from '@base-ui/react';
import { useStore, selectTerminalTabsByWorktreeId, selectIsWorkspacesLoading } from '../../store';
import { useUIStore } from '../../uiStore';
import { useWebSocketClient } from '../../hooks/useWebSocket';
import { Terminal, type TerminalRef } from './TerminalView';
import { TerminalSkeleton } from './TerminalSkeleton';
import type { TerminalMount, TerminalTabClose, TerminalReorder, TerminalRename } from '../../types/protocol';
import TerminalIcon from '@mui/icons-material/Terminal';
import { useShallow } from 'zustand/react/shallow';
import { useContextMenu } from '../../hooks/useContextMenu';
import { TabContextMenu } from '../ui/TabContextMenu';
import '../../styles/tabs.css';
import '../../styles/terminal.css';

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

  if (!tab.activeSessionId) {
    return (
      <Tabs.Panel
        value={tab.id}
        className="terminal-tab-content"
      >
        <div className="terminal-empty-state">
          <TerminalIcon className="terminal-empty-icon" style={{ width: '1.5rem', height: '1.5rem' }} />
          <p className="terminal-empty-message">No session</p>
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
    if (terminalTabs.length === 0 && worktreeId && !creationInFlightRef.current) {
      creationInFlightRef.current = true;
      Promise.resolve(handleCreateTab()).finally(() => {
        creationInFlightRef.current = false;
      });
    }
  }, [worktreeId, terminalTabs.length]);

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
      requestId: crypto.randomUUID(),
    };
    client.send(message);
  }, [client]);

  const handleCreateTab = useCallback(() => {
    const tabId = crypto.randomUUID();
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
        requestId: crypto.randomUUID(),
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
        value={activeTab || (tabs.length === 0 ? 'empty' : undefined)}
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
