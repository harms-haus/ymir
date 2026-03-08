import React from 'react';
import './TabHeaderPanel.css';
import { PanelDefinition, SidebarTab } from '../state/types';

interface TabHeaderPanelProps {
  panels: PanelDefinition[];
  activeTab: SidebarTab;
  isCollapsed: boolean;
  onTabClick: (tab: SidebarTab) => void;
  onToggleSidebar: () => void;
}

export const TabHeaderPanel: React.FC<TabHeaderPanelProps> = ({
  panels,
  activeTab,
  isCollapsed,
  onTabClick,
  onToggleSidebar,
}) => {
  const handleTabClick = (tab: SidebarTab) => {
    const panel = panels.find((p) => p.id === tab);

    // Auto-expand sidebar if clicking a tab with no collapsedRender while collapsed
    if (isCollapsed && panel && !panel.collapsedRender) {
      onToggleSidebar();
    }

    onTabClick(tab);
  };

  const handleDoubleClick = (_e: React.MouseEvent) => {
    // Toggle sidebar on double-click
    onToggleSidebar();
  };

  const activePanel = panels.find((p) => p.id === activeTab);
  const panelContent = activePanel ? (
    isCollapsed && activePanel.collapsedRender
      ? activePanel.collapsedRender()
      : isCollapsed && !activePanel.collapsedRender
        ? null
        : activePanel.fullRender()
  ) : null;

  return (
    <div className={`tab-header-panel ${isCollapsed ? 'collapsed' : ''}`} onDoubleClick={handleDoubleClick}>
      <div className="tab-header">
        {isCollapsed ? (
          <>
            <button
              onClick={onToggleSidebar}
              className="collapse-button"
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m13 17 5-5-5-5M6 17l5-5-5-5" />
              </svg>
            </button>
            <div className="tab-headers-vertical">
              {panels.map((panel) => {
                const isActive = panel.id === activeTab;
                const badge = panel.badge ? panel.badge() : null;

                return (
                  <button
                    key={panel.id}
                    className={`tab-button-vertical ${isActive ? 'active' : ''}`}
                    onClick={() => handleTabClick(panel.id)}
                    title={panel.title}
                  >
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      {panel.icon()}
                      {badge && badge.count !== undefined && (
                        <span
                          className="tab-badge"
                          style={{
                            position: 'absolute',
                            top: '-6px',
                            right: '-6px',
                          }}
                        >
                          {badge.count > 99 ? '99+' : badge.count}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="tab-headers-horizontal">
              {panels.map((panel) => {
                const isActive = panel.id === activeTab;
                const badge = panel.badge ? panel.badge() : null;

                return (
                  <button
                    key={panel.id}
                    className={`tab-button ${isActive ? 'active' : ''}`}
                    onClick={() => handleTabClick(panel.id)}
                    title={panel.title}
                  >
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      {panel.icon()}
                      {badge && badge.count !== undefined && (
                        <span
                          className="tab-badge"
                          style={{
                            position: 'absolute',
                            top: '-6px',
                            right: '-6px',
                          }}
                        >
                          {badge.count > 99 ? '99+' : badge.count}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <button
              onClick={onToggleSidebar}
              className="collapse-button"
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m11 17-5-5 5-5" />
                <path d="m18 17-5-5 5-5" />
              </svg>
            </button>
          </>
        )}
      </div>
      {panelContent !== null && (
        <div className="tab-panel-content">
          {panelContent}
        </div>
      )}
    </div>
  );
};
