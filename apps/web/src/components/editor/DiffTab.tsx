import { useState, useEffect, useCallback, useMemo } from 'react';
import ReactDiffViewer from 'react-diff-viewer-continued';
import { useWebSocketClient } from '../../hooks/useWebSocket';
import { GitDiff, GitDiffResult } from '../../types/generated/protocol';

interface DiffTabProps {
  filePath: string;
  worktreeId: string;
  sessionId?: string;
}

type ChangeType = 'added' | 'modified' | 'deleted' | 'renamed';

interface DiffData {
  oldContent: string;
  newContent: string;
  changeType: ChangeType;
  oldPath?: string;
}

/**
 * Detect language from file extension for syntax highlighting
 * Returns the language identifier for Prism.js
 */
function detectLanguage(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase();

  const languageMap: Record<string, string> = {
    // JavaScript/TypeScript
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    mjs: 'javascript',
    cjs: 'javascript',

    // Web
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',

    // Data
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    svg: 'svg',

    // Config
    toml: 'toml',
    ini: 'ini',
    conf: 'ini',
    cfg: 'ini',

    // Documentation
    md: 'markdown',
    mdx: 'markdown',
    rst: 'rst',

    // Shell
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    fish: 'fish',
    ps1: 'powershell',
    ps: 'powershell',

    // Python
    py: 'python',
    pyi: 'python',
    pyw: 'python',

    // Rust
    rs: 'rust',

    // Go
    go: 'go',

    // Java
    java: 'java',
    kt: 'kotlin',
    kts: 'kotlin',

    // C/C++
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    cxx: 'cpp',
    cc: 'cpp',
    hpp: 'cpp',

    // C#
    cs: 'csharp',

    // Ruby
    rb: 'ruby',
    erb: 'erb',

    // PHP
    php: 'php',

    // Swift
    swift: 'swift',

    // SQL
    sql: 'sql',

    // Docker
    dockerfile: 'docker',

    // GraphQL
    graphql: 'graphql',
    gql: 'graphql',
  };

  return languageMap[ext || ''];
}

/**
 * Get change type badge color
 */
function getChangeTypeColor(changeType: ChangeType): string {
  switch (changeType) {
    case 'added':
      return 'hsl(142 70% 45%)'; // Green
    case 'modified':
      return 'hsl(48 93% 47%)'; // Yellow
    case 'deleted':
      return 'hsl(0 62.8% 50%)'; // Red
    case 'renamed':
      return 'hsl(217.2 91.2% 59.8%)'; // Primary blue
    default:
      return 'hsl(215 20.2% 65.1%)'; // Muted
  }
}

/**
 * Get change type badge background color
 */
function getChangeTypeBgColor(changeType: ChangeType): string {
  switch (changeType) {
    case 'added':
      return 'hsl(142 70% 45% / 0.15)';
    case 'modified':
      return 'hsl(48 93% 47% / 0.15)';
    case 'deleted':
      return 'hsl(0 62.8% 50% / 0.15)';
    case 'renamed':
      return 'hsl(217.2 91.2% 59.8% / 0.15)';
    default:
      return 'hsl(215 20.2% 65.1% / 0.15)';
  }
}

/**
 * Get change type indicator letter
 */
function getChangeTypeLetter(changeType: ChangeType): string {
  switch (changeType) {
    case 'added':
      return 'A';
    case 'modified':
      return 'M';
    case 'deleted':
      return 'D';
    case 'renamed':
      return 'R';
    default:
      return '?';
  }
}

/**
 * Format change type for display
 */
function formatChangeType(changeType: ChangeType): string {
  switch (changeType) {
    case 'added':
      return 'Added';
    case 'modified':
      return 'Modified';
    case 'deleted':
      return 'Deleted';
    case 'renamed':
      return 'Renamed';
    default:
      return 'Unknown';
  }
}

/**
 * Extract old and new content from diff string
 */
