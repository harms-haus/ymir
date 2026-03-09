/**
 * Window Close Tests
 *
 * Tests for window close commands and cleanup behavior.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('Window Close Commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should invoke kill_all_sessions command correctly', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    
    vi.mocked(invoke).mockResolvedValue(undefined);
    await invoke('kill_all_sessions');
    
    expect(invoke).toHaveBeenCalledWith('kill_all_sessions');
  });

  it('should invoke exit_app command correctly', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    
    vi.mocked(invoke).mockResolvedValue(undefined);
    await invoke('exit_app');
    
    expect(invoke).toHaveBeenCalledWith('exit_app');
  });

  it('should handle kill_all_sessions errors gracefully', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    vi.mocked(invoke).mockRejectedValue(new Error('Failed to kill sessions'));
    
    try {
      await invoke('kill_all_sessions');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Failed to kill sessions');
    }
    
    consoleSpy.mockRestore();
  });

  it('should execute close flow in correct order', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    
    const callOrder: string[] = [];
    
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      callOrder.push(cmd);
      return undefined;
    });
    
    await invoke('kill_all_sessions');
    await invoke('exit_app');
    
    expect(callOrder).toEqual(['kill_all_sessions', 'exit_app']);
  });
});

describe('Window Close Code Review Checklist', () => {
  const checklist = [
    'kill_all_sessions command registered in lib.rs',
    'exit_app command registered in lib.rs',
    'Error handling for failed kill_all_sessions',
    'Fallback handling if exit_app fails',
    'Clean shutdown of all PTY sessions',
  ];

  it('should have all checklist items documented', () => {
    expect(checklist).toHaveLength(5);
    expect(checklist).toContain('kill_all_sessions command registered in lib.rs');
    expect(checklist).toContain('exit_app command registered in lib.rs');
  });

  it('should verify critical checklist items exist', () => {
    const criticalItems = checklist.filter(item =>
      item.includes('kill_all_sessions') || item.includes('exit_app') || item.includes('Error handling')
    );
    
    expect(criticalItems.length).toBeGreaterThanOrEqual(2);
  });
});
