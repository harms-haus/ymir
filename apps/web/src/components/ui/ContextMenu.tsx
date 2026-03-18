import { ContextMenu as BaseContextMenu } from '@base-ui/react/context-menu'
import type { ContextMenuState, ContextMenuAction } from '../../hooks/useContextMenu'

export interface ContextMenuItem {
  id: ContextMenuAction
  label: string
  icon?: string
  destructive?: boolean
}

export interface ContextMenuProps {
  state: ContextMenuState
  items: ContextMenuItem[]
  onAction: (action: ContextMenuAction) => void
}

export function ContextMenu({ state, items, onAction }: ContextMenuProps) {
  const { isOpen, x, y, targetType } = state

  if (!isOpen) {
    return null
  }

  const visibleItems = items.filter((item) => {
    if (targetType === 'workspace') {
      return item.id === 'create-worktree' || item.id === 'settings'
    }
    if (targetType === 'worktree') {
      if (item.id === 'create-worktree' || item.id === 'settings') {
        return false
      }
      if (item.id === 'open-in-file-manager' || item.id === 'copy-path') {
        return state.targetPath !== null
      }
    }
    return true
  })

  if (visibleItems.length === 0) {
    return null
  }

  return (
    <BaseContextMenu.Root open={isOpen} onOpenChange={() => {}}>
      <BaseContextMenu.Portal>
        <BaseContextMenu.Positioner
          style={{
            position: 'fixed',
            left: `${x}px`,
            top: `${y}px`,
            zIndex: 9999,
          }}
        >
          <BaseContextMenu.Popup
            style={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '6px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              minWidth: '180px',
              padding: '4px 0',
            }}
          >
            {visibleItems.map((item) => (
              <BaseContextMenu.Item
                key={item.id}
                onClick={() => onAction(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 12px',
                  fontSize: '14px',
                  color: item.destructive
                    ? 'hsl(var(--destructive))'
                    : 'hsl(var(--foreground))',
                  cursor: 'pointer',
                  gap: '8px',
                  border: 'none',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                }}
                className="context-menu-item"
              >
                {item.icon && (
                  <i
                    className={item.icon}
                    style={{ fontSize: '16px', lineHeight: 1 }}
                  />
                )}
                <span>{item.label}</span>
              </BaseContextMenu.Item>
            ))}
          </BaseContextMenu.Popup>
        </BaseContextMenu.Positioner>
      </BaseContextMenu.Portal>
    </BaseContextMenu.Root>
  )
}
