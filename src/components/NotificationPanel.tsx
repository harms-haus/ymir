import { useTabsStore, Tab } from '../state/tabs';

interface NotificationItemProps {
  tab: Tab;
  onClick: () => void;
  onClear: (e: React.MouseEvent) => void;
}

function NotificationItem({ tab, onClick, onClear }: NotificationItemProps) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px',
        cursor: 'pointer',
        borderBottom: '1px solid #1e1e1e',
        backgroundColor: 'transparent',
        transition: 'background-color 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = '#2a2d2e';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#ffffff',
              marginBottom: '4px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.title}
          </div>
          <div
            style={{
              fontSize: '12px',
              color: '#4fc3f7',
              marginBottom: '4px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              lineHeight: '1.4',
            }}
          >
            {tab.notificationText || 'New notification'}
          </div>
          <div
            style={{
              fontSize: '11px',
              color: '#666666',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.cwd}
          </div>
        </div>
        <button
          onClick={onClear}
          style={{
            background: 'none',
            border: 'none',
            color: '#cccccc',
            cursor: 'pointer',
            fontSize: '12px',
            padding: '4px 8px',
            borderRadius: '3px',
            flexShrink: 0,
            opacity: 0.7,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#c75450';
            e.currentTarget.style.color = '#ffffff';
            e.currentTarget.style.opacity = '1';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#cccccc';
            e.currentTarget.style.opacity = '0.7';
          }}
          title="Clear notification"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationPanel({ isOpen, onClose }: NotificationPanelProps) {
  const { tabs, setActiveTab, clearNotification, clearAllNotifications } = useTabsStore();

  const notificationTabs = tabs.filter((tab) => tab.hasNotification);

  const handleItemClick = (tabId: string) => {
    setActiveTab(tabId);
    onClose();
  };

  const handleClear = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    clearNotification(tabId);
  };

  const handleClearAll = () => {
    clearAllNotifications();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          zIndex: 100,
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '350px',
          height: '100vh',
          backgroundColor: '#252526',
          borderLeft: '1px solid #1e1e1e',
          zIndex: 101,
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideIn 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid #1e1e1e',
            backgroundColor: '#2d2d30',
          }}
        >
          <span
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: '#ffffff',
            }}
          >
            Notifications
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#cccccc',
              cursor: 'pointer',
              fontSize: '18px',
              lineHeight: '1',
              padding: '4px 8px',
              borderRadius: '3px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#3c3c3c';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#cccccc';
            }}
            title="Close panel"
          >
            ×
          </button>
        </div>

        {/* Notification List */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
        >
          {notificationTabs.length === 0 ? (
            <div
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: '#666666',
                fontSize: '13px',
              }}
            >
              No notifications
            </div>
          ) : (
            notificationTabs.map((tab) => (
              <NotificationItem
                key={tab.id}
                tab={tab}
                onClick={() => handleItemClick(tab.id)}
                onClear={(e) => handleClear(e, tab.id)}
              />
            ))
          )}
        </div>

        {/* Footer with Clear All */}
        {notificationTabs.length > 0 && (
          <div
            style={{
              padding: '12px 16px',
              borderTop: '1px solid #1e1e1e',
              backgroundColor: '#2d2d30',
            }}
          >
            <button
              onClick={handleClearAll}
              style={{
                width: '100%',
                backgroundColor: '#37373d',
                border: '1px solid #1e1e1e',
                color: '#cccccc',
                cursor: 'pointer',
                fontSize: '12px',
                padding: '8px 12px',
                borderRadius: '3px',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#3c3c3c';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#37373d';
                e.currentTarget.style.color = '#cccccc';
              }}
            >
              Clear All
            </button>
          </div>
        )}
      </div>

      {/* Animation styles */}
      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  );
}
