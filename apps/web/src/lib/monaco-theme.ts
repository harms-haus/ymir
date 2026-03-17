import type { editor } from 'monaco-editor';

/**
 * Custom dark theme for Monaco Editor matching Ymir's design system.
 * Uses CSS variables from theme.css for consistency.
 */
export const ymirDarkTheme: editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    // Comments
    { token: 'comment', foreground: '6B7280', fontStyle: 'italic' },
    { token: 'comment.doc', foreground: '6B7280', fontStyle: 'italic' },
    
    // Keywords
    { token: 'keyword', foreground: 'C084FC' },
    { token: 'keyword.control', foreground: 'C084FC' },
    { token: 'keyword.operator', foreground: 'D1D5DB' },
    
    // Strings
    { token: 'string', foreground: '86EFAC' },
    { token: 'string.escape', foreground: '86EFAC' },
    { token: 'string.regex', foreground: 'FBBF24' },
    
    // Numbers and constants
    { token: 'number', foreground: 'FCA5A5' },
    { token: 'constant', foreground: 'FCA5A5' },
    { token: 'constant.numeric', foreground: 'FCA5A5' },
    
    // Types and classes
    { token: 'type', foreground: '93C5FD' },
    { token: 'class', foreground: '93C5FD' },
    { token: 'interface', foreground: '93C5FD' },
    
    // Functions
    { token: 'function', foreground: '93C5FD' },
    { token: 'function.declaration', foreground: '93C5FD' },
    { token: 'function.call', foreground: '93C5FD' },
    
    // Variables
    { token: 'variable', foreground: 'E5E7EB' },
    { token: 'variable.parameter', foreground: 'E5E7EB' },
    { token: 'variable.other', foreground: 'E5E7EB' },
    
    // Operators and punctuation
    { token: 'operator', foreground: 'D1D5DB' },
    { token: 'delimiter', foreground: 'D1D5DB' },
    { token: 'delimiter.bracket', foreground: 'D1D5DB' },
    
    // Tags (HTML/XML)
    { token: 'tag', foreground: 'FCA5A5' },
    { token: 'tag.id.jade', foreground: 'FCA5A5' },
    { token: 'tag.class.jade', foreground: 'FCA5A5' },
    
    // Attributes
    { token: 'attribute.name', foreground: 'FDBA74' },
    { token: 'attribute.value', foreground: '86EFAC' },
    
    // Markdown
    { token: 'markup.heading', foreground: '93C5FD', fontStyle: 'bold' },
    { token: 'markup.bold', foreground: 'E5E7EB', fontStyle: 'bold' },
    { token: 'markup.italic', foreground: 'E5E7EB', fontStyle: 'italic' },
    { token: 'markup.code', foreground: '86EFAC' },
    { token: 'markup.link', foreground: '60A5FA' },
    
    // JSON
    { token: 'string.key.json', foreground: 'FDBA74' },
    { token: 'string.value.json', foreground: '86EFAC' },
    
    // CSS
    { token: 'css.property', foreground: '93C5FD' },
    { token: 'css.value', foreground: '86EFAC' },
    { token: 'css.selector', foreground: 'FCA5A5' },
    { token: 'css.unit', foreground: 'FCA5A5' },
    
    // Diff
    { token: 'diff.inserted', foreground: '86EFAC' },
    { token: 'diff.deleted', foreground: 'FCA5A5' },
    { token: 'diff.changed', foreground: 'FBBF24' },
  ],
  colors: {
    // Editor background and foreground
    'editor.background': '#0F172A',
    'editor.foreground': '#E5E7EB',
    
    // Line numbers
    'editorLineNumber.foreground': '#6B7280',
    'editorLineNumber.activeForeground': '#9CA3AF',
    
    // Selection
    'editor.selectionBackground': '#374151',
    'editor.selectionHighlightBackground': '#1F2937',
    'editor.inactiveSelectionBackground': '#1F2937',
    
    // Current line highlight
    'editor.lineHighlightBackground': '#1E293B',
    'editor.lineHighlightBorder': '#1E293B',
    
    // Caret
    'editorCursor.foreground': '#60A5FA',
    
    // Whitespace
    'editorWhitespace.foreground': '#374151',
    
    // Indent guides
    'editorIndentGuide.background': '#374151',
    'editorIndentGuide.activeBackground': '#4B5563',
    
    // Bracket matching
    'editorBracketMatch.background': '#374151',
    'editorBracketMatch.border': '#60A5FA',
    
    // Overview ruler
    'editorOverviewRuler.border': '#1E293B',
    'editorOverviewRuler.findMatchForeground': '#FBBF24',
    'editorOverviewRuler.modifiedForeground': '#FBBF24',
    'editorOverviewRuler.addedForeground': '#86EFAC',
    'editorOverviewRuler.deletedForeground': '#FCA5A5',
    
    // Gutter
    'editorGutter.background': '#0F172A',
    'editorGutter.modifiedBackground': '#FBBF24',
    'editorGutter.addedBackground': '#86EFAC',
    'editorGutter.deletedBackground': '#FCA5A5',
    
    // Find matches
    'editor.findMatchBackground': '#FBBF24',
    'editor.findMatchHighlightBackground': '#FBBF2440',
    'editor.findRangeHighlightBackground': '#1F2937',
    
    // Suggest widget
    'editorSuggestWidget.background': '#1E293B',
    'editorSuggestWidget.border': '#374151',
    'editorSuggestWidget.foreground': '#E5E7EB',
    'editorSuggestWidget.highlightForeground': '#60A5FA',
    'editorSuggestWidget.selectedBackground': '#374151',
    
    // Hover widget
    'editorHoverWidget.background': '#1E293B',
    'editorHoverWidget.border': '#374151',
    
    // Peek view
    'peekView.border': '#60A5FA',
    'peekViewEditor.background': '#0F172A',
    'peekViewEditor.matchHighlightBackground': '#FBBF2440',
    'peekViewResult.background': '#1E293B',
    'peekViewResult.fileForeground': '#E5E7EB',
    'peekViewResult.lineForeground': '#9CA3AF',
    'peekViewResult.matchHighlightBackground': '#FBBF2440',
    'peekViewResult.selectionBackground': '#374151',
    'peekViewTitle.background': '#1E293B',
    'peekViewTitleLabel.foreground': '#E5E7EB',
    
    // Diff editor
    'diffEditor.insertedTextBackground': '#86EFAC20',
    'diffEditor.removedTextBackground': '#FCA5A520',
    'diffEditor.insertedLineBackground': '#86EFAC15',
    'diffEditor.removedLineBackground': '#FCA5A515',
    
    // Errors and warnings
    'editorError.foreground': '#FCA5A5',
    'editorError.background': '#FCA5A520',
    'editorWarning.foreground': '#FBBF24',
    'editorWarning.background': '#FBBF2420',
    'editorInfo.foreground': '#60A5FA',
    'editorInfo.background': '#60A5FA20',
    
    // Folding
    'editor.foldBackground': '#1E293B',
    
    // Word highlight
    'editor.wordHighlightBackground': '#374151',
    'editor.wordHighlightStrongBackground': '#4B5563',
    
    // Symbol highlight
    'editor.symbolHighlightBackground': '#FBBF2440',
  },
};

/**
 * Theme name constant
 */
export const YMIR_DARK_THEME_NAME = 'ymir-dark';

/**
 * Register the custom theme with Monaco editor
 */
export function registerYmirTheme(monacoInstance: typeof import('monaco-editor')): void {
  monacoInstance.editor.defineTheme(YMIR_DARK_THEME_NAME, ymirDarkTheme);
}
