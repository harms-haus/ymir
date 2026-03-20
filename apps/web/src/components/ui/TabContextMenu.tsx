import { ContextMenu, ContextMenuProps, ContextMenuItem } from './ContextMenu'

export interface TabContextMenuProps extends Omit<ContextMenuProps, 'items'> {}

export function TabContextMenu(props: TabContextMenuProps) {
  const items: ContextMenuItem[] = [
    { id: 'rename', label: 'Rename', icon: 'ri-edit-line' },
    { id: 'close', label: 'Close', icon: 'ri-close-line' },
    { id: 'close-right', label: 'Close tabs to the right', icon: 'ri-arrow-right-line' },
    { id: 'close-left', label: 'Close tabs to the left', icon: 'ri-arrow-left-line' },
    { id: 'close-others', label: 'Close other tabs', icon: 'ri-subtract-line' },
  ]

  return <ContextMenu {...props} items={items} />
}