function parseDiffContent(diff: string, _filePath: string): { 
  oldContent: string; 
  newContent: string;
  changeType: string;
  oldPath?: string;
} {
  const oldLines: string[] = [];
  const newLines: string[] = [];
  let changeType = 'modified';
  let oldPath: string | undefined;

  const lines = diff.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('---')) {
      oldPath = line.slice(4).trim();
      if (oldPath === '/dev/null') {
        changeType = 'added';
      }
    } else if (line.startsWith('+++')) {
      const newPath = line.slice(4).trim();
      if (newPath === '/dev/null') {
        changeType = 'deleted';
      }
    } else if (line.startsWith('-')) {
      oldLines.push(line.slice(1));
    } else if (line.startsWith('+')) {
      newLines.push(line.slice(1));
    } else if (line.startsWith(' ') || (!line.startsWith('-') && !line.startsWith('+') && !line.startsWith('@') && !line.startsWith('\\'))) {
      const content = line.startsWith(' ') ? line.slice(1) : line;
      if (content || line === ' ') {
        oldLines.push(content);
        newLines.push(content);
      }
    }
  }

  return {
    oldContent: oldLines.join('\n'),
    newContent: newLines.join('\n'),
    changeType,
    oldPath: oldPath === '/dev/null' ? undefined : oldPath,
  };
}

