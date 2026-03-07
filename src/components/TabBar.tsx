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
}

export function TabBar({
  paneId,
  tabs,
  activeTabId,
  onCreateTab,
  onCloseTab,
  onSelectTab,
}: TabBarProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showOverflow, setShowOverflow] = useState(false);
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
  const overflowMenuRef = useRef<HTMLDivElement>(null);

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

  // Close overflow menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        overflowMenuRef.current &&
        !overflowMenuRef.current.contains(event.target as Node)
      ) {
        setOverflowMenuOpen(false);
      }
    };

    if (overflowMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [overflowMenuOpen]);

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

      {/* New tab button */}
      <button
        className="tab-bar-new-button"
        onClick={handleCreateTab}
        title="New tab"
      >
        +
      </button>
    </div>
  );
}

export default TabBar;
