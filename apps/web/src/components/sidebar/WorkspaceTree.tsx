import { useCallback, useMemo, useRef, useEffect, CSSProperties } from 'react'
import { List, ListImperativeAPI, RowComponentProps } from 'react-window'
import { StatusDot, StatusDotStatus } from './StatusDot'
import {
  useWorkspaceStore,
  Workspace,
  Worktree,
  selectWorkspaces,
  selectExpandedWorkspaceIds,
  selectActiveWorktreeId,
} from '../../store'

export type TreeNodeType = 'workspace' | 'worktree'

export interface TreeNode {
  id: string
  type: TreeNodeType
  depth: number
  data: Workspace | Worktree
  parentId?: string
}

interface RowData {
  nodes: TreeNode[]
  expandedIds: Set<string>
  activeWorktreeId: string | null
  onToggleWorkspace: (id: string) => void
  onSelectWorktree: (id: string) => void
  onNewWorktree: (workspaceId: string) => void
}

interface WorkspaceRowProps {
  workspace: Workspace
  isExpanded: boolean
  onToggle: () => void
  onNewWorktree: () => void
  style: CSSProperties
}

interface WorktreeRowProps {
  worktree: Worktree
  isSelected: boolean
  onSelect: () => void
  style: CSSProperties
}

function getWorkspaceStatusSummary(workspace: Workspace): {
  working: number
  waiting: number
  idle: number
} {
  return workspace.worktrees.reduce(
    (acc, wt) => {
      acc[wt.status]++
      return acc
    },
    { working: 0, waiting: 0, idle: 0 }
  )
}

function WorkspaceRow({
  workspace,
  isExpanded,
  onToggle,
  onNewWorktree,
  style,
}: WorkspaceRowProps) {
  const summary = getWorkspaceStatusSummary(workspace)
  const hasActive = summary.working > 0 || summary.waiting > 0

  return (
    <button
      type="button"
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        cursor: 'pointer',
        borderBottom: '1px solid hsl(var(--border))',
        backgroundColor: 'hsl(var(--panel-sidebar))',
        border: 'none',
        width: '100%',
        textAlign: 'left',
        fontFamily: 'inherit',
        fontSize: 'inherit',
      }}
      onClick={onToggle}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '20px',
          height: '20px',
          marginRight: '4px',
          transition: 'transform 0.2s ease',
          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
        }}
      >
        <i className="ri-arrow-right-s-line" style={{ fontSize: '16px' }} />
      </span>

      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '20px',
          height: '20px',
          marginRight: '8px',
        }}
      >
        <i className="ri-folder-3-line" style={{ fontSize: '16px', color: 'hsl(var(--primary))' }} />
      </span>

      <span
        style={{
          flex: 1,
          fontSize: '14px',
          fontWeight: 500,
          color: 'hsl(var(--foreground))',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {workspace.name}
      </span>

      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          marginLeft: '8px',
          fontSize: '11px',
          color: 'hsl(var(--muted-foreground))',
        }}
      >
        {summary.working > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <StatusDot status="working" size={6} />
            {summary.working}
          </span>
        )}
        {summary.waiting > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <StatusDot status="waiting" size={6} />
            {summary.waiting}
          </span>
        )}
        {!hasActive && summary.idle > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <StatusDot status="idle" size={6} />
            {summary.idle}
          </span>
        )}
      </span>

      {isExpanded && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onNewWorktree()
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '24px',
            height: '24px',
            marginLeft: '8px',
            padding: 0,
            background: 'none',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            color: 'hsl(var(--muted-foreground))',
          }}
          title="New Worktree"
        >
          <i className="ri-add-line" style={{ fontSize: '16px' }} />
        </button>
      )}
    </button>
  )
}

