import { describe, it, expect } from 'vitest';
import {
  detectLanguage,
  isBinaryFile,
  formatFileSize,
  isFileTooLarge,
  getFileTypeDescription,
} from '../language-detect';

describe('detectLanguage', () => {
  it('detects JavaScript files', () => {
    expect(detectLanguage('script.js')).toBe('javascript');
    expect(detectLanguage('component.jsx')).toBe('javascript');
    expect(detectLanguage('module.mjs')).toBe('javascript');
    expect(detectLanguage('config.cjs')).toBe('javascript');
  });

  it('detects TypeScript files', () => {
    expect(detectLanguage('script.ts')).toBe('typescript');
    expect(detectLanguage('component.tsx')).toBe('typescript');
  });

  it('detects HTML files', () => {
    expect(detectLanguage('index.html')).toBe('html');
    expect(detectLanguage('page.htm')).toBe('html');
  });

  it('detects CSS files', () => {
    expect(detectLanguage('styles.css')).toBe('css');
    expect(detectLanguage('theme.scss')).toBe('scss');
    expect(detectLanguage('vars.sass')).toBe('sass');
    expect(detectLanguage('main.less')).toBe('less');
  });

  it('detects JSON files', () => {
    expect(detectLanguage('config.json')).toBe('json');
    expect(detectLanguage('settings.jsonc')).toBe('json');
    expect(detectLanguage('data.json5')).toBe('json');
  });

  it('detects Python files', () => {
    expect(detectLanguage('script.py')).toBe('python');
    expect(detectLanguage('module.pyi')).toBe('python');
    expect(detectLanguage('ext.pyx')).toBe('python');
  });

  it('detects Rust files', () => {
    expect(detectLanguage('main.rs')).toBe('rust');
    expect(detectLanguage('lib.rs')).toBe('rust');
  });

  it('detects Go files', () => {
    expect(detectLanguage('main.go')).toBe('go');
  });

  it('detects Java files', () => {
    expect(detectLanguage('Main.java')).toBe('java');
  });

  it('detects C/C++ files', () => {
    expect(detectLanguage('main.c')).toBe('c');
    expect(detectLanguage('header.h')).toBe('c');
    expect(detectLanguage('main.cpp')).toBe('cpp');
    expect(detectLanguage('header.hpp')).toBe('cpp');
    expect(detectLanguage('impl.cc')).toBe('cpp');
    expect(detectLanguage('impl.cxx')).toBe('cpp');
  });

  it('detects C# files', () => {
    expect(detectLanguage('Program.cs')).toBe('csharp');
  });

  it('detects Ruby files', () => {
    expect(detectLanguage('script.rb')).toBe('ruby');
    expect(detectLanguage('view.erb')).toBe('ruby');
  });

  it('detects PHP files', () => {
    expect(detectLanguage('index.php')).toBe('php');
    expect(detectLanguage('template.phtml')).toBe('php');
  });

  it('detects Shell files', () => {
    expect(detectLanguage('script.sh')).toBe('shell');
    expect(detectLanguage('script.bash')).toBe('shell');
    expect(detectLanguage('script.zsh')).toBe('shell');
  });

  it('detects Markdown files', () => {
    expect(detectLanguage('README.md')).toBe('markdown');
    expect(detectLanguage('docs.mdx')).toBe('markdown');
  });

  it('detects YAML files', () => {
    expect(detectLanguage('config.yml')).toBe('yaml');
    expect(detectLanguage('config.yaml')).toBe('yaml');
  });

  it('detects XML files', () => {
    expect(detectLanguage('data.xml')).toBe('xml');
    expect(detectLanguage('icon.svg')).toBe('xml');
  });

  it('detects SQL files', () => {
    expect(detectLanguage('schema.sql')).toBe('sql');
  });

  it('detects special filenames', () => {
    expect(detectLanguage('Dockerfile')).toBe('dockerfile');
    expect(detectLanguage('Makefile')).toBe('makefile');
    expect(detectLanguage('Gemfile')).toBe('ruby');
    expect(detectLanguage('Rakefile')).toBe('ruby');
    expect(detectLanguage('Vagrantfile')).toBe('ruby');
    expect(detectLanguage('Jenkinsfile')).toBe('groovy');
    expect(detectLanguage('gulpfile.js')).toBe('javascript');
    expect(detectLanguage('Procfile')).toBe('yaml');
  });

  it('handles paths with directories', () => {
    expect(detectLanguage('src/components/App.tsx')).toBe('typescript');
    expect(detectLanguage('/home/user/project/main.py')).toBe('python');
  });

  it('returns plaintext for unknown extensions', () => {
    expect(detectLanguage('file.unknown')).toBe('plaintext');
    expect(detectLanguage('file.xyz')).toBe('plaintext');
  });

  it('returns plaintext for files without extensions', () => {
    expect(detectLanguage('Makefile')).toBe('makefile');
    expect(detectLanguage('README')).toBe('plaintext');
    expect(detectLanguage('.gitignore')).toBe('plaintext');
  });

  it('handles empty string', () => {
    expect(detectLanguage('')).toBe('plaintext');
  });

  it('is case insensitive', () => {
    expect(detectLanguage('SCRIPT.JS')).toBe('javascript');
    expect(detectLanguage('App.TSX')).toBe('typescript');
    expect(detectLanguage('README.MD')).toBe('markdown');
  });
});

