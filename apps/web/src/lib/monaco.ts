import { loader } from '@monaco-editor/react';

let isInitialized = false;

export function configureMonaco(): void {
  if (isInitialized) {
    return;
  }

  window.MonacoEnvironment = {
    getWorker: async (_moduleId: string, label: string) => {
      const workerUrl = getWorkerUrl(label);
      return new Worker(workerUrl, { type: 'module' });
    },
  };

  loader.config({
    paths: {
      vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs',
    },
  });

  isInitialized = true;
}

function getWorkerUrl(label: string): string {
  const workers: Record<string, string> = {
    json: 'json.worker.js',
    css: 'css.worker.js',
    scss: 'css.worker.js',
    less: 'css.worker.js',
    html: 'html.worker.js',
    handlebars: 'html.worker.js',
    razor: 'html.worker.js',
    javascript: 'ts.worker.js',
    typescript: 'ts.worker.js',
    ts: 'ts.worker.js',
    js: 'ts.worker.js',
  };

  const workerName = workers[label] || 'editor.worker.js';
  return `https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/base/worker/${workerName}`;
}

export function isMonacoConfigured(): boolean {
  return isInitialized;
}

declare global {
  interface Window {
    MonacoEnvironment?: {
      getWorker: (_moduleId: string, label: string) => Promise<Worker>;
    };
  }
}
