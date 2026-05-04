import { describe, it, expect } from 'vitest';
import { encodePing, encodePong, encodeGetWorktreeDetails } from '../bridge-transport';

describe('bridge-transport encoding', () => {
  it('encodePing creates valid envelope', () => {
    const envelope = encodePing({ timestamp: 12345 });
    expect(envelope).toBeDefined();
    expect(envelope.type).toBe('ping');
    expect(JSON.stringify(envelope)).toContain('12345');
  });

  it('encodePong creates valid envelope', () => {
    const envelope = encodePong({ timestamp: 12345 });
    expect(envelope).toBeDefined();
    expect(envelope.type).toBe('pong');
    expect(JSON.stringify(envelope)).toContain('12345');
  });

  it('encodeGetWorktreeDetails creates valid envelope', () => {
    const envelope = encodeGetWorktreeDetails({ workspaceId: 'wt-1', requestId: 'req-1' });
    expect(envelope).toBeDefined();
    expect(envelope.type).toBe('worktree_event');
  });
});
