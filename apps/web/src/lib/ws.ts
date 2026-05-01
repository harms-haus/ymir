// Generate a UUID v4 for request IDs
export function generateId(): string {
 if (typeof crypto !== 'undefined' && crypto.randomUUID) {
 return crypto.randomUUID();
 }
 // Fallback for environments without crypto.randomUUID
 return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
 const r = Math.random() * 16 | 0;
 const v = c === 'x' ? r : (r & 0x3 | 0x8);
 return v.toString(16);
 });
}

export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'reconnecting';

// Re-export from yws-transport for backward compatibility
// This allows existing imports to continue working during migration
export {
  getYmirWsTransport,
  getWebSocketClient,
  loadWorktreeDetails,
  resetYmirWsTransport,
  YmirWsTransport,
} from './yws-transport';

// Legacy alias: some test files import resetWebSocketClient
export { resetYmirWsTransport as resetWebSocketClient } from './yws-transport';
