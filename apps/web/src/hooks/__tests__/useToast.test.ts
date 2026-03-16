import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useToast } from '../useToast';
import { useToastStore } from '../../store';

describe('useToast', () => {
  beforeEach(() => {
    useToastStore.setState({ notifications: [] });
  });

  it('provides error method', () => {
    const { result } = renderHook(() => useToast());
    
    expect(result.current.error).toBeInstanceOf(Function);
  });

  it('provides success method', () => {
    const { result } = renderHook(() => useToast());
    
    expect(result.current.success).toBeInstanceOf(Function);
  });

  it('provides info method', () => {
    const { result } = renderHook(() => useToast());
    
    expect(result.current.info).toBeInstanceOf(Function);
  });

  it('adds error toast to store', () => {
    const { result } = renderHook(() => useToast());
    
    act(() => {
      result.current.error('Something went wrong');
    });
    
    const notifications = useToastStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      variant: 'error',
      title: 'Something went wrong'
    });
  });

  it('adds success toast to store', () => {
    const { result } = renderHook(() => useToast());
    
    act(() => {
      result.current.success('Operation completed');
    });
    
    const notifications = useToastStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      variant: 'success',
      title: 'Operation completed'
    });
  });

  it('adds info toast to store', () => {
    const { result } = renderHook(() => useToast());
    
    act(() => {
      result.current.info('New message');
    });
    
    const notifications = useToastStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      variant: 'info',
      title: 'New message'
    });
  });

  it('adds toast with description', () => {
    const { result } = renderHook(() => useToast());
    
    act(() => {
      result.current.error('Error', 'Detailed description');
    });
    
    const notifications = useToastStore.getState().notifications;
    expect(notifications[0]).toMatchObject({
      variant: 'error',
      title: 'Error',
      description: 'Detailed description'
    });
  });

  it('adds toast with custom duration', () => {
    const { result } = renderHook(() => useToast());
    
    act(() => {
      result.current.error('Error', undefined, 10000);
    });
    
    const notifications = useToastStore.getState().notifications;
    expect(notifications[0]).toMatchObject({
      variant: 'error',
      title: 'Error',
      duration: 10000
    });
  });

  it('adds multiple toasts', () => {
    const { result } = renderHook(() => useToast());
    
    act(() => {
      result.current.error('Error 1');
      result.current.success('Success 1');
      result.current.info('Info 1');
    });
    
    const notifications = useToastStore.getState().notifications;
    expect(notifications).toHaveLength(3);
    expect(notifications[0]).toMatchObject({ variant: 'error', title: 'Error 1' });
    expect(notifications[1]).toMatchObject({ variant: 'success', title: 'Success 1' });
    expect(notifications[2]).toMatchObject({ variant: 'info', title: 'Info 1' });
  });

  it('assigns unique IDs to toasts', () => {
    const { result } = renderHook(() => useToast());
    
    act(() => {
      result.current.error('Error 1');
      result.current.error('Error 2');
    });
    
    const notifications = useToastStore.getState().notifications;
    expect(notifications[0].id).not.toBe(notifications[1].id);
  });
});
