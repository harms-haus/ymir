import { Panel, Group, Separator } from 'react-resizable-panels'
import { SidebarPanel } from '../sidebar/SidebarPanel'
import { MainPanel } from '../main/MainPanel'
import { ProjectPanel } from '../project/ProjectPanel'
import { StatusBar } from './StatusBar'
import '../../styles/panels.css'

export function AppShell() {
  return (
    <div className="root">
      <Group orientation="horizontal" className="app-shell">
        <Panel
          id="sidebar"
          defaultSize={20}
          minSize={200}
          className="panel sidebar-panel"
        >
          <SidebarPanel />
        </Panel>

        <Separator id="sidebar-main" className="panel-handle" />

        <Panel
          id="main"
          defaultSize={50}
          minSize={300}
          className="panel main-panel"
        >
          <MainPanel />
        </Panel>

        <Separator id="main-project" className="panel-handle" />

        <Panel
          id="project"
          defaultSize={30}
          minSize={200}
          className="panel project-panel"
        >
          <ProjectPanel />
        </Panel>
      </Group>
      <StatusBar />
    </div>
  )
}
