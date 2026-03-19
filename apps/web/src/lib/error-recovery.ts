import {
  Error as ServerError,
  PtyCrashError,
  GitFailureError,
  AgentCrashError,
  DbError,
  ErrorCodes,
  isPtyCrashError,
  isGitFailureError,
  isAgentCrashError,
  isDbError,
} from '../types/generated/protocol';
import { getWebSocketClient } from './ws';
import { useToastStore, useStore } from '../store';
import { showNotification } from './tauri';

export interface ErrorRecoveryContext {
  sessionId?: string;
  worktreeId?: string;
  agentType?: string;
  agentName?: string;
}

export interface DbResetRequest {
  type: 'DbReset';
}

export function handlePtyCrash(error: PtyCrashError, context?: ErrorRecoveryContext): void {
 const toastStore = useToastStore.getState();

 const worktreeId = error.worktreeId || context?.worktreeId;

 if (worktreeId) {
 toastStore.addNotification({
 variant: 'error',
 title: 'Terminal Session Crashed',
 description: 'Restarting terminal session...',
 duration: 4000,
 });
 } else {
 toastStore.addNotification({
 variant: 'error',
 title: 'Terminal Session Crashed',
 description: 'Terminal session lost — manual restart required',
 duration: 4000,
 });
 console.warn('Terminal crash detected but no worktreeId available for recovery', { error, context });
 }

 if (worktreeId) {
 const client = getWebSocketClient();
 client.send({
 type: 'TerminalCreate',
 worktreeId,
 label: 'Terminal',
 });
 }
}

export function handleGitFailure(error: GitFailureError, _context?: ErrorRecoveryContext): void {
  const toastStore = useToastStore.getState();
  
  let description = error.message;
  if (error.conflictFiles && error.conflictFiles.length > 0) {
    const fileList = error.conflictFiles.slice(0, 3).join(', ');
    const more = error.conflictFiles.length > 3 ? ` and ${error.conflictFiles.length - 3} more` : '';
    description = `Conflict in: ${fileList}${more}`;
  }

  toastStore.addNotification({
    variant: 'error',
    title: `Git ${error.operation} failed`,
    description,
    duration: 8000,
  });
}

export function handleAgentCrash(error: AgentCrashError, context?: ErrorRecoveryContext): void {
  const toastStore = useToastStore.getState();
  
  const agentName = context?.agentName || error.agentType || 'Agent';
  
  toastStore.addNotification({
    variant: 'error',
    title: `${agentName} Crashed`,
    description: 'You can restart the agent from the worktree context menu.',
    duration: 6000,
  });

  showNotification(`${agentName} Crashed`, 'You can restart the agent from the worktree context menu.');
}

export function handleDbError(error: DbError): void {
  const toastStore = useToastStore.getState();
  const store = useStore.getState();
  
  toastStore.addNotification({
    variant: 'error',
    title: 'Database Error',
    description: error.message,
    duration: 0,
  });

  store.setDbResetDialogOpen(true, error.message);
}

export function sendDbReset(): void {
  const client = getWebSocketClient();
  client.send({
    type: 'UpdateSettings',
    key: 'db_reset',
    value: 'true',
  });
}

export function handleError(error: ServerError, context?: ErrorRecoveryContext): void {
  if (isPtyCrashError(error)) {
    handlePtyCrash(error, context);
    return;
  }
  
  if (isGitFailureError(error)) {
    handleGitFailure(error, context);
    return;
  }
  
  if (isAgentCrashError(error)) {
    handleAgentCrash(error, context);
    return;
  }
  
  if (isDbError(error)) {
    handleDbError(error);
    return;
  }

  const toastStore = useToastStore.getState();
  toastStore.addNotification({
    variant: 'error',
    title: 'Error',
    description: error.message,
    duration: 5000,
  });
}

export { ErrorCodes };