import React from 'react';
import { PanelDefinition, SidebarTab } from '../state/types';
import { Button } from './ui/Button';
import { Tooltip } from './ui/Tooltip';
import { TabsRoot, TabsList, TabsTab, TabsIndicator } from './ui/Tabs';
import './TabHeaderPanel.css';

interface TabHeaderPanelProps {
  panels: PanelDefinition[];
  activeTab: SidebarTab | string;
  isCollapsed: boolean;
  onTabClick: (tab: SidebarTab | string) => void;
  onToggleSidebar: () => void;
}

export const TabHeaderPanel: React.FC<TabHeaderPanelProps> = ({
  panels,
  activeTab,
  isCollapsed,
  onTabClick,
  onToggleSidebar,
}) => {
  const handleTabClick = (tab: SidebarTab | string) => {
    const panel = panels.find((p) => p.id === tab);

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
            <Tooltip content="Expand sidebar">
              <Button
                variant="ghost"
                size="sm"
                className="collapse-button"
                onClick={onToggleSidebar}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m13 17 5-5-5-5" />
                  <path d="m6 17 5-5-5-5" />
                </svg>
              </Button>
            </Tooltip>
            <TabsRoot
              value={activeTab}
              onValueChange={(value) => handleTabClick(value as SidebarTab | string)}
              className="tab-headers-vertical-root"
            >
              <TabsList className="tab-headers-vertical">
                {panels.map((panel) => {
                  const badge = panel.badge ? panel.badge() : null;

                  return (
                    <Tooltip key={panel.id} content={panel.title}>
                      <TabsTab
                        value={panel.id}
                        className="tab-button-vertical"
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
            </TabsTab>
              </Tooltip>
            );
          })}
          <TabsIndicator className="tab-indicator-vertical" />
        </TabsList>
      </TabsRoot>
    </>
  ) : (
          <>
            <TabsRoot
              value={activeTab}
              onValueChange={(value) => handleTabClick(value as SidebarTab | string)}
              className="tab-headers-horizontal-root"
            >
              <TabsList className="tab-headers-horizontal">
                {panels.map((panel) => {
                  const badge = panel.badge ? panel.badge() : null;

                  return (
                    <Tooltip key={panel.id} content={panel.title}>
                      <TabsTab
                        value={panel.id}
                        className="tab-button"
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
            </TabsTab>
              </Tooltip>
            );
          })}
          <TabsIndicator className="tab-indicator" />
        </TabsList>
      </TabsRoot>
      <Tooltip content="Collapse sidebar">
              <Button
                variant="ghost"
                size="sm"
                className="collapse-button"
                onClick={onToggleSidebar}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m11 17-5-5 5-5" />
                  <path d="m18 17-5-5 5-5" />
                </svg>
              </Button>
            </Tooltip>
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
