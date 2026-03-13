import { useSyncExternalStore } from 'react';
import { Tab } from '../state/types';

interface NotificationEntry {
  tabId: string;
  paneId: string;
  workspaceId: string;
  title: string;
  cwd: string;
  count: number;
  text?: string;
}

type Listener = () => void;
type NotificationState = Record<string, NotificationEntry>;

const listeners = new Set<Listener>();
const notifications: NotificationState = {};

function notify(): void {
  listeners.forEach((listener) => {
    listener();
  });
}

function ensureEntry(
  workspaceId: string,
  paneId: string,
  tab: Pick<Tab, 'id' | 'title' | 'cwd'>,
): NotificationEntry {
  const existing = notifications[tab.id];
  if (existing) {
    existing.workspaceId = workspaceId;
    existing.paneId = paneId;
    existing.title = tab.title;
    existing.cwd = tab.cwd;
    return existing;
  }

  const next: NotificationEntry = {
    tabId: tab.id,
    paneId,
    workspaceId,
    title: tab.title,
    cwd: tab.cwd,
    count: 0,
  };
  notifications[tab.id] = next;
  return next;
}

export function subscribeRuntimeNotifications(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function markTabNotification(
  workspaceId: string,
  paneId: string,
  tab: Pick<Tab, 'id' | 'title' | 'cwd'>,
  message: string,
): void {
  const entry = ensureEntry(workspaceId, paneId, tab);
  entry.count += 1;
  entry.text = message;
  notify();
}

export function clearTabNotification(tabId: string): void {
  const entry = notifications[tabId];
  if (!entry || entry.count === 0) {
    return;
  }

  entry.count = 0;
  entry.text = undefined;
  notify();
}

export function clearAllNotifications(): void {
  let changed = false;
  Object.values(notifications).forEach((entry) => {
    if (entry.count > 0) {
      entry.count = 0;
      entry.text = undefined;
      changed = true;
    }
  });

  if (changed) {
    notify();
  }
}

export function syncPaneTabs(workspaceId: string, paneId: string, tabs: Tab[]): void {
  const activeTabIds = new Set(tabs.map((tab) => tab.id));
  let changed = false;

  tabs.forEach((tab) => {
    const existing = notifications[tab.id];
    if (!existing) {
      return;
    }

    if (
      existing.workspaceId !== workspaceId ||
      existing.paneId !== paneId ||
      existing.title !== tab.title ||
      existing.cwd !== tab.cwd
    ) {
      existing.workspaceId = workspaceId;
      existing.paneId = paneId;
      existing.title = tab.title;
      existing.cwd = tab.cwd;
      changed = true;
    }
  });

  Object.values(notifications).forEach((entry) => {
    if (entry.workspaceId !== workspaceId || entry.paneId !== paneId) {
      return;
    }

    if (activeTabIds.has(entry.tabId)) {
      return;
    }

    delete notifications[entry.tabId];
    changed = true;
  });

  if (changed) {
    notify();
  }
}

export function getTabNotification(tabId: string): { count: number; text?: string } {
  const entry = notifications[tabId];
  if (!entry) {
    return { count: 0 };
  }

  return { count: entry.count, text: entry.text };
}

export function getWorkspaceNotificationCount(workspaceId: string): number {
  return Object.values(notifications).filter(
    (entry) => entry.workspaceId === workspaceId && entry.count > 0,
  ).length;
}

export function getAllNotificationItems(): NotificationEntry[] {
  return Object.values(notifications)
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);
}

export function getTotalNotificationCount(): number {
  return Object.values(notifications).reduce(
    (sum, entry) => sum + (entry.count > 0 ? 1 : 0),
    0,
  );
}

export function useRuntimeNotifications<T>(selector: (snapshot: NotificationState) => T): T {
  return useSyncExternalStore(
    subscribeRuntimeNotifications,
    () => selector(notifications),
    () => selector(notifications),
  );
}
