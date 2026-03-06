import { useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Terminal } from './Terminal';
import { NotificationPanel } from './NotificationPanel';
import { useTabsStore } from '../state/tabs';

export function Layout() {
  const { tabs, activeTabId, addTab, markNotification, panelOpen, togglePanel } = useTabsStore();

  // Keyboard shortcut: Ctrl+I / Cmd+I to toggle panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        togglePanel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePanel]);

  // Create initial tab if none exist
  useEffect(() => {
    if (tabs.length === 0) {
      addTab();
    }
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
      }}
    >
      <Sidebar />
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#1e1e1e',
          position: 'relative',
        }}
      >
        {tabs.map((tab) => (
          <div
            key={tab.id}
            style={{
              display: tab.id === activeTabId ? 'flex' : 'none',
              flex: 1,
              height: '100%',
              width: '100%',
            }}
          >
            <Terminal
              sessionId={tab.sessionId}
              onNotification={(message) => markNotification(tab.id, message)}
              hasNotification={tab.hasNotification}
            />
          </div>
        ))}
        {tabs.length === 0 && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#666666',
              fontSize: '14px',
            }}
          >
            No active terminal. Click + to create a new tab.
          </div>
        )}
      </div>
      <NotificationPanel isOpen={panelOpen} onClose={() => togglePanel()} />
    </div>
  );
}