describe('isBinaryFile', () => {
  it('detects image files as binary', () => {
    expect(isBinaryFile('photo.png')).toBe(true);
    expect(isBinaryFile('image.jpg')).toBe(true);
    expect(isBinaryFile('icon.ico')).toBe(true);
    expect(isBinaryFile('graphic.svg')).toBe(true);
  });

  it('detects archive files as binary', () => {
    expect(isBinaryFile('archive.zip')).toBe(true);
    expect(isBinaryFile('backup.tar.gz')).toBe(true);
    expect(isBinaryFile('data.7z')).toBe(true);
  });

  it('detects executable files as binary', () => {
    expect(isBinaryFile('app.exe')).toBe(true);
    expect(isBinaryFile('lib.dll')).toBe(true);
    expect(isBinaryFile('lib.so')).toBe(true);
  });

  it('detects document files as binary', () => {
    expect(isBinaryFile('report.pdf')).toBe(true);
    expect(isBinaryFile('data.xlsx')).toBe(true);
    expect(isBinaryFile('slides.pptx')).toBe(true);
  });

  it('detects font files as binary', () => {
    expect(isBinaryFile('font.ttf')).toBe(true);
    expect(isBinaryFile('font.woff2')).toBe(true);
  });

  it('returns false for text files', () => {
    expect(isBinaryFile('script.js')).toBe(false);
    expect(isBinaryFile('README.md')).toBe(false);
    expect(isBinaryFile('config.json')).toBe(false);
  });

  it('handles files without extensions', () => {
    expect(isBinaryFile('Makefile')).toBe(false);
    expect(isBinaryFile('README')).toBe(false);
  });
});

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(100)).toBe('100 B');
    expect(formatFileSize(512)).toBe('512 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(10240)).toBe('10 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1 MB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5 MB');
    expect(formatFileSize(5.5 * 1024 * 1024)).toBe('5.5 MB');
  });

  it('formats gigabytes', () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
    expect(formatFileSize(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
  });
});

describe('isFileTooLarge', () => {
  it('returns false for files under limit', () => {
    expect(isFileTooLarge(0)).toBe(false);
    expect(isFileTooLarge(1024)).toBe(false);
    expect(isFileTooLarge(5 * 1024 * 1024 - 1)).toBe(false);
    expect(isFileTooLarge(5 * 1024 * 1024)).toBe(false);
  });

  it('returns true for files over limit', () => {
    expect(isFileTooLarge(5 * 1024 * 1024 + 1)).toBe(true);
    expect(isFileTooLarge(10 * 1024 * 1024)).toBe(true);
  });

  it('respects custom limit', () => {
    expect(isFileTooLarge(1024, 1)).toBe(false);
    expect(isFileTooLarge(2 * 1024 * 1024, 1)).toBe(true);
    expect(isFileTooLarge(10 * 1024 * 1024, 10)).toBe(false);
    expect(isFileTooLarge(11 * 1024 * 1024, 10)).toBe(true);
  });
});

describe('getFileTypeDescription', () => {
  it('returns descriptions for known languages', () => {
    expect(getFileTypeDescription('script.js')).toBe('JavaScript');
    expect(getFileTypeDescription('script.ts')).toBe('TypeScript');
    expect(getFileTypeDescription('main.py')).toBe('Python');
    expect(getFileTypeDescription('main.rs')).toBe('Rust');
    expect(getFileTypeDescription('main.go')).toBe('Go');
  });

  it('returns description for unknown languages', () => {
    expect(getFileTypeDescription('file.xyz')).toBe('Plain Text');
  });

  it('handles paths with directories', () => {
    expect(getFileTypeDescription('src/main.rs')).toBe('Rust');
  });
});
