import { useState, useRef, useEffect, useCallback } from 'react';
import { Tab } from '../state/types';

import './TabBar.css';

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
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
  const overflowMenuRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; anchorTabId: string; anchorPaneId: string } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        contextMenu &&
        !contextMenuRef.current?.contains(e.target as Node)
      ) {
        setContextMenu(null);
      }
    };

    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      if (contextMenu) {
        document.removeEventListener('mousedown', handleClickOutside);
      }
    };
  }, [contextMenu]);

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
  }, [tabs]);

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
      setContextMenu({ x: e.clientX, y: e.clientY, anchorTabId: tab.id, anchorPaneId: paneId });
    },
    [paneId]
  );

  const handleSplitHorizontal = useCallback(() => {
    if (contextMenu && onSplitPane) {
      onSplitPane(contextMenu.anchorPaneId, 'horizontal');
      setContextMenu(null);
    }
  }, [contextMenu, onSplitPane]);

  const handleSplitVertical = useCallback(() => {
    if (contextMenu && onSplitPane) {
      onSplitPane(contextMenu.anchorPaneId, 'vertical');
      setContextMenu(null);
    }
  }, [contextMenu, onSplitPane]);

  const handleCloseTabContext = useCallback(() => {
    if (contextMenu) {
      onCloseTab(contextMenu.anchorPaneId, contextMenu.anchorTabId);
      setContextMenu(null);
    }
  }, [contextMenu, onCloseTab]);

  const handleCreateTabRight = useCallback(() => {
    if (contextMenu) {
      if (onCreateTabRight) {
        onCreateTabRight(contextMenu.anchorPaneId, contextMenu.anchorTabId);
      } else {
        onCreateTab(contextMenu.anchorPaneId);
      }
      setContextMenu(null);
    }
  }, [contextMenu, onCreateTab, onCreateTabRight]);

  const toggleOverflowMenu = () => {
    setOverflowMenuOpen(!overflowMenuOpen);
  };

  const handleOverflowTabSelect = (tabId: string) => {
    handleSelectTab(tabId);
    setOverflowMenuOpen(false);
  };

  return (
    <div className="tab-bar">
      {/* Scrollable tab container */}
      <div ref={scrollContainerRef} className="tab-bar-scroll-container">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            data-tab-id={tab.id}
            className={`tab-item ${tab.id === activeTabId ? 'active' : ''} ${
              tab.hasNotification ? 'has-notification' : ''
            }`}
            onClick={() => handleSelectTab(tab.id)}
            onContextMenu={(e) => handleContextMenu(e, tab)}
            title={tab.title}
          >
            {/* Tab icon */}
            <span className="tab-icon">$</span>

            {/* Tab title */}
            <span className="tab-title">{tab.title}</span>

            {/* Notification badge */}
            {tab.hasNotification && tab.notificationCount > 0 && (
              <span className="tab-notification-badge">
                {tab.notificationCount > 99 ? '99+' : tab.notificationCount}
              </span>
            )}

            {/* Close button */}
            <button
              className="tab-close-button"
              onClick={(e) => handleCloseTab(e, tab.id)}
              title="Close tab"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Overflow button */}
      {showOverflow && (
        <div className="tab-bar-overflow" ref={overflowMenuRef}>
          <button
            className={`tab-bar-overflow-button ${overflowMenuOpen ? 'open' : ''}`}
            onClick={toggleOverflowMenu}
            title="Show all tabs"
          >
            ▼
          </button>

          {/* Overflow dropdown menu */}
          {overflowMenuOpen && (
            <div className="tab-bar-overflow-menu">
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`overflow-menu-item ${
                    tab.id === activeTabId ? 'active' : ''
                  } ${tab.hasNotification ? 'has-notification' : ''}`}
                  onClick={() => handleOverflowTabSelect(tab.id)}
                >
                  <span className="overflow-menu-icon">$</span>
                  <span className="overflow-menu-title">{tab.title}</span>
                  {tab.hasNotification && tab.notificationCount > 0 && (
                    <span className="overflow-menu-badge">
                      {tab.notificationCount > 99 ? '99+' : tab.notificationCount}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Browser tab button */}
      <button
        className="tab-bar-browser-button"
        onClick={onCreateBrowserTab}
        title="New browser tab"
        type="button"
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
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      </button>

      {/* New tab button */}
      <button
        className="tab-bar-new-button"
        onClick={handleCreateTab}
        title="New tab"
        type="button"
      >
        +
      </button>

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div
            className="context-menu-backdrop"
            onClick={() => setContextMenu(null)}
          />
          <div
            ref={contextMenuRef}
            className="context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <div
              className="context-menu-item"
              onClick={handleSplitHorizontal}
            >
              Split Horizontal
            </div>
            <div
              className="context-menu-item"
              onClick={handleSplitVertical}
            >
              Split Vertical
            </div>
            <div className="context-menu-separator" />
            <div
              className="context-menu-item"
              onClick={handleCreateTabRight}
            >
              New Tab Right
            </div>
            <div
              className="context-menu-item context-menu-item-danger"
              onClick={handleCloseTabContext}
            >
              Close Tab
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default TabBar;
