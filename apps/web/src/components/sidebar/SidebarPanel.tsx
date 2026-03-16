import { useCallback, useState, useRef, useEffect } from 'react'
import { WorkspaceTree } from './WorkspaceTree'
import {
  useWorkspaceStore,
  selectWorkspaces,
  Workspace,
} from '../../store'

interface CreateWorkspaceModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (name: string, path: string) => void
}

function CreateWorkspaceModal({ isOpen, onClose, onCreate }: CreateWorkspaceModalProps) {
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen && nameInputRef.current) {
      nameInputRef.current.focus()
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim() && path.trim()) {
      onCreate(name.trim(), path.trim())
      setName('')
      setPath('')
      onClose()
    }
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={handleBackdropClick}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          onClose()
        }
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{
          backgroundColor: 'hsl(var(--card))',
          borderRadius: '8px',
          padding: '24px',
          width: '400px',
          maxWidth: '90vw',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        }}
      >
        <h3
          style={{
            margin: '0 0 16px 0',
            fontSize: '18px',
            fontWeight: 600,
            color: 'hsl(var(--card-foreground))',
          }}
        >
          Create Workspace
        </h3>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor="workspace-name"
              style={{
                display: 'block',
                marginBottom: '4px',
                fontSize: '14px',
                color: 'hsl(var(--foreground))',
              }}
            >
              Name
            </label>
            <input
              id="workspace-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Workspace"
              ref={nameInputRef}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '4px',
                border: '1px solid hsl(var(--border))',
                backgroundColor: 'hsl(var(--input))',
                color: 'hsl(var(--foreground))',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label
              htmlFor="workspace-path"
              style={{
                display: 'block',
                marginBottom: '4px',
                fontSize: '14px',
                color: 'hsl(var(--foreground))',
              }}
            >
              Path
            </label>
            <input
              id="workspace-path"
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/path/to/workspace"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '4px',
                border: '1px solid hsl(var(--border))',
                backgroundColor: 'hsl(var(--input))',
                color: 'hsl(var(--foreground))',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: '4px',
                border: '1px solid hsl(var(--border))',
                backgroundColor: 'transparent',
                color: 'hsl(var(--foreground))',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: '8px 16px',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: 'hsl(var(--primary))',
                color: 'hsl(var(--primary-foreground))',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function SidebarPanel() {
  const workspaces = useWorkspaceStore(selectWorkspaces)
  const addWorkspace = useWorkspaceStore((state) => state.addWorkspace)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleCreateWorkspace = useCallback(
    (name: string, path: string) => {
      const newWorkspace: Workspace = {
        id: `workspace-${Date.now()}`,
        name,
        path,
        worktrees: [],
      }
      addWorkspace(newWorkspace)
    },
    [addWorkspace]
  )

  const containerHeight = workspaces.length > 0 ? 400 : 200

  return (
    <div className="sidebar-container">
      <div className="panel-header">
        <h2>Workspaces</h2>
      </div>

      <div
        className="panel-content"
        style={{
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {workspaces.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '32px',
              textAlign: 'center',
            }}
          >
            <i
              className="ri-folder-3-line"
              style={{
                fontSize: '48px',
                color: 'hsl(var(--muted-foreground))',
                marginBottom: '16px',
              }}
            />
            <p
              style={{
                color: 'hsl(var(--muted-foreground))',
                fontSize: '14px',
                margin: '0 0 16px 0',
              }}
            >
              No workspaces
            </p>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              style={{
                padding: '8px 16px',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: 'hsl(var(--primary))',
                color: 'hsl(var(--primary-foreground))',
                cursor: 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <i className="ri-add-line" />
              Create Workspace
            </button>
          </div>
        ) : (
          <>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <WorkspaceTree height={containerHeight} width="100%" />
            </div>
            <div
              style={{
                padding: '12px',
                borderTop: '1px solid hsl(var(--border))',
                backgroundColor: 'hsl(var(--panel-sidebar))',
              }}
            >
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                style={{
                  width: '100%',
                  padding: '8px 16px',
                  borderRadius: '4px',
                  border: '1px solid hsl(var(--border))',
                  backgroundColor: 'transparent',
                  color: 'hsl(var(--foreground))',
                  cursor: 'pointer',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <i className="ri-add-line" />
                Create Workspace
              </button>
            </div>
          </>
        )}
      </div>

      <CreateWorkspaceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreateWorkspace}
      />
    </div>
  )
}
