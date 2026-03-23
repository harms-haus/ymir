import { Panel, Group, Separator } from 'react-resizable-panels'
import { useStore, selectActiveWorktree } from '../../store'
import { useUIStore } from '../../uiStore'
import { AgentPane } from '../agent/AgentPane'
import { TerminalPane } from '../terminal/TerminalPane'

export function MainPanel() {
  const activeWorktree = useStore(selectActiveWorktree)
  const agentPanelSize = useUIStore((state) => state.agentPanelSize)
  const terminalPanelSize = useUIStore((state) => state.terminalPanelSize)
  const setPanelSizes = useUIStore((state) => state.setPanelSizes)

  const handleLayout = (layout: { [id: string]: number }) => {
    const agent = layout['agent']
    const terminal = layout['terminal']
    if (agent !== undefined && terminal !== undefined) {
      setPanelSizes({
        agentPanelSize: agent * 100,
        terminalPanelSize: terminal * 100,
      })
    }
  }

  return (
    <div className="main-container">
      <Group orientation="vertical" className="main-panels" onLayoutChanged={handleLayout}>
        <Panel
          id="agent"
          defaultSize={agentPanelSize}
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
          defaultSize={terminalPanelSize}
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
