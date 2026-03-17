import { Panel, Group, Separator } from 'react-resizable-panels'
import { useStore, selectActiveWorktree, selectAgentSessionsByWorktreeId } from '../../store'
import { AgentPane } from '../agent/AgentPane'
import { TerminalPane } from '../terminal/TerminalPane'

export function MainPanel() {
  const activeWorktree = useStore(selectActiveWorktree)
  const agentSessions = useStore(selectAgentSessionsByWorktreeId(activeWorktree?.id || ''))
  const activeAgentSession = agentSessions[0]

  return (
    <div className="main-container">
      <Group orientation="vertical" className="main-panels">
        <Panel
          id="agent"
          defaultSize={60}
          minSize={100}
          className="panel agent-panel"
        >
          <div className="panel-header">
            <h2>Agent</h2>
          </div>
          <div className="panel-content h-full">
            {activeWorktree ? (
              <AgentPane
                worktreeId={activeWorktree.id}
                agentSession={activeAgentSession}
              />
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
          <div className="panel-header">
            <h2>Terminal</h2>
          </div>
          <div className="panel-content h-full">
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