function WorktreeRow({
  worktree,
  isSelected,
  onSelect,
  style,
}: WorktreeRowProps) {
  return (
    <button
      type="button"
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px 0 44px',
        cursor: 'pointer',
        borderBottom: '1px solid hsl(var(--border))',
        backgroundColor: isSelected
          ? 'hsl(var(--accent))'
          : 'transparent',
        border: 'none',
        width: '100%',
        textAlign: 'left',
        fontFamily: 'inherit',
        fontSize: 'inherit',
      }}
      onClick={onSelect}
    >
      <span style={{ marginRight: '8px' }}>
        <StatusDot status={worktree.status as StatusDotStatus} size={8} />
      </span>

      <span
        style={{
          flex: 1,
          fontSize: '13px',
          color: isSelected
            ? 'hsl(var(--accent-foreground))'
            : 'hsl(var(--foreground))',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {worktree.branchName}
      </span>
    </button>
  )
}

function TreeRow({ index, style, data }: RowComponentProps<RowData>) {
  const node = data.nodes[index]

  if (!node) return null

  if (node.type === 'workspace') {
    const workspace = node.data as Workspace
    const isExpanded = data.expandedIds.has(workspace.id)

    return (
      <WorkspaceRow
        workspace={workspace}
        isExpanded={isExpanded}
        onToggle={() => data.onToggleWorkspace(workspace.id)}
        onNewWorktree={() => data.onNewWorktree(workspace.id)}
        style={style}
      />
    )
  }

  const worktree = node.data as Worktree
  const isSelected = data.activeWorktreeId === worktree.id

  return (
    <WorktreeRow
      worktree={worktree}
      isSelected={isSelected}
      onSelect={() => data.onSelectWorktree(worktree.id)}
      style={style}
    />
  )
}

const ROW_HEIGHT = 36

export interface WorkspaceTreeProps {
  height?: number
  width?: number | string
}

export function WorkspaceTree({ height = 400, width = '100%' }: WorkspaceTreeProps) {
  const listRef = useRef<ListImperativeAPI>(null)
  const workspaces = useWorkspaceStore(selectWorkspaces)
  const expandedIds = useWorkspaceStore(selectExpandedWorkspaceIds)
  const activeWorktreeId = useWorkspaceStore(selectActiveWorktreeId)
  const toggleWorkspaceExpanded = useWorkspaceStore(
    (state) => state.toggleWorkspaceExpanded
  )
  const setActiveWorktree = useWorkspaceStore(
    (state) => state.setActiveWorktree
  )

  const flattenedNodes = useMemo(() => {
    const nodes: TreeNode[] = []

    for (const workspace of workspaces) {
      nodes.push({
        id: workspace.id,
        type: 'workspace',
        depth: 0,
        data: workspace,
      })

      if (expandedIds.has(workspace.id)) {
        for (const worktree of workspace.worktrees) {
          nodes.push({
            id: worktree.id,
            type: 'worktree',
            depth: 1,
            data: worktree,
            parentId: workspace.id,
          })
        }
      }
    }

    return nodes
  }, [workspaces, expandedIds])

  const handleToggleWorkspace = useCallback(
    (id: string) => {
      toggleWorkspaceExpanded(id)
    },
    [toggleWorkspaceExpanded]
  )

  const handleSelectWorktree = useCallback(
    (id: string) => {
      setActiveWorktree(id)
    },
    [setActiveWorktree]
  )

  const handleNewWorktree = useCallback((workspaceId: string) => {
    console.log('New worktree for workspace:', workspaceId)
  }, [])

  const prevNodeCountRef = useRef(flattenedNodes.length)

  useEffect(() => {
    if (listRef.current && flattenedNodes.length !== prevNodeCountRef.current) {
      prevNodeCountRef.current = flattenedNodes.length
    }
  }, [flattenedNodes.length])

  if (workspaces.length === 0) {
    return null
  }

  const rowData: RowData = {
    nodes: flattenedNodes,
    expandedIds,
    activeWorktreeId,
    onToggleWorkspace: handleToggleWorkspace,
    onSelectWorktree: handleSelectWorktree,
    onNewWorktree: handleNewWorktree,
  }

  return (
    <List
      listRef={listRef}
      height={height}
      rowCount={flattenedNodes.length}
      rowHeight={ROW_HEIGHT}
      width={width}
      rowProps={rowData}
      rowComponent={TreeRow}
    />
  )
}
