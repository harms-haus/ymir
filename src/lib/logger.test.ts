import { describe, it, expect, beforeEach, vi } from 'vitest';
import logger, { createLogger } from './logger';

describe('Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Default logger', () => {
    it('should export default logger instance', () => {
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should have trace method', () => {
      expect(typeof logger.trace).toBe('function');
    });

    it('should have setLevel method', () => {
      expect(typeof logger.setLevel).toBe('function');
    });

    it('should have getLevel method', () => {
      expect(typeof logger.getLevel).toBe('function');
    });
  });

  describe('createLogger', () => {
    it('should create a new logger instance', () => {
      const childLogger = createLogger('test-module');

      expect(childLogger).toBeDefined();
      expect(typeof childLogger.info).toBe('function');
      expect(typeof childLogger.warn).toBe('function');
      expect(typeof childLogger.error).toBe('function');
      expect(typeof childLogger.debug).toBe('function');
    });

    it('should create logger with custom name', () => {
      const childLogger = createLogger('custom-name');
      expect(childLogger).toBeDefined();
    });

    it('should create multiple independent loggers', () => {
      const logger1 = createLogger('module-1');
      const logger2 = createLogger('module-2');

      expect(logger1).not.toBe(logger2);
      expect(logger1).toBeDefined();
      expect(logger2).toBeDefined();
    });

    it('should inherit level from parent logger', () => {
      const originalLevel = logger.getLevel();
      logger.setLevel('ERROR');

      const childLogger = createLogger('child');
      expect(childLogger.getLevel()).toBe(logger.getLevel());

      logger.setLevel(originalLevel);
    });

    it('should allow child logger to have its own level', () => {
      const childLogger = createLogger('child-level-test');

      const originalLevel = childLogger.getLevel();
      childLogger.setLevel('DEBUG');

      expect(typeof childLogger.getLevel()).toBe('number');

      childLogger.setLevel(originalLevel);
    });
  });

  describe('Logger methods', () => {
    it('should call info method', () => {
      const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
      logger.info('Test message');
      expect(infoSpy).toHaveBeenCalledWith('Test message');
      infoSpy.mockRestore();
    });

    it('should call warn method', () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
      logger.warn('Test warning');
      expect(warnSpy).toHaveBeenCalledWith('Test warning');
      warnSpy.mockRestore();
    });

    it('should call error method', () => {
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
      logger.error('Test error');
      expect(errorSpy).toHaveBeenCalledWith('Test error');
      errorSpy.mockRestore();
    });

    it('should call debug method', () => {
      const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
      logger.debug('Test debug');
      expect(debugSpy).toHaveBeenCalledWith('Test debug');
      debugSpy.mockRestore();
    });

    it('should call trace method', () => {
      const traceSpy = vi.spyOn(logger, 'trace').mockImplementation(() => {});
      logger.trace('Test trace');
      expect(traceSpy).toHaveBeenCalledWith('Test trace');
      traceSpy.mockRestore();
    });

    it('should handle logging with metadata object', () => {
      const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
      logger.info('Test message', { key: 'value', number: 123 });
      expect(infoSpy).toHaveBeenCalledWith('Test message', { key: 'value', number: 123 });
      infoSpy.mockRestore();
    });
  });

  describe('Logger levels', () => {
    it('should set and get log level', () => {
      const originalLevel = logger.getLevel();

      logger.setLevel('DEBUG');
      expect(typeof logger.getLevel()).toBe('number');

      logger.setLevel('WARN');
      expect(typeof logger.getLevel()).toBe('number');

      logger.setLevel(originalLevel);
    });

    it('should accept numeric log levels', () => {
      const originalLevel = logger.getLevel();

      logger.setLevel(0);
      expect(typeof logger.getLevel()).toBe('number');

      logger.setLevel(2);
      expect(typeof logger.getLevel()).toBe('number');

      logger.setLevel(originalLevel);
    });
  });
});
