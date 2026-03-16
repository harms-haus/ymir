import { Panel, Group, Separator } from 'react-resizable-panels'

export function MainPanel() {
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
          <div className="panel-content">
            <p className="placeholder-text">Agent conversation will appear here</p>
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
          <div className="panel-content">
            <p className="placeholder-text">Terminal output will appear here</p>
          </div>
        </Panel>
      </Group>
    </div>
  )
}
