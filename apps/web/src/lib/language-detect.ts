/**
 * Language detection utilities for Monaco Editor.
 * Maps file extensions to Monaco language IDs.
 */

// Mapping of file extensions to Monaco language IDs
const EXTENSION_MAP: Record<string, string> = {
  // JavaScript/TypeScript
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  mjs: 'javascript',
  cjs: 'javascript',
  
  // Web
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  
  // Python
  py: 'python',
  pyw: 'python',
  pyi: 'python',
  pyc: 'python',
  pyd: 'python',
  pyx: 'python',
  pxd: 'python',
  
  // Rust
  rs: 'rust',
  
  // Go
  go: 'go',
  
  // Java
  java: 'java',
  class: 'java',
  jar: 'java',
  
  // Kotlin
  kt: 'kotlin',
  kts: 'kotlin',
  
  // C/C++
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  
  // C#
  cs: 'csharp',
  
  // Ruby
  rb: 'ruby',
  erb: 'ruby',
  
  // PHP
  php: 'php',
  phtml: 'php',
  
  // Swift
  swift: 'swift',
  
  // Shell
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  
  // PowerShell
  ps1: 'powershell',
  psd1: 'powershell',
  psm1: 'powershell',
  
  // SQL
  sql: 'sql',
  mysql: 'sql',
  pgsql: 'sql',
  
  // Markdown
  md: 'markdown',
  mdx: 'markdown',
  markdown: 'markdown',
  
  // YAML
  yml: 'yaml',
  yaml: 'yaml',
  
  // XML
  xml: 'xml',
  svg: 'xml',
  
  // Config files
  toml: 'toml',
  ini: 'ini',
  cfg: 'ini',
  conf: 'ini',
  env: 'ini',
  
  // Docker
  dockerfile: 'dockerfile',
  dockerignore: 'ignore',
  
  // Git
  gitignore: 'ignore',
  gitattributes: 'ignore',
  
  // GraphQL
  graphql: 'graphql',
  gql: 'graphql',
  
  // Vue
  vue: 'vue',
  
  // Svelte
  svelte: 'svelte',
  
  // Lua
  lua: 'lua',
  
  // Perl
  pl: 'perl',
  pm: 'perl',
  
  // R
  r: 'r',
  rmd: 'r',
  
  // Dart
  dart: 'dart',
  
  // Scala
  scala: 'scala',
  sc: 'scala',
  
  // Clojure
  clj: 'clojure',
  cljs: 'clojure',
  cljc: 'clojure',
  
  // Haskell
  hs: 'haskell',
  lhs: 'haskell',
  
  // Elixir
  ex: 'elixir',
  exs: 'elixir',
  
  // Erlang
  erl: 'erlang',
  
  // OCaml
  ml: 'ocaml',
  mli: 'ocaml',
  
  // F#
  fs: 'fsharp',
  fsx: 'fsharp',
  
  // Julia
  jl: 'julia',
  
  // Nim
  nim: 'nim',
  
  // Zig
  zig: 'zig',
  
  // V
  v: 'v',
  
  // Crystal
  cr: 'crystal',
  
  // Solidity
  sol: 'solidity',
  
  // Move
  move: 'move',
  
  // Cairo
  cairo: 'cairo',
  
  // Plain text
  txt: 'plaintext',
  text: 'plaintext',
  
  // Log files
  log: 'log',
  
  // Diff/Patch
  diff: 'diff',
  patch: 'diff',
};

// Special filename mappings (for files without extensions)
const FILENAME_MAP: Record<string, string> = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  'makefile.win': 'makefile',
  gemfile: 'ruby',
  rakefile: 'ruby',
  vagrantfile: 'ruby',
  jenkinsfile: 'groovy',
  jakefile: 'javascript',
  gulpfile: 'javascript',
  gruntfile: 'javascript',
  podfile: 'ruby',
  cartfile: 'ruby',
  berksfile: 'ruby',
  cheffile: 'ruby',
  capfile: 'ruby',
  thorfile: 'ruby',
  guardfile: 'ruby',
  procfile: 'yaml',
};

/**
 * Detect the Monaco language ID from a file path.
 * @param filePath - The file path to analyze
 * @returns The Monaco language ID, or 'plaintext' if unknown
 */
