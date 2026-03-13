import { useSyncExternalStore } from 'react';

interface RuntimeGitState {
  repoPaths: string[];
  error: string | null;
  changesByRepo: Record<string, number>;
}

type Listener = () => void;

const listeners = new Set<Listener>();

const state: RuntimeGitState = {
  repoPaths: [],
  error: null,
  changesByRepo: {},
};

function notify(): void {
  listeners.forEach((listener) => {
    listener();
  });
}

export function useRuntimeGitState<T>(selector: (snapshot: RuntimeGitState) => T): T {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => selector(state),
    () => selector(state),
  );
}

export function setRuntimeGitRepos(repoPaths: string[]): void {
  state.repoPaths = repoPaths;
  notify();
}

export function setRuntimeGitError(error: string | null): void {
  state.error = error;
  notify();
}

export function setRuntimeGitChanges(repoPath: string, count: number): void {
  state.changesByRepo[repoPath] = count;
  notify();
}

export function removeRuntimeGitRepo(repoPath: string): void {
  state.repoPaths = state.repoPaths.filter((path) => path !== repoPath);
  delete state.changesByRepo[repoPath];
  notify();
}

export function getRuntimeGitError(): string | null {
  return state.error;
}

export function getRuntimeGitChangesCount(): number {
  return Object.values(state.changesByRepo).reduce((sum, value) => sum + value, 0);
}
