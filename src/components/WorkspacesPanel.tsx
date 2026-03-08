
import { PanelDefinition } from '../state/types';

export const workspacesPanelDefinition: PanelDefinition = {
  id: 'workspaces',
  title: 'Workspaces',
  icon: () => <div>WS</div>,
  badge: () => null,
  fullRender: () => <div>Workspaces</div>,
  collapsedRender: () => <div>1 2 3 4 5 6 7 8</div>,
};
