import { useEffect, useState, useRef, useMemo } from 'react';
import { useStore } from '../store';
import { getWebSocketClient } from '../lib/ws';
import type { AgentStatus } from '../types/protocol';

export type StatusDotStatus = 'working' | 'waiting' | 'idle';

export interface AgentStatusInfo {
  status: StatusDotStatus;
  taskSummary?: string;
  lastActivity: number;
  agentType: string;
}

/**
 * React hook for tracking agent status for a specific worktree
 *
 * Subscribes to AgentStatusUpdate and AgentOutput messages from WebSocket
 * via Zustand store and derives per-worktree status information.
 *
 * Status mapping:
 * - AgentStatus 'working' → StatusDotStatus 'working'
 * - AgentStatus 'waiting' → StatusDotStatus 'waiting'
 * - AgentStatus 'idle' → StatusDotStatus 'idle'
 * - AgentStatus 'error' → StatusDotStatus 'idle' (with error state)
 *
 * @param worktreeId - The ID of the worktree to track agent status for
 * @returns Agent status info or null if no agent exists for the worktree
 */
export function useAgentStatus(worktreeId: string | null): AgentStatusInfo | null {
  const wsClient = useRef(getWebSocketClient()).current;
  const activeSession = useStore((state) =>
    worktreeId ? state.agentSessions.find((as) => as.worktreeId === worktreeId) || null : null
  );
  const [lastActivity, setLastActivity] = useState<number>(Date.now());

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!worktreeId || !activeSession) return;

    const unsubscribe = wsClient.onMessage('AgentStatusUpdate', (message) => {
      if (message.worktreeId === worktreeId) {
        setLastActivity(Date.now());
      }
    });

    return unsubscribe;
  }, [worktreeId, activeSession]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!worktreeId || !activeSession) return;

    const unsubscribe = wsClient.onMessage('AgentOutput', (message) => {
      if (message.worktreeId === worktreeId) {
        setLastActivity(Date.now());
      }
    });

    return unsubscribe;
  }, [worktreeId, activeSession]);

  if (!activeSession) {
    return null;
  }

  const status = mapAgentStatusToStatusDot(activeSession.status);

  return {
    status,
    lastActivity,
    agentType: activeSession.agentType,
  };
}

function mapAgentStatusToStatusDot(agentStatus: AgentStatus): StatusDotStatus {
  switch (agentStatus) {
    case 'working':
      return 'working';
    case 'waiting':
      return 'waiting';
    case 'idle':
    case 'error':
      return 'idle';
    default:
      return 'idle';
  }
}

export function useAgentList(worktreeId: string | null): import('../types/protocol').AgentSession[] {
  const allSessions = useStore((state) => state.agentSessions);
  return useMemo(
    () => (worktreeId ? allSessions.filter((as) => as.worktreeId === worktreeId) : []),
    [allSessions, worktreeId]
  );
}

export function useWorkspaceAgentStatusSummary(
  workspaceId: string,
  worktrees: import('../types/protocol').Worktree[]
): { working: number; waiting: number; idle: number } {
  const allSessions = useStore((state) => state.agentSessions);

  return useMemo(() => {
    const workspaceWorktrees = worktrees.filter((wt) => wt.workspaceId === workspaceId);
    const workspaceWorktreeIds = new Set(workspaceWorktrees.map((wt) => wt.id));
    const workspaceAgentSessions = allSessions.filter((as) => workspaceWorktreeIds.has(as.worktreeId));

    return workspaceAgentSessions.reduce(
      (acc, session) => {
        const status = mapAgentStatusToStatusDot(session.status);
        acc[status]++;
        return acc;
      },
      { working: 0, waiting: 0, idle: 0 }
    );
  }, [workspaceId, worktrees, allSessions]);
}
