import { useState, useRef, useEffect, useCallback } from 'react';
import { Tab } from '../state/types';
import { Button } from './ui/Button';
import { TabsRoot, TabsList, TabsTab } from './ui/Tabs';
import { Badge } from './ui/badge';
import { Tooltip } from './ui/Tooltip';
import './TabBar.css';
import {
  MenuRoot,
  MenuTrigger,
  MenuPortal,
  MenuPositioner,
  MenuPopup,
  MenuItem,
} from './ui/Menu';

interface TabBarProps {
  paneId: string;
  tabs: Tab[];
  activeTabId: string | null;
  onCreateTab: (paneId: string) => void;
  onCloseTab: (paneId: string, tabId: string) => void;
  onSelectTab: (paneId: string, tabId: string) => void;
  onSplitPane?: (paneId: string, direction: 'horizontal' | 'vertical') => void;
  onCreateTabRight?: (paneId: string, tabId: string) => void;
  onCreateBrowserTab?: () => void;
}

export function TabBar({
  paneId,
    tabs,
    activeTabId,
    onCreateTab,
    onCloseTab,
    onSelectTab,
    onSplitPane,
    onCreateTabRight,
    onCreateBrowserTab,
}: TabBarProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showOverflow, setShowOverflow] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [contextMenuAnchor, setContextMenuAnchor] = useState<{ tabId: string; paneId: string } | null>(null);

    // Check for overflow on mount and when tabs change
    useEffect(() => {
        const checkOverflow = () => {
            const container = scrollContainerRef.current;
            if (container) {
                const hasOverflow = container.scrollWidth > container.clientWidth;
                setShowOverflow(hasOverflow);
            }
        };

        checkOverflow();

        // Also check on resize
        const resizeObserver = new ResizeObserver(checkOverflow);
        if (scrollContainerRef.current) {
            resizeObserver.observe(scrollContainerRef.current);
        }

        return () => resizeObserver.disconnect();
    }, []);

    // Scroll active tab into view
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (container && activeTabId) {
            const activeTabElement = container.querySelector(
                `[data-tab-id="${activeTabId}"]`
            ) as HTMLElement;
            if (activeTabElement) {
                activeTabElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                    inline: 'center',
                });
            }
        }
    }, [activeTabId]);

    const handleCreateTab = useCallback(() => {
        onCreateTab(paneId);
    }, [paneId, onCreateTab]);

    const handleCloseTab = useCallback(
        (e: React.MouseEvent, tabId: string) => {
            e.stopPropagation();
            onCloseTab(paneId, tabId);
        },
        [paneId, onCloseTab]
    );

    const handleSelectTab = useCallback(
        (tabId: string) => {
            onSelectTab(paneId, tabId);
        },
        [paneId, onSelectTab]
    );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, tab: Tab) => {
      e.preventDefault();
      setContextMenuPosition({ x: e.clientX, y: e.clientY });
      setContextMenuAnchor({ tabId: tab.id, paneId });
      setContextMenuOpen(true);
    },
    [paneId]
  );

  const handleSplitHorizontal = useCallback(() => {
    if (contextMenuAnchor && onSplitPane) {
      onSplitPane(contextMenuAnchor.paneId, 'horizontal');
      setContextMenuOpen(false);
    }
  }, [contextMenuAnchor, onSplitPane]);

  const handleSplitVertical = useCallback(() => {
    if (contextMenuAnchor && onSplitPane) {
      onSplitPane(contextMenuAnchor.paneId, 'vertical');
      setContextMenuOpen(false);
    }
  }, [contextMenuAnchor, onSplitPane]);

  const handleCloseTabContext = useCallback(() => {
    if (contextMenuAnchor) {
      onCloseTab(contextMenuAnchor.paneId, contextMenuAnchor.tabId);
      setContextMenuOpen(false);
    }
  }, [contextMenuAnchor, onCloseTab]);

  const handleCreateTabRight = useCallback(() => {
    if (contextMenuAnchor) {
      if (onCreateTabRight) {
        onCreateTabRight(contextMenuAnchor.paneId, contextMenuAnchor.tabId);
      } else {
        onCreateTab(contextMenuAnchor.paneId);
      }
      setContextMenuOpen(false);
    }
  }, [contextMenuAnchor, onCreateTab, onCreateTabRight]);

  const handleOverflowTabSelect = (tabId: string) => {
    handleSelectTab(tabId);
  };

    return (
        <TabsRoot value={activeTabId ?? ''} onValueChange={(value) => {
            if (value) {
                onSelectTab(paneId, value);
            }
        }} className="tab-bar">
            {/* Scrollable tab container */}
            <TabsList ref={scrollContainerRef} className="tab-bar-scroll-container">
      {tabs.map((tab) => (
        <TabsTab
          key={tab.id}
          value={tab.id}
          data-tab-id={tab.id}
          className={`tab-item ${tab.hasNotification ? 'has-notification' : ''}`}
          onContextMenu={(e) => handleContextMenu(e, tab)}
          title={tab.title}
        >
          {/* Tab icon */}
          <span className="tab-icon">$</span>

          {/* Tab title */}
          <span className="tab-title">{tab.title}</span>

          {/* Notification badge */}
          {tab.hasNotification && tab.notificationCount && tab.notificationCount > 0 && (
            <Badge variant="default" className="tab-notification-badge">
              {tab.notificationCount > 99 ? '99+' : tab.notificationCount}
            </Badge>
          )}

          {/* Close button */}
          <button
            type="button"
            className="tab-close-button"
            onClick={(e) => handleCloseTab(e, tab.id)}
            aria-label={`Close ${tab.title}`}
          >
            ×
          </button>
        </TabsTab>
      ))}
            </TabsList>

      {/* Overflow menu using Base-UI Menu primitive */}
      {showOverflow && (
        <div className="tab-bar-overflow">
          <MenuRoot>
            <Tooltip content="Show all tabs">
              <MenuTrigger
                className="tab-bar-overflow-button"
                aria-label="Show all tabs"
              >
                ▼
              </MenuTrigger>
            </Tooltip>
            <MenuPortal>
              <MenuPositioner className="tab-bar-overflow-positioner" align="end" sideOffset={4}>
                <MenuPopup className="tab-bar-overflow-menu">
                  {tabs.map((tab) => (
                    <MenuItem
                      key={tab.id}
                      className={`overflow-menu-item ${
                        tab.id === activeTabId ? 'active' : ''
                      } ${tab.hasNotification ? 'has-notification' : ''}`}
                      onClick={() => handleOverflowTabSelect(tab.id)}
                    >
                      <span className="overflow-menu-icon">$</span>
                      <span className="overflow-menu-title">{tab.title}</span>
                      {tab.hasNotification && tab.notificationCount && tab.notificationCount > 0 && (
                        <Badge variant="default" className="overflow-menu-badge">
                          {tab.notificationCount > 99 ? '99+' : tab.notificationCount}
                        </Badge>
                      )}
                    </MenuItem>
                  ))}
                </MenuPopup>
              </MenuPositioner>
            </MenuPortal>
          </MenuRoot>
        </div>
      )}

            {/* Browser tab button */}
            <Tooltip content="New browser tab">
              <Button
                variant="ghost"
                size="sm"
                className="tab-bar-browser-button"
                onClick={onCreateBrowserTab}
                aria-label="New browser tab"
              >
      <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <title>Browser icon</title>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1 4-10 5.3 15.3 0 0 1 4-10 5.3 15.3 0 0 1 4-10 5.3 15.3 0 0 1 4-10 5.3 15.3 0 0 1 4-10 5.3 12.5 4 10 5.4-6" />
      <path d="m12 5v14m-7-7" />
      <circle cx="6" cy="18" r="3" />
    </svg>
              </Button>
            </Tooltip>

            {/* New tab button */}
            <Tooltip content="New tab">
              <Button
                variant="ghost"
                size="sm"
                className="tab-bar-new-button"
                onClick={handleCreateTab}
                aria-label="New tab"
              >
                +
              </Button>
            </Tooltip>



      {/* Context Menu using Base-UI Menu primitive */}
      <MenuRoot open={contextMenuOpen} onOpenChange={setContextMenuOpen}>
        <MenuPortal>
          <MenuPositioner
            anchor={
              contextMenuPosition
                ? {
                    getBoundingClientRect: () => ({
                      x: contextMenuPosition.x,
                      y: contextMenuPosition.y,
                      width: 0,
                      height: 0,
                      top: contextMenuPosition.y,
                      left: contextMenuPosition.x,
                      right: contextMenuPosition.x,
                      bottom: contextMenuPosition.y,
                      toJSON: () => '',
                    }),
                  }
                : null
            }
            align="start"
            sideOffset={0}
          >
            <MenuPopup className="context-menu">
              <MenuItem className="context-menu-item" onClick={handleSplitHorizontal}>
                Split Horizontal
              </MenuItem>
              <MenuItem className="context-menu-item" onClick={handleSplitVertical}>
                Split Vertical
              </MenuItem>
              <div className="context-menu-separator" />
              <MenuItem className="context-menu-item" onClick={handleCreateTabRight}>
                New Tab Right
              </MenuItem>
              <MenuItem
                className="context-menu-item context-menu-item-danger"
                onClick={handleCloseTabContext}
              >
                Close Tab
              </MenuItem>
            </MenuPopup>
          </MenuPositioner>
        </MenuPortal>
      </MenuRoot>
        </TabsRoot>
    );
}

export default TabBar;
