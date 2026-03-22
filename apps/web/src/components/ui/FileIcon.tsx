import 'devicon/devicon.min.css';

interface FileIconProps {
  name: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

// Map file extensions to devicon class names
const extensionToDevicon: Record<string, string> = {
  // JavaScript/TypeScript
  'ts': 'devicon-typescript-plain',
  'tsx': 'devicon-react-original',
  'js': 'devicon-javascript-plain',
  'jsx': 'devicon-react-original',
  'mjs': 'devicon-javascript-plain',
  'cjs': 'devicon-javascript-plain',

  // Python
  'py': 'devicon-python-plain',
  'pyi': 'devicon-python-plain',
  'ipynb': 'devicon-jupyter-plain',

  // Rust
  'rs': 'devicon-rust-plain',

  // Go
  'go': 'devicon-go-plain',

  // Ruby
  'rb': 'devicon-ruby-plain',

  // PHP
  'php': 'devicon-php-plain',

  // Java
  'java': 'devicon-java-plain',
  'kt': 'devicon-kotlin-plain',
  'scala': 'devicon-scala-plain',

  // C/C++/C#
  'c': 'devicon-c-plain',
  'h': 'devicon-c-plain',
  'cpp': 'devicon-cplusplus-plain',
  'hpp': 'devicon-cplusplus-plain',
  'cs': 'devicon-csharp-plain',

  // Swift
  'swift': 'devicon-swift-plain',

  // Dart
  'dart': 'devicon-dart-plain',

  // Web
  'html': 'devicon-html5-plain',
  'htm': 'devicon-html5-plain',
  'css': 'devicon-css3-plain',
  'scss': 'devicon-sass-original',
  'sass': 'devicon-sass-original',
  'less': 'devicon-less-plain-wordmark',

  // Frameworks
  'vue': 'devicon-vuejs-plain',
  'svelte': 'devicon-svelte-plain',
  'angular': 'devicon-angularjs-plain',

  // Config/Data
  'json': 'devicon-json-plain',
  'yaml': 'devicon-yaml-plain',
  'yml': 'devicon-yaml-plain',

  // Markdown
  'md': 'devicon-markdown-original',

  // Shell
  'sh': 'devicon-bash-plain',
  'bash': 'devicon-bash-plain',
  'zsh': 'devicon-bash-plain',
  'fish': 'devicon-bash-plain',
  'ps1': 'devicon-powershell-plain',

  // Database
  'sql': 'devicon-mysql-plain',
  'sqlite': 'devicon-sqlite-plain',
  'prisma': 'devicon-prisma-plain',

  // Docker/K8s
  'dockerfile': 'devicon-docker-plain',
  'dockerignore': 'devicon-docker-plain',

  // Git
  'gitignore': 'devicon-git-plain',
  'gitattributes': 'devicon-git-plain',

  // Package managers
  'lock': 'devicon-npm-original-wordmark',

  // Images
  'svg': 'devicon-svg-plain',
};

// Map specific filenames to devicon class names
const filenameToDevicon: Record<string, string> = {
  'package.json': 'devicon-npm-original-wordmark',
  'package-lock.json': 'devicon-npm-original-wordmark',
  'cargo.toml': 'devicon-rust-plain',
  'cargo.lock': 'devicon-rust-plain',
  'dockerfile': 'devicon-docker-plain',
  'docker-compose.yml': 'devicon-docker-plain',
  'docker-compose.yaml': 'devicon-docker-plain',
  'readme.md': 'devicon-markdown-original',
  'readme': 'devicon-markdown-original',
  'license': 'devicon-license-plain',
  'license.txt': 'devicon-license-plain',
  'license.md': 'devicon-license-plain',
  'makefile': 'devicon-makefile-plain',
  'gemfile': 'devicon-ruby-plain',
  'rakefile': 'devicon-ruby-plain',
  'gemfile.lock': 'devicon-ruby-plain',
  'composer.json': 'devicon-php-plain',
  'composer.lock': 'devicon-php-plain',
  'tsconfig.json': 'devicon-typescript-plain',
  'jsconfig.json': 'devicon-javascript-plain',
  'vite.config.ts': 'devicon-vitejs-plain',
  'vite.config.js': 'devicon-vitejs-plain',
  'webpack.config.js': 'devicon-webpack-plain',
  'webpack.config.ts': 'devicon-webpack-plain',
  '.gitignore': 'devicon-git-plain',
  '.gitattributes': 'devicon-git-plain',
  '.eslintrc': 'devicon-eslint-plain',
  '.eslintrc.json': 'devicon-eslint-plain',
  '.prettierrc': 'devicon-prettier-plain',
  'tailwind.config.js': 'devicon-tailwindcss-plain',
  'tailwind.config.ts': 'devicon-tailwindcss-plain',
};

export function FileIcon({ name, size = 16, className = '', style }: FileIconProps) {
  const filename = name.toLowerCase();
  const ext = filename.split('.').pop() || '';

  const deviconClass = filenameToDevicon[filename] || extensionToDevicon[ext];

  if (deviconClass) {
    return (
      <i
        className={`${deviconClass} ${className}`}
        style={{ fontSize: size, lineHeight: 1, ...style }}
      />
    );
  }

  return (
    <i
      className={`ri-file-line ${className}`}
      style={{ fontSize: size, lineHeight: 1, ...style }}
    />
  );
}

// Get folder icon - now just returns null since we don't show folder icons
export function FolderIcon() {
  return null;
}
