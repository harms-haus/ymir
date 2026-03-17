import { useEffect, useRef, useState, useCallback } from 'react';
import Editor, { OnMount, EditorProps } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { getWebSocketClient } from '../../lib/ws';
import { FileRead, FileWrite, FileContentMessage } from '../../types/protocol';
import { useToast } from '../../hooks/useToast';
import { detectLanguage, isFileTooLarge } from '../../lib/language-detect';
import { YMIR_DARK_THEME_NAME, registerYmirTheme } from '../../lib/monaco-theme';
import { configureMonaco } from '../../lib/monaco';

interface EditorTabProps {
  filePath: string;
  worktreeId: string;
  sessionId: string;
}

interface FileState {
  content: string;
  isLoading: boolean;
  isReadOnly: boolean;
  error: string | null;
  fileSize: number;
}

const MAX_FILE_SIZE_MB = 5;
const SAVE_DEBOUNCE_MS = 1000;

export function EditorTab({ filePath, worktreeId, sessionId: _sessionId }: EditorTabProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewStateRef = useRef<editor.ICodeEditorViewState | null>(null);
  const { error: showError } = useToast();
  
  const [fileState, setFileState] = useState<FileState>({
    content: '',
    isLoading: true,
    isReadOnly: false,
    error: null,
    fileSize: 0,
  });
  
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [language, setLanguage] = useState(() => detectLanguage(filePath));

  // Configure Monaco on mount
  useEffect(() => {
    configureMonaco();
  }, []);

  // Load file content on mount or when filePath/worktreeId changes
  useEffect(() => {
    const wsClient = getWebSocketClient();
    
    setFileState(prev => ({ ...prev, isLoading: true, error: null }));
    setHasUnsavedChanges(false);
    setLanguage(detectLanguage(filePath));
    
    // Send FileRead message
    const message: FileRead = {
      type: 'FileRead',
      worktreeId,
      path: filePath,
    };
    wsClient.send(message);
    
    // Listen for FileContent response
    const unsubscribe = wsClient.onMessage('FileContent', (msg: FileContentMessage) => {
    if (msg.worktreeId === worktreeId && msg.path === filePath) {
      const contentBytes = new Blob([msg.content]).size;
      const isTooLarge = isFileTooLarge(contentBytes, MAX_FILE_SIZE_MB);
        
        if (isTooLarge) {
          showError(
            'File too large',
            `File "${filePath}" is too large (max ${MAX_FILE_SIZE_MB}MB). Opening in read-only mode.`,
            5000
          );
        }
        
        setFileState({
          content: msg.content,
          isLoading: false,
          isReadOnly: isTooLarge,
          error: null,
          fileSize: contentBytes,
        });
        
        // Restore view state if available
        if (editorRef.current && viewStateRef.current) {
          editorRef.current.restoreViewState(viewStateRef.current);
        }
      }
    });
    
    return () => {
      unsubscribe();
      // Save view state before unmounting
      if (editorRef.current) {
        viewStateRef.current = editorRef.current.saveViewState();
      }
    };
  }, [filePath, worktreeId, showError]);

  // Handle editor mount
  const handleEditorMount: OnMount = useCallback((editorInstance, monacoInstance) => {
    editorRef.current = editorInstance;
    monacoRef.current = monacoInstance;
    
    // Register custom theme
    registerYmirTheme(monacoInstance);
    monacoInstance.editor.setTheme(YMIR_DARK_THEME_NAME);
    
    // Restore view state if available
    if (viewStateRef.current) {
      editorInstance.restoreViewState(viewStateRef.current);
    }
    
    // Focus editor
    editorInstance.focus();
  }, []);

  // Handle content changes with debounced save
  const handleEditorChange = useCallback((value: string | undefined) => {
    if (!value || fileState.isReadOnly) return;
    
    setHasUnsavedChanges(true);
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Set new timeout for auto-save
    saveTimeoutRef.current = setTimeout(() => {
      const wsClient = getWebSocketClient();
      const message: FileWrite = {
        type: 'FileWrite',
        worktreeId,
        path: filePath,
        content: value,
        encoding: 'utf8',
      };
      wsClient.send(message);
      setHasUnsavedChanges(false);
    }, SAVE_DEBOUNCE_MS);
  }, [filePath, worktreeId, fileState.isReadOnly]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Editor options
  const editorOptions: EditorProps['options'] = {
    readOnly: fileState.isReadOnly,
    minimap: { enabled: false },
    fontFamily: 'var(--font-mono)',
    fontSize: 13,
    lineNumbers: 'on',
    roundedSelection: false,
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 2,
    insertSpaces: true,
    wordWrap: 'on',
    folding: true,
    foldingStrategy: 'auto',
    showFoldingControls: 'mouseover',
    matchBrackets: 'always',
    autoIndent: 'full',
    formatOnPaste: true,
    formatOnType: false,
    quickSuggestions: true,
    suggestOnTriggerCharacters: true,
    acceptSuggestionOnEnter: 'on',
    snippetSuggestions: 'inline',
    wordBasedSuggestions: 'currentDocument',
    parameterHints: { enabled: true },
    hover: { enabled: true },
    links: true,
    contextmenu: true,
    mouseWheelZoom: true,
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    renderWhitespace: 'selection',
    renderLineHighlight: 'line',
    renderLineHighlightOnlyWhenFocus: true,
    selectionHighlight: true,
    bracketPairColorization: { enabled: true },
    guides: {
      bracketPairs: true,
      indentation: true,
    },
  };

  if (fileState.isLoading) {
    return (
      <div className="editor-loading" data-testid="editor-loading">
        <div className="editor-loading-spinner" />
        <span>Loading {filePath}...</span>
      </div>
    );
  }

  if (fileState.error) {
    return (
      <div className="editor-error" data-testid="editor-error">
        <span className="editor-error-icon">⚠</span>
        <span>{fileState.error}</span>
      </div>
    );
  }

  return (
    <div className="editor-container" data-testid="editor-container">
      <div className="editor-header">
        <span className="editor-filename">{filePath.split('/').pop()}</span>
        <span className="editor-path">{filePath}</span>
        {hasUnsavedChanges && (
          <span className="editor-unsaved-indicator" title="Unsaved changes">
            ●
          </span>
        )}
        {fileState.isReadOnly && (
          <span className="editor-readonly-badge">Read-only</span>
        )}
      </div>
      <div className="editor-wrapper">
        <Editor
          height="100%"
          language={language}
          value={fileState.content}
          theme={YMIR_DARK_THEME_NAME}
          options={editorOptions}
          onMount={handleEditorMount}
          onChange={handleEditorChange}
          loading={
            <div className="editor-loading">
              <div className="editor-loading-spinner" />
            </div>
          }
        />
      </div>
    </div>
  );
}