export function detectLanguage(filePath: string): string {
  if (!filePath) {
    return 'plaintext';
  }
  
  const normalizedPath = filePath.toLowerCase().trim();
  const filename = normalizedPath.split('/').pop() || normalizedPath;
  
  // Check for exact filename match first (e.g., Dockerfile, Makefile)
  if (FILENAME_MAP[filename]) {
    return FILENAME_MAP[filename];
  }
  
  // Extract extension
  const lastDotIndex = filename.lastIndexOf('.');
  if (lastDotIndex === -1 || lastDotIndex === 0) {
    // No extension or hidden file without extension
    return 'plaintext';
  }
  
  const extension = filename.slice(lastDotIndex + 1);
  return EXTENSION_MAP[extension] || 'plaintext';
}

/**
 * Check if a file is likely binary based on extension.
 * @param filePath - The file path to check
 * @returns True if the file is likely binary
 */
export function isBinaryFile(filePath: string): boolean {
  if (!filePath) {
    return false;
  }
  
  const binaryExtensions = new Set([
    // Images
    'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'svg', 'webp', 'avif',
    // Audio/Video
    'mp3', 'mp4', 'wav', 'ogg', 'webm', 'mov', 'avi', 'mkv',
    // Archives
    'zip', 'tar', 'gz', 'bz2', '7z', 'rar', 'xz',
    // Executables
    'exe', 'dll', 'so', 'dylib', 'bin', 'o', 'a',
    // Documents
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    // Fonts
    'ttf', 'otf', 'woff', 'woff2', 'eot',
    // Other
    'db', 'sqlite', 'sqlite3', 'lock',
  ]);
  
  const normalizedPath = filePath.toLowerCase().trim();
  const filename = normalizedPath.split('/').pop() || normalizedPath;
  const lastDotIndex = filename.lastIndexOf('.');
  
  if (lastDotIndex === -1) {
    return false;
  }
  
  const extension = filename.slice(lastDotIndex + 1);
  return binaryExtensions.has(extension);
}

/**
 * Format file size for display.
 * @param bytes - The size in bytes
 * @returns Formatted string (e.g., "5.2 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`;
}

/**
 * Check if file size exceeds the maximum allowed size.
 * @param bytes - The file size in bytes
 * @param maxSizeMB - Maximum size in MB (default: 5)
 * @returns True if file exceeds limit
 */
export function isFileTooLarge(bytes: number, maxSizeMB: number = 5): boolean {
  const maxBytes = maxSizeMB * 1024 * 1024;
  return bytes > maxBytes;
}

/**
 * Get a human-readable description of the file type.
 * @param filePath - The file path
 * @returns Description of the file type
 */
export function getFileTypeDescription(filePath: string): string {
  const language = detectLanguage(filePath);
  
  const descriptions: Record<string, string> = {
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    html: 'HTML',
    css: 'CSS',
    scss: 'SCSS',
    json: 'JSON',
    python: 'Python',
    rust: 'Rust',
    go: 'Go',
    java: 'Java',
    kotlin: 'Kotlin',
    cpp: 'C++',
    c: 'C',
    csharp: 'C#',
    ruby: 'Ruby',
    php: 'PHP',
    swift: 'Swift',
    shell: 'Shell Script',
    powershell: 'PowerShell',
    sql: 'SQL',
    markdown: 'Markdown',
    yaml: 'YAML',
    xml: 'XML',
    toml: 'TOML',
    ini: 'Configuration',
    dockerfile: 'Dockerfile',
    graphql: 'GraphQL',
    vue: 'Vue',
    svelte: 'Svelte',
    lua: 'Lua',
    perl: 'Perl',
    r: 'R',
    dart: 'Dart',
    scala: 'Scala',
    clojure: 'Clojure',
    haskell: 'Haskell',
    elixir: 'Elixir',
    erlang: 'Erlang',
    ocaml: 'OCaml',
    fsharp: 'F#',
    julia: 'Julia',
    nim: 'Nim',
    zig: 'Zig',
    v: 'V',
    crystal: 'Crystal',
    solidity: 'Solidity',
    plaintext: 'Plain Text',
  };
  
  return descriptions[language] || language.toUpperCase();
}
