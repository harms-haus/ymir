import { describe, it, expect, vi } from 'vitest';
import {
  mockInvoke,
  mockChannel,
  mockTauriStore,
} from './mocks';

describe('Mock Utilities', () => {
  describe('mockInvoke', () => {
    it('should create a mock invoke function', () => {
      const mockFn = mockInvoke();
      expect(typeof mockFn).toBe('function');
    });

    it('should return resolved value', async () => {
      const mockFn = mockInvoke('test-result');
      const result = await mockFn();
      expect(result).toBe('test-result');
    });

    it('should return undefined by default', async () => {
      const mockFn = mockInvoke();
      const result = await mockFn();
      expect(result).toBeUndefined();
    });

    it('should track calls', async () => {
      const mockFn = mockInvoke();
      await mockFn('arg1', 'arg2');
      expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('mockChannel', () => {
    it('should create a mock channel', () => {
      const Channel = mockChannel();
      const instance = Channel();
      expect(instance).toBeDefined();
    });

    it('should have onmessage property', () => {
      const Channel = mockChannel();
      const instance = Channel();
      expect(instance.onmessage).toBeNull();
    });

    it('should have post method', () => {
      const Channel = mockChannel();
      const instance = Channel();
      expect(typeof instance.post).toBe('function');
    });

    it('should have id property', () => {
      const Channel = mockChannel();
      const instance = Channel();
      expect(instance.id).toBeDefined();
      expect(typeof instance.id).toBe('string');
    });
  });

  describe('mockTauriStore', () => {
    it('should create a mock store', () => {
      const Store = mockTauriStore();
      const instance = Store();
      expect(instance).toBeDefined();
    });

    it('should have get method', () => {
      const Store = mockTauriStore();
      const instance = Store();
      expect(typeof instance.get).toBe('function');
    });

    it('should have set method', () => {
      const Store = mockTauriStore();
      const instance = Store();
      expect(typeof instance.set).toBe('function');
    });

    it('should have has method', () => {
      const Store = mockTauriStore();
      const instance = Store();
      expect(typeof instance.has).toBe('function');
    });

    it('should have delete method', () => {
      const Store = mockTauriStore();
      const instance = Store();
      expect(typeof instance.delete).toBe('function');
    });

    it('should have clear method', () => {
      const Store = mockTauriStore();
      const instance = Store();
      expect(typeof instance.clear).toBe('function');
    });

    it('should have save method', () => {
      const Store = mockTauriStore();
      const instance = Store();
      expect(typeof instance.save).toBe('function');
    });

    it('should have entries method', () => {
      const Store = mockTauriStore();
      const instance = Store();
      expect(typeof instance.entries).toBe('function');
    });

    it('should have keys method', () => {
      const Store = mockTauriStore();
      const instance = Store();
      expect(typeof instance.keys).toBe('function');
    });

    it('should have values method', () => {
      const Store = mockTauriStore();
      const instance = Store();
      expect(typeof instance.values).toBe('function');
    });

    it('should have length method', () => {
      const Store = mockTauriStore();
      const instance = Store();
      expect(typeof instance.length).toBe('function');
    });

    it('should have reload method', () => {
      const Store = mockTauriStore();
      const instance = Store();
      expect(typeof instance.reload).toBe('function');
    });

    it('should set and get values', async () => {
      const Store = mockTauriStore();
      const instance = Store();

      await instance.set('key1', 'value1');
      const value = await instance.get('key1');

      expect(value).toBe('value1');
    });

    it('should return null for non-existent keys', async () => {
      const Store = mockTauriStore();
      const instance = Store();

      const value = await instance.get('nonexistent');
      expect(value).toBeNull();
    });

    it('should check if key exists', async () => {
      const Store = mockTauriStore();
      const instance = Store();

      await instance.set('key1', 'value1');
      const exists = await instance.has('key1');
      const notExists = await instance.has('key2');

      expect(exists).toBe(true);
      expect(notExists).toBe(false);
    });

    it('should delete keys', async () => {
      const Store = mockTauriStore();
      const instance = Store();

      await instance.set('key1', 'value1');
      await instance.delete('key1');
      const exists = await instance.has('key1');

      expect(exists).toBe(false);
    });

    it('should clear all keys', async () => {
      const Store = mockTauriStore();
      const instance = Store();

      await instance.set('key1', 'value1');
      await instance.set('key2', 'value2');
      await instance.clear();

      const hasKey1 = await instance.has('key1');
      const hasKey2 = await instance.has('key2');

      expect(hasKey1).toBe(false);
      expect(hasKey2).toBe(false);
    });
  });
});
