import { useTabsStore, Tab } from '../state/tabs';

interface TabItemProps {
  tab: Tab;
  isActive: boolean;
  onClick: () => void;
  onClose: (e: React.MouseEvent) => void;
}

function TabItem({ tab, isActive, onClick, onClose }: TabItemProps) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        cursor: 'pointer',
        backgroundColor: isActive ? '#37373d' : 'transparent',
        borderLeft: isActive ? '2px solid #007acc' : '2px solid transparent',
        transition: 'background-color 0.15s ease',
        fontSize: '13px',
        color: isActive ? '#ffffff' : '#cccccc',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = '#2a2d2e';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
        <span style={{ fontSize: '12px' }}>$</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {tab.title}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {tab.hasNotification && tab.notificationCount > 0 && (
          <span
            style={{
              backgroundColor: '#007acc',
              color: '#ffffff',
              fontSize: '10px',
              padding: '2px 5px',
              borderRadius: '8px',
              minWidth: '16px',
              textAlign: 'center',
            }}
          >
            {tab.notificationCount > 99 ? '99+' : tab.notificationCount}
          </span>
        )}
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#cccccc',
            cursor: 'pointer',
            fontSize: '14px',
            lineHeight: '1',
            padding: '2px 4px',
            borderRadius: '3px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
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
          title="Close tab"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export function Sidebar() {
  const { tabs, activeTabId, addTab, closeTab, setActiveTab } = useTabsStore();

  const handleAddTab = async () => {
    await addTab();
  };

  const handleCloseTab = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await closeTab(id);
  };

  return (
    <div
      style={{
        width: '250px',
        minWidth: '250px',
        height: '100%',
        backgroundColor: '#252526',
        borderRight: '1px solid #1e1e1e',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          borderBottom: '1px solid #1e1e1e',
          backgroundColor: '#2d2d30',
        }}
      >
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: '#bbbbbb',
          }}
        >
          Tabs
        </span>
        <button
          onClick={handleAddTab}
          style={{
            background: 'none',
            border: 'none',
            color: '#cccccc',
            cursor: 'pointer',
            fontSize: '18px',
            lineHeight: '1',
            padding: '2px 6px',
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
          title="New tab"
        >
          +
        </button>
      </div>

      {/* Tab List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {tabs.length === 0 ? (
          <div
            style={{
              padding: '20px 12px',
              textAlign: 'center',
              color: '#666666',
              fontSize: '12px',
            }}
          >
            No tabs open
          </div>
        ) : (
          tabs.map((tab) => (
            <TabItem
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              onClick={() => setActiveTab(tab.id)}
              onClose={(e) => handleCloseTab(e, tab.id)}
            />
          ))
        )}
      </div>

      {/* Footer with tab count */}
      <div
        style={{
          padding: '8px 12px',
          borderTop: '1px solid #1e1e1e',
          fontSize: '11px',
          color: '#666666',
          textAlign: 'center',
        }}
      >
        {tabs.length} {tabs.length === 1 ? 'tab' : 'tabs'}
      </div>
    </div>
  );
}
