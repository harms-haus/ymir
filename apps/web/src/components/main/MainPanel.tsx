import { Panel, Group, Separator } from 'react-resizable-panels'
import { useStore, selectActiveWorktree } from '../../store'
import { AgentPane } from '../agent/AgentPane'
import { TerminalPane } from '../terminal/TerminalPane'

export function MainPanel() {
  const activeWorktree = useStore(selectActiveWorktree)

  return (
    <div className="main-container">
      <Group orientation="vertical" className="main-panels">
        <Panel
          id="agent"
          defaultSize={60}
          minSize={100}
          className="panel agent-panel"
        >
          <div className="panel-content h-full">
            {activeWorktree ? (
              <AgentPane worktreeId={activeWorktree.id} />
            ) : (
              <p className="placeholder-text">Select a worktree to view agent</p>
            )}
          </div>
        </Panel>

        <Separator id="agent-terminal" className="panel-handle-vertical" />

      <Panel
        id="terminal"
        defaultSize={40}
        minSize={100}
        className="panel terminal-panel"
      >
        <div className="panel-content terminal-panel-content">
          {activeWorktree ? (
            <TerminalPane worktreeId={activeWorktree.id} />
          ) : (
            <p className="placeholder-text">Select a worktree to view terminal</p>
          )}
        </div>
      </Panel>
      </Group>
    </div>
  )
}
