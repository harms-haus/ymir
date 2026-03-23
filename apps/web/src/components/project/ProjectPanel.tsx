import { useState } from 'react';
import { Tabs } from '@base-ui/react/tabs';
import { useStore, selectActiveWorktree } from '../../store';
import { useUIStore } from '../../uiStore';
import { Toolbar } from './Toolbar';
import { ChangesTab } from './ChangesTab';
import { AllFilesTab } from './AllFilesTab';
import { CreatePRDialog } from '../dialogs/CreatePRDialog';
import { ToggleSwitch } from '../ui/ToggleSwitch';

export function ProjectPanel() {
  const activeWorktree = useStore(selectActiveWorktree);
  const [activeTab, setActiveTab] = useState<'changes' | 'all-files'>('changes');
  const [isPRDialogOpen, setIsPRDialogOpen] = useState(false);
  const changesViewMode = useUIStore((state) => state.changesViewMode);
  const setChangesViewMode = useUIStore((state) => state.setChangesViewMode);

  const canCreatePR = activeWorktree?.status === 'active';

  return (
    <div className="project-container" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Project</h2>
        <Toolbar
          onPRClick={() => setIsPRDialogOpen(true)}
          canCreatePR={canCreatePR}
        />
      </div>
      
      <Tabs.Root 
        value={activeTab} 
        onValueChange={(value) => setActiveTab(value as 'changes' | 'all-files')}
        style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
      >
<Tabs.List
      style={{
        display: 'flex',
        alignItems: 'center',
        borderBottom: '1px solid hsl(var(--border))',
        padding: '0 16px'
      }}
    >
      <Tabs.Tab
        value="changes"
        style={{
          padding: '8px 16px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          fontSize: '13px',
          color: activeTab === 'changes' ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
          borderBottom: activeTab === 'changes' ? '2px solid hsl(var(--primary))' : '2px solid transparent',
          marginBottom: '-1px'
        }}
      >
        Changes
      </Tabs.Tab>
      <Tabs.Tab
        value="all-files"
        style={{
          padding: '8px 16px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          fontSize: '13px',
          color: activeTab === 'all-files' ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
          borderBottom: activeTab === 'all-files' ? '2px solid hsl(var(--primary))' : '2px solid transparent',
          marginBottom: '-1px'
        }}
      >
        All Files
      </Tabs.Tab>
      {activeTab === 'changes' && (
        <div style={{ marginLeft: 'auto' }}>
          <ToggleSwitch
            value={changesViewMode}
            options={[
              { value: 'flat', icon: 'ri-list-check', title: 'Flat' },
              { value: 'grouped', icon: 'ri-folder-3-line', title: 'Grouped by folder' },
            ]}
            onChange={(value) => setChangesViewMode(value as 'flat' | 'grouped')}
          />
        </div>
      )}
    </Tabs.List>
        
        <div style={{ flex: 1, overflow: 'hidden' }}>
<Tabs.Panel value="changes" style={{ height: '100%' }}>
          <ChangesTab viewMode={changesViewMode} />
        </Tabs.Panel>
          <Tabs.Panel value="all-files" style={{ height: '100%' }}>
            <AllFilesTab />
          </Tabs.Panel>
        </div>
      </Tabs.Root>

      <CreatePRDialog open={isPRDialogOpen} onOpenChange={setIsPRDialogOpen} />
    </div>
  );
}
