'use client';

import { useEffect, useState, useRef } from 'react';

interface LogEntry {
  id: number;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  source: string | null;
  message: string;
  metadata_json: string;
}

const isDevelopment = () => {
  return typeof window !== 'undefined' && window.location.hostname === 'localhost';
};

export function ActivityLog() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [isDev, setIsDev] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsDev(isDevelopment());
  }, []);

  useEffect(() => {
    if (!isDev) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        setIsVisible((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDev]);

  useEffect(() => {
    if (!isVisible || !isDev) return;

    const fetchLogs = async () => {
      try {
        const response = await fetch('/api/activity-log?limit=100');
        if (response.ok) {
          const data = await response.json();
          setEntries(data.entries || []);
        }
      } catch {
        // Silently fail in dev mode
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, [isVisible, isDev]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, []);

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'text-red-400';
      case 'warn':
        return 'text-yellow-400';
      default:
        return 'text-green-400';
    }
  };

  if (!isDev || !isVisible) return null;

  return (
    <div className="fixed bottom-0 right-0 w-[600px] h-[400px] bg-gray-900 border border-gray-700 rounded-tl-lg shadow-2xl z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700 bg-gray-800 rounded-tl-lg">
        <h3 className="text-sm font-semibold text-gray-200">Activity Log (Ctrl+Shift+L)</h3>
        <button
          type="button"
          onClick={() => setIsVisible(false)}
          className="text-gray-400 hover:text-white transition-colors"
          aria-label="Close activity log"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div ref={containerRef} className="flex-1 overflow-y-auto p-2 font-mono text-xs">
        {entries.length === 0 ? (
          <div className="text-gray-500 text-center py-4">No log entries</div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="py-1 border-b border-gray-800 last:border-0">
              <div className="flex items-center gap-2">
                <span className="text-gray-500">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                <span className={`uppercase font-bold ${getLevelColor(entry.level)}`}>{entry.level}</span>
                {entry.source && <span className="text-blue-400">[{entry.source}]</span>}
              </div>
              <div className="text-gray-300 mt-1">{entry.message}</div>
            </div>
          ))
        )}
      </div>
      <div className="px-4 py-1 border-t border-gray-700 bg-gray-800 text-gray-500 text-xs">
        {entries.length} entries
      </div>
    </div>
  );
}

export default ActivityLog;