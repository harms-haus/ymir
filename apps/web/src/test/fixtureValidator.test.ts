import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { encode } from '@msgpack/msgpack';
import { validateFixture, validateFixtures, ValidationResult } from './fixtureValidator';
import type { WorkspaceCreate, WorktreeCreate, AgentSpawn, TerminalCreate } from '../types/generated/protocol';
import { readFileSync } from 'fs';

describe('fixtureValidator', () => {
  const FIXTURE_DIR = 'test-fixtures-temp';

  it('should validate WorkspaceCreate.msgpack fixture', async () => {
    const fixturePath = '../../test-fixtures/WorkspaceCreate.msgpack';

    const result = await validateFixture(fixturePath);

    expect(result.valid).toBe(true);
    expect(result.messageType).toBe('WorkspaceCreate');
    expect(result.details).toBeDefined();

    const details = result.details as any;
    expect(details.version).toBe(1);
    expect(details.type).toBe('WorkspaceCreate');
    expect(details.data).toBeDefined();
    expect(Array.isArray(details.data)).toBe(true);

    expect(details.data[0]).toBe('test-workspace');
    expect(details.data[1]).toBe('/path/to/workspace');
    expect(details.data[2]).toBe('#ff0000');
    expect(details.data[3]).toBe('folder');
    expect(details.data[4]).toBe('.worktrees');
  });

  it('should validate WorkspaceRename.msgpack fixture', async () => {
    const fixturePath = '../../test-fixtures/WorkspaceRename.msgpack';

    const result = await validateFixture(fixturePath);

    if (!result.valid) {
      console.log('Validation failed:', result.error);
    }
    expect(result.valid).toBe(true);
    expect(result.messageType).toBe('WorkspaceRename');
    expect(result.details).toBeDefined();

    const details = result.details as any;
    expect(details.version).toBe(1);
    expect(details.type).toBe('WorkspaceRename');
    expect(details.data).toBeDefined();
    expect(Array.isArray(details.data)).toBe(true);
    expect(details.data).toHaveLength(2);
  });

describe('validateFixture', () => {
  it('should validate a WorkspaceCreate message', async () => {
    const message: WorkspaceCreate = {
      type: 'WorkspaceCreate',
      name: 'Test Workspace',
      rootPath: '/path/to/workspace',
      color: '#ff0000',
      icon: 'folder',
    };

    const encoded = encode(message);
    const fixturePath = `${FIXTURE_DIR}/workspace_create.msgpack`;
    writeFileSync(fixturePath, encoded);

    const result = await validateFixture(fixturePath);

    expect(result.valid).toBe(true);
    expect(result.messageType).toBe('WorkspaceCreate');
    expect(result.details).toEqual(message);
  });

  it('should validate a WorkspaceRename message', async () => {
    const message = {
      type: 'WorkspaceRename' as const,
      workspaceId: 'ws-123',
      newName: 'Renamed Workspace',
    };

    const encoded = encode(message);
    const fixturePath = `${FIXTURE_DIR}/workspace_rename.msgpack`;
    writeFileSync(fixturePath, encoded);

    const result = await validateFixture(fixturePath);

    expect(result.valid).toBe(true);
    expect(result.messageType).toBe('WorkspaceRename');
    expect(result.details).toEqual(message);
  });

  it('should validate a WorktreeCreate message', async () => {
      const message: WorktreeCreate = {
        type: 'WorktreeCreate',
        workspaceId: 'ws-123',
        branchName: 'feature/test-branch',
        agentType: 'default',
        requestId: 'req-123',
        useExistingBranch: false,
      };

      const encoded = encode(message);
      const fixturePath = `${FIXTURE_DIR}/worktree_create.msgpack`;
      writeFileSync(fixturePath, encoded);

      const result = await validateFixture(fixturePath);

      expect(result.valid).toBe(true);
      expect(result.messageType).toBe('WorktreeCreate');
      expect(result.details).toEqual(message);
    });

    it('should validate an AgentSpawn message', async () => {
      const message: AgentSpawn = {
        type: 'AgentSpawn',
        worktreeId: 'wt-123',
        agentType: 'coder',
      };

      const encoded = encode(message);
      const fixturePath = `${FIXTURE_DIR}/agent_spawn.msgpack`;
      writeFileSync(fixturePath, encoded);

      const result = await validateFixture(fixturePath);

      expect(result.valid).toBe(true);
      expect(result.messageType).toBe('AgentSpawn');
      expect(result.details).toEqual(message);
    });

    it('should validate a TerminalCreate message', async () => {
      const message: TerminalCreate = {
        type: 'TerminalCreate',
        worktreeId: 'wt-123',
        label: 'Test Terminal',
        shell: 'bash',
      };

      const encoded = encode(message);
      const fixturePath = `${FIXTURE_DIR}/terminal_create.msgpack`;
      writeFileSync(fixturePath, encoded);

      const result = await validateFixture(fixturePath);

      expect(result.valid).toBe(true);
      expect(result.messageType).toBe('TerminalCreate');
      expect(result.details).toEqual(message);
    });

    it('should handle missing files gracefully', async () => {
      const result = await validateFixture('/nonexistent/path/to/fixture.msgpack');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('File not found or not accessible');
    });

    it('should handle invalid MessagePack data', async () => {
      const invalidData = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF]);
      const fixturePath = `${FIXTURE_DIR}/invalid.msgpack`;
      writeFileSync(fixturePath, invalidData);

      const result = await validateFixture(fixturePath);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Failed to decode MessagePack');
    });

    it('should handle messages without type field', async () => {
      const messageWithoutType = { foo: 'bar', baz: 123 };
      const encoded = encode(messageWithoutType);
      const fixturePath = `${FIXTURE_DIR}/no_type.msgpack`;
      writeFileSync(fixturePath, encoded);

      const result = await validateFixture(fixturePath);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Message missing required "type" field');
    });

    it('should handle unknown message types', async () => {
      const message = { type: 'UnknownMessageType', data: 'test' };
      const encoded = encode(message);
      const fixturePath = `${FIXTURE_DIR}/unknown_type.msgpack`;
      writeFileSync(fixturePath, encoded);

      const result = await validateFixture(fixturePath);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unknown or invalid message type');
      expect(result.error).toContain('UnknownMessageType');
    });

    it('should accept other valid message types', async () => {
      const message = { type: 'WorkspaceDelete', workspaceId: 'ws-123' };
      const encoded = encode(message);
      const fixturePath = `${FIXTURE_DIR}/workspace_delete.msgpack`;
      writeFileSync(fixturePath, encoded);

      const result = await validateFixture(fixturePath);

      expect(result.valid).toBe(true);
      expect(result.messageType).toBe('WorkspaceDelete');
    });

    it('should handle complex nested structures', async () => {
      const message: WorkspaceCreate = {
        type: 'WorkspaceCreate',
        name: 'Complex Workspace',
        rootPath: '/complex/path',
        worktreeBaseDir: '/worktrees',
        settings: {
          theme: 'dark',
          autoSave: true,
          editor: {
            fontSize: 14,
            tabSize: 2,
          },
        },
      };

      const encoded = encode(message);
      const fixturePath = `${FIXTURE_DIR}/complex.msgpack`;
      writeFileSync(fixturePath, encoded);

      const result = await validateFixture(fixturePath);

      expect(result.valid).toBe(true);
      expect(result.messageType).toBe('WorkspaceCreate');
      expect(result.details).toEqual(message);
    });
  });

  describe('validateFixtures', () => {
    it('should validate multiple fixtures', async () => {
      const messages = [
        { type: 'WorkspaceCreate' as const, name: 'WS1', rootPath: '/path1' },
        { type: 'WorktreeCreate' as const, workspaceId: 'ws-1', branchName: 'main' },
        { type: 'AgentSpawn' as const, worktreeId: 'wt-1', agentType: 'default' },
      ];

      const paths = messages.map((msg, i) => {
        const encoded = encode(msg);
        const path = `${FIXTURE_DIR}/batch_${i}.msgpack`;
        writeFileSync(path, encoded);
        return path;
      });

      const results = await validateFixtures(paths);

      expect(results).toHaveLength(3);
      expect(results[0].valid).toBe(true);
      expect(results[0].messageType).toBe('WorkspaceCreate');
      expect(results[1].valid).toBe(true);
      expect(results[1].messageType).toBe('WorktreeCreate');
      expect(results[2].valid).toBe(true);
      expect(results[2].messageType).toBe('AgentSpawn');
    });

    it('should handle mix of valid and invalid fixtures', async () => {
      const validMessage = { type: 'WorkspaceCreate' as const, name: 'WS', rootPath: '/path' };
      const invalidMessage = { type: 'InvalidType' as const };

      const validPath = `${FIXTURE_DIR}/batch_valid.msgpack`;
      const invalidPath = `${FIXTURE_DIR}/batch_invalid.msgpack`;
      const missingPath = `${FIXTURE_DIR}/batch_missing.msgpack`;

      writeFileSync(validPath, encode(validMessage));
      writeFileSync(invalidPath, encode(invalidMessage));

      const results = await validateFixtures([validPath, invalidPath, missingPath]);

      expect(results).toHaveLength(3);
      expect(results[0].valid).toBe(true);
      expect(results[1].valid).toBe(false);
      expect(results[2].valid).toBe(false);
    });
  });

  describe('ValidationResult interface', () => {
    it('should return complete result on success', async () => {
      const message: WorkspaceCreate = {
        type: 'WorkspaceCreate',
        name: 'Test',
        rootPath: '/path',
      };

      const encoded = encode(message);
      const fixturePath = `${FIXTURE_DIR}/result_success.msgpack`;
      writeFileSync(fixturePath, encoded);

      const result = await validateFixture(fixturePath);

      expect('valid' in result).toBe(true);
      expect('messageType' in result).toBe(true);
      expect('details' in result).toBe(true);
      expect('error' in result).toBe(false);
    });

    it('should return complete result on failure', async () => {
      const result = await validateFixture('/nonexistent/path.msgpack');

      expect('valid' in result).toBe(true);
      expect('error' in result).toBe(true);
      expect('messageType' in result).toBe(false);
    });

    it('should include details on validation failure', async () => {
      const messageWithoutType = { foo: 'bar' };
      const encoded = encode(messageWithoutType);
      const fixturePath = `${FIXTURE_DIR}/result_fail_details.msgpack`;
      writeFileSync(fixturePath, encoded);

      const result = await validateFixture(fixturePath);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.details).toBeDefined();
      expect(result.details).toEqual(messageWithoutType);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty fixture files', async () => {
      const emptyData = Buffer.from([]);
      const fixturePath = `${FIXTURE_DIR}/empty.msgpack`;
      writeFileSync(fixturePath, emptyData);

      const result = await validateFixture(fixturePath);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Failed to decode MessagePack');
    });

    it('should handle non-object decoded data', async () => {
      const scalarData = encode('just a string');
      const fixturePath = `${FIXTURE_DIR}/scalar.msgpack`;
      writeFileSync(fixturePath, scalarData);

      const result = await validateFixture(fixturePath);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Decoded data is not an object');
    });

    it('should handle null decoded data', async () => {
      const nullData = encode(null);
      const fixturePath = `${FIXTURE_DIR}/null.msgpack`;
      writeFileSync(fixturePath, nullData);

      const result = await validateFixture(fixturePath);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Decoded data is not an object');
    });

    it('should handle array decoded data', async () => {
      const arrayData = encode([1, 2, 3]);
      const fixturePath = `${FIXTURE_DIR}/array.msgpack`;
      writeFileSync(fixturePath, arrayData);

      const result = await validateFixture(fixturePath);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Decoded data is not an object');
    });
  });
});