export function DiffTab({ filePath, worktreeId }: DiffTabProps) {
  const client = useWebSocketClient();
  const [diffData, setDiffData] = useState<DiffData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'split' | 'inline'>('split');

  useEffect(() => {
    setIsLoading(true);
    setError(null);

    const message: GitDiff = {
      type: 'GitDiff',
      worktreeId,
      filePath,
    };

    client.send(message);

    const unsubscribe = client.onMessage('GitDiffResult', (result: GitDiffResult) => {
      if (result.worktreeId !== worktreeId) return;
      if (result.filePath && result.filePath !== filePath) return;

      setIsLoading(false);

      if (!result.diff || result.diff.length === 0) {
        setError('No diff data available for this file');
        return;
      }

      // Parse the diff content
      const { oldContent, newContent, changeType, oldPath } = parseDiffContent(result.diff, filePath);

      setDiffData({
        oldContent,
        newContent,
        changeType: changeType as ChangeType,
        oldPath,
      });
    });

    const timeout = setTimeout(() => {
      setIsLoading((current) => {
        if (current) {
          setError('Request timed out');
          return false;
        }
        return current;
      });
    }, 10000);

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, [client, filePath, worktreeId]);

  // Detect language for syntax highlighting
  const language = useMemo(() => detectLanguage(filePath), [filePath]);

  // Custom styles for dark theme matching app
  const diffStyles = useMemo(
    () => ({
      variables: {
        dark: {
          // Background colors
          diffViewerBackground: 'hsl(222.2 84% 4.9%)',
          gutterBackground: 'hsl(217.2 32.6% 12%)',
          gutterBackgroundDark: 'hsl(217.2 32.6% 8%)',

          // Highlight colors (green for additions, red for deletions)
          addedBackground: 'hsl(142 70% 25% / 0.3)',
          addedGutterBackground: 'hsl(142 70% 35% / 0.4)',
          addedGutterColor: 'hsl(142 70% 65%)',

          removedBackground: 'hsl(0 62.8% 35% / 0.3)',
          removedGutterBackground: 'hsl(0 62.8% 45% / 0.4)',
          removedGutterColor: 'hsl(0 62.8% 75%)',

          // Word highlight
          wordAddedBackground: 'hsl(142 70% 35% / 0.5)',
          wordRemovedBackground: 'hsl(0 62.8% 45% / 0.5)',

          // Text colors
          gutterColor: 'hsl(215 20.2% 65.1%)',
          codeFoldGutterBackground: 'hsl(217.2 32.6% 17.5%)',
          codeFoldBackground: 'hsl(217.2 32.6% 12%)',

          // Empty block
          emptyLineBackground: 'hsl(222.2 84% 4.9%)',

          // Diff block labels
          diffViewerTitleBackground: 'hsl(217.2 32.6% 12%)',
          diffViewerTitleColor: 'hsl(210 40% 98%)',
        },
      },
      line: {
        padding: '4px 8px',
        fontFamily: 'var(--font-mono)',
        fontSize: '13px',
        lineHeight: '1.5',
      },
      gutter: {
        minWidth: '40px',
        padding: '4px 8px',
        fontFamily: 'var(--font-mono)',
        fontSize: '12px',
        textAlign: 'right' as const,
      },
      marker: {
        minWidth: '20px',
        padding: '4px 8px',
        fontFamily: 'var(--font-mono)',
        fontSize: '13px',
        fontWeight: 'bold',
      },
      content: {
        width: '100%',
      },
    }),
    []
  );

  const renderContent = useCallback((str: string) => {
    return <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{str}</span>;
  }, []);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <i className="ri-loader-4-line text-3xl mb-4 animate-spin" />
        <p>Loading diff...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-destructive">
        <i className="ri-error-warning-line text-3xl mb-4" />
        <p className="text-lg mb-2">Failed to load diff</p>
        <p className="text-sm opacity-70">{error}</p>
      </div>
    );
  }

  if (!diffData) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <i className="ri-git-diff-line text-3xl mb-4 opacity-50" />
        <p>No diff data available</p>
      </div>
    );
  }

  const changeTypeColor = getChangeTypeColor(diffData.changeType);
  const changeTypeBgColor = getChangeTypeBgColor(diffData.changeType);
  const changeTypeLetter = getChangeTypeLetter(diffData.changeType);
  const changeTypeLabel = formatChangeType(diffData.changeType);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header with file info and change type indicator */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          {/* Change type badge */}
          <span
            className="flex items-center justify-center w-6 h-6 rounded text-xs font-bold"
            style={{
              backgroundColor: changeTypeBgColor,
              color: changeTypeColor,
            }}
            title={changeTypeLabel}
          >
            {changeTypeLetter}
          </span>

          {/* File path */}
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">{filePath}</span>
            {diffData.oldPath && diffData.oldPath !== filePath && (
              <span className="text-xs text-muted-foreground line-through">
                {diffData.oldPath}
              </span>
            )}
          </div>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode('split')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors ${
              viewMode === 'split'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
            aria-pressed={viewMode === 'split'}
          >
            <i className="ri-layout-column-line" />
            <span>Split</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('inline')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded transition-colors ${
              viewMode === 'inline'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
            aria-pressed={viewMode === 'inline'}
          >
            <i className="ri-layout-row-line" />
            <span>Inline</span>
          </button>
        </div>
      </div>

      {/* Diff viewer */}
      <div className="flex-1 overflow-auto">
        <ReactDiffViewer
          oldValue={diffData.oldContent}
          newValue={diffData.newContent}
          splitView={viewMode === 'split'}
          showDiffOnly={false}
          styles={diffStyles}
          renderContent={renderContent}
          leftTitle={diffData.changeType === 'added' ? 'Empty' : 'Original'}
          rightTitle={diffData.changeType === 'deleted' ? 'Empty' : 'Modified'}
        />
      </div>

      {/* Footer with stats */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-muted/30 text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <i className="ri-file-code-line" />
            {language || 'Plain text'}
          </span>
          {diffData.oldPath && diffData.oldPath !== filePath && (
            <span className="flex items-center gap-1">
              <i className="ri-arrow-right-line" />
              Renamed from: {diffData.oldPath}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1" style={{ color: 'hsl(142 70% 45%)' }}>
            <i className="ri-add-line" />
            {diffData.newContent.split('\n').length} lines
          </span>
          <span className="flex items-center gap-1" style={{ color: 'hsl(0 62.8% 50%)' }}>
            <i className="ri-subtract-line" />
            {diffData.oldContent.split('\n').length} lines
          </span>
        </div>
      </div>
    </div>
  );
}
