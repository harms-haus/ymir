import { Panel, Group, Separator } from 'react-resizable-panels'
import { SidebarPanel } from '../sidebar/SidebarPanel'
import { MainPanel } from '../main/MainPanel'
import { ProjectPanel } from '../project/ProjectPanel'
import { StatusBar } from './StatusBar'
import { useUIStore } from '../../uiStore'
import '../../styles/panels.css'

export function AppShell() {
  const sidebarPanelSize = useUIStore((state) => state.sidebarPanelSize)
  const mainPanelSize = useUIStore((state) => state.mainPanelSize)
  const projectPanelSize = useUIStore((state) => state.projectPanelSize)
  const setPanelSizes = useUIStore((state) => state.setPanelSizes)

  const handleLayout = (layout: { [id: string]: number }) => {
    const sidebar = layout['sidebar']
    const main = layout['main']
    const project = layout['project']
    if (sidebar !== undefined && main !== undefined && project !== undefined) {
      setPanelSizes({
        sidebarPanelSize: sidebar * 100,
        mainPanelSize: main * 100,
        projectPanelSize: project * 100,
      })
    }
  }

  return (
    <div className="root">
      <Group orientation="horizontal" className="app-shell" onLayoutChanged={handleLayout}>
        <Panel
          id="sidebar"
          defaultSize={sidebarPanelSize}
          minSize={200}
          className="panel sidebar-panel"
        >
          <SidebarPanel />
        </Panel>

        <Separator id="sidebar-main" className="panel-handle" />

        <Panel
          id="main"
          defaultSize={mainPanelSize}
          minSize={300}
          className="panel main-panel"
        >
          <MainPanel />
        </Panel>

        <Separator id="main-project" className="panel-handle" />

        <Panel
          id="project"
          defaultSize={projectPanelSize}
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
